#!/usr/bin/env python3
"""Validate a concise Markdown diagnosis against its handoff and checkout."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from handoff_contract import validate_handoff

SEVERITIES = {"informativa", "baixa", "media", "alta", "critica", "inconclusiva"}
CAUSE_STATUSES = {"hypothesis", "insufficient_context"}
SECTIONS = [
    "Diagnóstico",
    "Evidências-chave",
    "Limitações",
    "Próxima verificação",
    "Checkout analisado",
]
EVIDENCE_ID_RE = re.compile(r"`([A-Za-z]+-\d+)`")
CODE_CITATION_RE = re.compile(r"`([^`\s]+):(\d+)`")
CODE_CLAIM_RE = re.compile(
    r"\b(?:checkout|c[oó]digo|implementa[cç][aã]o|revis[aã]o implantada)\b"
    r".{0,120}\b(?:confirma|demonstra|mostra|implementa|transforma|retorna|lan[cç]a)\b",
    flags=re.IGNORECASE | re.DOTALL,
)


@dataclass(frozen=True)
class CheckoutState:
    branch: str
    commit: str
    state: str


def section_text(text: str, heading: str) -> str:
    match = re.search(
        rf"^## {re.escape(heading)}\s*$\n(.*?)(?=^## |\Z)",
        text,
        flags=re.MULTILINE | re.DOTALL,
    )
    return "" if match is None else match.group(1).strip()


def metadata_value(text: str, label: str) -> str | None:
    match = re.search(rf"^\*\*{re.escape(label)}:\*\* `([^`]+)`\s*$", text, re.MULTILINE)
    return None if match is None else match.group(1)


def bullet_count(value: str) -> int:
    return len(re.findall(r"^\s*[-*]\s+", value, re.MULTILINE))


def evidence_rows(value: str) -> tuple[list[tuple[str, str, str, str]], list[str]]:
    rows: list[tuple[str, str, str, str]] = []
    errors: list[str] = []
    table_lines = [line.strip() for line in value.splitlines() if line.strip().startswith("|")]
    if len(table_lines) < 2:
        return rows, ["Evidências-chave must contain a Markdown table"]
    if [cell.strip() for cell in table_lines[0].strip("|").split("|")] != [
        "ID",
        "Fonte",
        "O que sustenta",
        "Referência",
    ]:
        errors.append("Evidências-chave table header does not match the contract")

    for line in table_lines[2:]:
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) != 4:
            errors.append("each evidence row must contain exactly four columns")
            continue
        match = re.fullmatch(r"`([A-Za-z]+-\d+)`", cells[0])
        if match is None:
            errors.append(f"invalid evidence ID cell: {cells[0]}")
            continue
        rows.append((match.group(1), cells[1], cells[2], cells[3]))
    return rows, errors


def git_output(checkout: Path, *arguments: str) -> str:
    return subprocess.run(
        ["git", "-C", str(checkout), *arguments],
        check=True,
        capture_output=True,
        text=True,
        timeout=5,
    ).stdout.strip()


def checkout_state(checkout: Path) -> CheckoutState:
    try:
        inside = git_output(checkout, "rev-parse", "--is-inside-work-tree")
    except (OSError, subprocess.SubprocessError):
        inside = "false"
    if inside != "true":
        return CheckoutState("not_available", "not_available", "not_a_git_repository")

    commit = git_output(checkout, "rev-parse", "HEAD")
    branch = git_output(checkout, "branch", "--show-current") or "detached"
    state = "dirty" if git_output(checkout, "status", "--porcelain") else "clean"
    return CheckoutState(branch, commit, state)


def resolve_revision(checkout: Path, revision: str) -> str | None:
    try:
        return git_output(checkout, "rev-parse", "--verify", "--end-of-options", f"{revision}^{{commit}}")
    except (OSError, subprocess.SubprocessError):
        return None


def deployment_identifiers(handoff: dict[str, object]) -> dict[str, str]:
    context = handoff.get("deploymentContext")
    if not isinstance(context, dict) or context.get("status") != "observed":
        return {}
    revisions = context.get("revisions")
    if not isinstance(revisions, list):
        return {}

    unique: dict[str, str] = {}
    for revision in revisions:
        if not isinstance(revision, dict):
            continue
        identifier = revision.get("revision")
        source = revision.get("revisionSource")
        if not isinstance(identifier, str) or source not in {
            "vcs.ref.head.revision",
            "service.version",
        }:
            continue
        if identifier not in unique or source == "vcs.ref.head.revision":
            unique[identifier] = source
    return unique


def deployment_correspondence(
    handoff: dict[str, object], checkout: Path, checkout_commit: str
) -> str:
    identifiers = deployment_identifiers(handoff)
    if not identifiers:
        return "unknown"
    if len(identifiers) > 1:
        return "multiple_revisions"

    identifier, source = next(iter(identifiers.items()))
    resolved = resolve_revision(checkout, identifier)
    if identifier == checkout_commit or resolved == checkout_commit:
        return "exact"
    if source == "vcs.ref.head.revision" or re.fullmatch(r"[0-9a-fA-F]{7,64}", identifier):
        return "mismatch"
    return "unknown"


def analysis_revision(
    handoff: dict[str, object], checkout: Path, state: CheckoutState
) -> tuple[str, str]:
    identifiers = deployment_identifiers(handoff)
    if len(identifiers) == 1:
        identifier = next(iter(identifiers))
        resolved = resolve_revision(checkout, identifier)
        if resolved is not None:
            return resolved, "deployment"
    if state.commit != "not_available":
        return state.commit, "checkout"
    return "not_available", "not_available"


def revision_file(checkout: Path, revision: str, relative: Path) -> str | None:
    try:
        return subprocess.run(
            [
                "git",
                "-C",
                str(checkout),
                "show",
                "--no-ext-diff",
                "--end-of-options",
                f"{revision}:{relative.as_posix()}",
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("rca", type=Path)
    parser.add_argument("--handoff", required=True, type=Path)
    parser.add_argument("--checkout", required=True, type=Path)
    args = parser.parse_args()
    errors: list[str] = []

    try:
        text = args.rca.read_text(encoding="utf-8")
        handoff = json.loads(args.handoff.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}")
        return 1

    if not isinstance(handoff, dict):
        print("ERROR: handoff must be a JSON object")
        return 1
    contract_errors = validate_handoff(handoff)
    if contract_errors:
        for error in contract_errors:
            print(f"ERROR: {error}")
        return 1

    checkout = args.checkout.resolve()
    if not checkout.is_dir():
        errors.append("checkout must be a readable directory")

    incident = handoff.get("incident", {})
    incident_id = incident.get("id")
    service = incident.get("service")
    environment = incident.get("environment")
    if not all(isinstance(value, str) and value for value in [incident_id, service, environment]):
        errors.append("handoff incident must contain id, service and environment")
    elif f"# Diagnóstico — {service} / {environment}" not in text.splitlines()[:1]:
        errors.append("diagnosis title does not match handoff service and environment")

    if metadata_value(text, "Incident ID") != incident_id:
        errors.append("incident ID does not match the handoff")

    severity = handoff.get("severity", {}).get("recommendedSeverity")
    if severity not in SEVERITIES:
        errors.append("handoff recommended severity is invalid")
    if metadata_value(text, "Severidade recomendada") != severity:
        errors.append("recommended severity does not match the handoff")

    confidence_text = metadata_value(text, "Confiança")
    try:
        confidence = float(confidence_text) if confidence_text is not None else -1
    except ValueError:
        confidence = -1
    if not 0 <= confidence <= 1:
        errors.append("confidence must be a number between 0.0 and 1.0")

    cause_status = metadata_value(text, "Status da causa")
    if cause_status not in CAUSE_STATUSES:
        errors.append("cause status must be hypothesis or insufficient_context")

    headings = re.findall(r"^## (.+?)\s*$", text, re.MULTILINE)
    if headings != SECTIONS:
        errors.append("sections must match the contract exactly and remain in order")

    word_count = len(text.split())
    if word_count > 500:
        errors.append(f"diagnosis exceeds 500 words: {word_count}")

    handoff_items = {
        item.get("id"): item
        for item in handoff.get("evidence", {}).get("items", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    if not handoff_items:
        errors.append("handoff evidence.items must not be empty")

    diagnosis = section_text(text, "Diagnóstico")
    diagnosis_ids = set(EVIDENCE_ID_RE.findall(diagnosis))
    diagnosis_code_citations = CODE_CITATION_RE.findall(diagnosis)
    if CODE_CLAIM_RE.search(diagnosis) is not None and not diagnosis_code_citations:
        errors.append("explicit code claim requires a code citation in Diagnóstico")
    if not diagnosis_ids:
        errors.append("Diagnóstico must cite at least one evidence ID")
    for evidence_id in diagnosis_ids:
        if evidence_id not in handoff_items:
            errors.append(f"evidence ID not found in handoff: {evidence_id}")

    rows, row_errors = evidence_rows(section_text(text, "Evidências-chave"))
    errors.extend(row_errors)
    if not 1 <= len(rows) <= 5:
        errors.append("Evidências-chave must contain between one and five evidence rows")
    row_ids = [row[0] for row in rows]
    if len(row_ids) != len(set(row_ids)):
        errors.append("Evidências-chave contains duplicate evidence IDs")
    if set(row_ids) != diagnosis_ids:
        errors.append("evidence table IDs must exactly match IDs cited in Diagnóstico")

    for evidence_id, source, support, reference in rows:
        item = handoff_items.get(evidence_id)
        if item is None:
            errors.append(f"evidence ID not found in handoff: {evidence_id}")
            continue
        if source != item.get("source"):
            errors.append(f"evidence source does not match handoff: {evidence_id}")
        if reference != item.get("reference"):
            errors.append(f"evidence reference does not match handoff: {evidence_id}")
        if not support:
            errors.append(f"evidence support is empty: {evidence_id}")

    limitations = section_text(text, "Limitações")
    limitations_count = bullet_count(limitations)
    if not 1 <= limitations_count <= 3:
        errors.append("Limitações must contain between one and three bullets")
    declared_limitations = {
        f"{item.get('source')}:{item.get('code')}"
        for item in handoff.get("evidence", {}).get("limitations", [])
        if isinstance(item, dict) and item.get("source") and item.get("code")
    }
    declared_limitations.update(
        value
        for value in handoff.get("severity", {}).get("limitations", [])
        if isinstance(value, str) and value
    )
    for limitation in declared_limitations:
        if limitation not in limitations:
            errors.append(f"declared handoff limitation is missing: {limitation}")

    verification_count = bullet_count(section_text(text, "Próxima verificação"))
    if not 1 <= verification_count <= 3:
        errors.append("Próxima verificação must contain between one and three bullets")

    if checkout.is_dir():
        state = checkout_state(checkout)
        correspondence = deployment_correspondence(handoff, checkout, state.commit)
        analyzed_revision, analyzed_origin = analysis_revision(handoff, checkout, state)
        expected_checkout_values = {
            "Branch": state.branch,
            "Commit": state.commit,
            "Estado": state.state,
            "Correspondência com deployment": correspondence,
            "Revisão de código analisada": analyzed_revision,
            "Origem da revisão analisada": analyzed_origin,
        }
        checkout_section = section_text(text, "Checkout analisado")
        for label, expected in expected_checkout_values.items():
            match = re.search(
                rf"^\s*[-*]\s+\*\*{re.escape(label)}:\*\* `([^`]+)`\s*$",
                checkout_section,
                re.MULTILINE,
            )
            if match is None or match.group(1) != expected:
                errors.append(f"checkout {label.lower()} does not match: expected {expected}")

        for path, line_text in CODE_CITATION_RE.findall(text):
            relative = Path(path)
            line = int(line_text)
            if relative.is_absolute() or ".." in relative.parts or line < 1:
                errors.append(f"invalid code citation: {path}:{line}")
                continue
            candidate = (checkout / relative).resolve()
            try:
                candidate.relative_to(checkout)
            except ValueError:
                errors.append(f"code citation escapes checkout: {path}:{line}")
                continue

            if analyzed_origin == "deployment":
                content = revision_file(checkout, analyzed_revision, relative)
                if content is None:
                    errors.append(
                        f"code citation file not found in analyzed revision: {path}"
                    )
                    continue
                line_count = len(content.splitlines())
            else:
                if not candidate.is_file():
                    errors.append(f"code citation file not found: {path}")
                    continue
                try:
                    line_count = sum(
                        1 for _ in candidate.open(encoding="utf-8", errors="replace")
                    )
                except OSError:
                    errors.append(f"code citation file is unreadable: {path}")
                    continue
            if line > line_count:
                errors.append(f"code citation line exceeds file: {path}:{line}")

    if errors:
        for error in dict.fromkeys(errors):
            print(f"ERROR: {error}")
        return 1

    print(f"Incident diagnosis is valid ({word_count} words, {len(rows)} evidence items)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
