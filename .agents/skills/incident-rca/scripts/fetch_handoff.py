#!/usr/bin/env python3
"""Fetch an Analyzer RCA handoff without exposing the operator token."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from uuid import UUID

SKILL_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = SKILL_DIR.parents[2]


def dotenv_values(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return values

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        if key:
            values[key] = value
    return values


def configuration() -> tuple[str, str]:
    file_values = dotenv_values(PROJECT_ROOT / ".env")

    def configured(name: str) -> str | None:
        return os.environ.get(name) or file_values.get(name)

    token = configured("ANALYZER_OPERATOR_TOKEN")
    if not token:
        raise ValueError(
            "ANALYZER_OPERATOR_TOKEN is missing; export it or configure it in the grafana-ai .env"
        )

    analyzer_url = configured("ANALYZER_URL")
    if not analyzer_url:
        port = configured("ANALYZER_PORT") or "8080"
        analyzer_url = f"http://localhost:{port}"

    return analyzer_url.rstrip("/"), token


def parse_incident_id(value: str) -> str:
    try:
        parsed = UUID(value)
    except ValueError as error:
        raise ValueError("incident_id must be a UUID") from error
    if str(parsed) != value.lower():
        raise ValueError("incident_id must use canonical UUID format")
    return str(parsed)


def fetch_handoff(analyzer_url: str, token: str, incident_id: str) -> dict[str, object]:
    endpoint = f"{analyzer_url}/v1/incidents/{quote(incident_id, safe='')}/rca-handoff"
    request = Request(
        endpoint,
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )

    try:
        with urlopen(request, timeout=30) as response:
            body = response.read()
    except HTTPError as error:
        raise RuntimeError(f"Analyzer returned HTTP {error.code}") from error
    except URLError as error:
        raise RuntimeError(f"Analyzer is unavailable at {analyzer_url}: {error.reason}") from error

    try:
        handoff = json.loads(body)
    except json.JSONDecodeError as error:
        raise RuntimeError("Analyzer returned invalid JSON") from error

    if not isinstance(handoff, dict):
        raise RuntimeError("Analyzer returned a handoff that is not a JSON object")
    if handoff.get("schemaVersion") != 1:
        raise RuntimeError("Analyzer returned an unsupported handoff schema")
    incident = handoff.get("incident")
    if not isinstance(incident, dict) or incident.get("id") != incident_id:
        raise RuntimeError("Analyzer handoff incident ID does not match the requested incident")
    repository_context = handoff.get("repositoryContext")
    if not isinstance(repository_context, dict) or repository_context.get("included") is not False:
        raise RuntimeError("Analyzer handoff unexpectedly includes repository context")
    evidence = handoff.get("evidence")
    if not isinstance(evidence, dict) or not isinstance(evidence.get("items"), list) or not evidence["items"]:
        raise RuntimeError("Analyzer handoff does not contain evidence items")

    return handoff


def output_path(requested: Path | None, incident_id: str, handoff: dict[str, object]) -> Path:
    if requested is not None:
        return requested

    preferred = Path.cwd() / f"rca-handoff-{incident_id}.json"
    if not preferred.exists():
        return preferred

    handoff_id = handoff.get("handoffId")
    suffix = handoff_id if isinstance(handoff_id, str) and handoff_id else "new"
    return Path.cwd() / f"rca-handoff-{incident_id}-{suffix}.json"


def write_atomically(path: Path, handoff: dict[str, object]) -> None:
    path = path.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(handoff, ensure_ascii=False, indent=2) + "\n"
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(content)
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("incident_id")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    try:
        incident_id = parse_incident_id(args.incident_id)
        analyzer_url, token = configuration()
        handoff = fetch_handoff(analyzer_url, token, incident_id)
        destination = output_path(args.output, incident_id, handoff)
        write_atomically(destination, handoff)
    except (OSError, ValueError, RuntimeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(destination.resolve())
    return 0


if __name__ == "__main__":
    sys.exit(main())
