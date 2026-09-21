#!/usr/bin/env python3
"""Behavioral tests for validate_rca.py."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

VALIDATOR = Path(__file__).with_name("validate_rca.py")


class ValidateRcaTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.checkout = self.root / "checkout"
        self.checkout.mkdir()
        (self.checkout / "src").mkdir()
        (self.checkout / "src/app.ts").write_text("first line\nreturn unavailable\n", encoding="utf-8")
        subprocess.run(["git", "init", "-b", "main", str(self.checkout)], check=True, capture_output=True)
        subprocess.run(
            ["git", "-C", str(self.checkout), "config", "user.email", "test@example.com"],
            check=True,
        )
        subprocess.run(
            ["git", "-C", str(self.checkout), "config", "user.name", "Test"],
            check=True,
        )
        subprocess.run(["git", "-C", str(self.checkout), "add", "."], check=True)
        subprocess.run(
            ["git", "-C", str(self.checkout), "commit", "-m", "fixture"],
            check=True,
            capture_output=True,
        )
        self.commit = subprocess.run(
            ["git", "-C", str(self.checkout), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        self.handoff = self.root / "handoff.json"
        self.handoff.write_text(
            json.dumps(
                {
                    "schemaVersion": 2,
                    "handoffId": "handoff-1",
                    "exportedAt": "2026-08-31T10:10:00.000Z",
                    "incident": {
                        "id": "incident-1",
                        "status": "open",
                        "service": "connect-api",
                        "environment": "local",
                        "incidentScope": "http",
                        "mergedIntoIncidentId": None,
                        "detectedAt": "2026-08-31T10:00:00.000Z",
                        "lastActivityAt": "2026-08-31T10:05:00.000Z",
                        "signalsClearedAt": None,
                        "closure": None,
                    },
                    "occurrences": [],
                    "severity": {
                        "assessedAt": "2026-08-31T10:10:00.000Z",
                        "recommendedSeverity": "alta",
                        "serviceCriticality": "medium",
                        "signals": {},
                        "triggeredRules": [],
                        "observations": [],
                        "limitations": ["logs:truncated"],
                    },
                    "evidence": {
                        "packageId": "evidence-1",
                        "collectedAt": "2026-08-31T10:10:00.000Z",
                        "window": {
                            "start": "2026-08-31T09:55:00.000Z",
                            "end": "2026-08-31T10:10:00.000Z",
                        },
                        "items": [
                            {
                                "id": "logs-1",
                                "source": "logs",
                                "description": "Observed failure",
                                "reference": "http://loki.test/query",
                                "interval": None,
                                "untrusted": True,
                                "data": {},
                            }
                        ],
                        "limitations": [
                            {"source": "logs", "code": "truncated", "description": "limited"}
                        ],
                    },
                    "deploymentContext": {
                        "status": "not_observed",
                        "revisions": [],
                    },
                    "repositoryContext": {
                        "included": False,
                        "checkoutRequiredSeparately": True,
                    },
                }
            ),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def document(self) -> str:
        return f"""# Diagnóstico — connect-api / local

**Incident ID:** `incident-1`
**Severidade recomendada:** `alta`
**Confiança:** `0.80`
**Status da causa:** `hypothesis`

## Diagnóstico

O log registra indisponibilidade (`logs-1`) e o checkout implementa o comportamento
correspondente (`src/app.ts:2`). A relação sustenta uma hipótese, não prova o deployment.

## Evidências-chave

| ID | Fonte | O que sustenta | Referência |
|---|---|---|---|
| `logs-1` | logs | Registra a indisponibilidade observada. | http://loki.test/query |

## Limitações

- `logs:truncated` e correspondência de deployment desconhecida.

## Próxima verificação

- Confirmar a revisão implantada e confrontar o log completo.

## Checkout analisado

- **Branch:** `main`
- **Commit:** `{self.commit}`
- **Estado:** `clean`
- **Correspondência com deployment:** `unknown`
- **Revisão de código analisada:** `{self.commit}`
- **Origem da revisão analisada:** `checkout`
"""

    def observe_revisions(self, *revisions: str, source: str = "vcs.ref.head.revision") -> None:
        handoff = json.loads(self.handoff.read_text(encoding="utf-8"))
        handoff["deploymentContext"] = {
            "status": "observed",
            "revisions": [
                {
                    "service": "connect-api",
                    "repositoryUrl": "https://gitlab.example/sancor/connect-api",
                    "revision": revision,
                    "revisionSource": source,
                    "serviceVersion": revision,
                    "ref": {"name": "main", "type": "branch"},
                    "firstObservedAt": "2026-08-31T09:55:00.000Z",
                    "lastObservedAt": "2026-08-31T10:05:00.000Z",
                    "evidenceIds": ["deployment-1"],
                }
                for revision in revisions
            ],
        }
        self.handoff.write_text(json.dumps(handoff), encoding="utf-8")

    def validate(self, document: str) -> subprocess.CompletedProcess[str]:
        rca = self.root / "diagnosis.md"
        rca.write_text(document, encoding="utf-8")
        return subprocess.run(
            [
                sys.executable,
                str(VALIDATOR),
                str(rca),
                "--handoff",
                str(self.handoff),
                "--checkout",
                str(self.checkout),
            ],
            capture_output=True,
            text=True,
        )

    def test_accepts_a_concise_evidence_linked_diagnosis(self) -> None:
        result = self.validate(self.document())
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("1 evidence items", result.stdout)

    def test_accepts_an_exact_deployment_correspondence(self) -> None:
        self.observe_revisions(self.commit)

        result = self.validate(
            self.document()
            .replace(
                "**Correspondência com deployment:** `unknown`",
                "**Correspondência com deployment:** `exact`",
            )
            .replace(
                "**Origem da revisão analisada:** `checkout`",
                "**Origem da revisão analisada:** `deployment`",
            )
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_rejects_an_incorrect_deployment_correspondence(self) -> None:
        self.observe_revisions(self.commit)

        result = self.validate(self.document())

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("expected exact", result.stdout)

    def test_resolves_a_service_version_tag_to_the_checkout_commit(self) -> None:
        subprocess.run(
            ["git", "-C", str(self.checkout), "tag", "release-local"],
            check=True,
        )
        self.observe_revisions("release-local", source="service.version")

        result = self.validate(
            self.document()
            .replace(
                "**Correspondência com deployment:** `unknown`",
                "**Correspondência com deployment:** `exact`",
            )
            .replace(
                "**Origem da revisão analisada:** `checkout`",
                "**Origem da revisão analisada:** `deployment`",
            )
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_keeps_an_unresolvable_service_version_unknown(self) -> None:
        self.observe_revisions("release-not-present", source="service.version")

        result = self.validate(self.document())

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_accepts_a_mismatched_deployment_correspondence(self) -> None:
        self.observe_revisions("b" * 40)

        result = self.validate(
            self.document().replace(
                "**Correspondência com deployment:** `unknown`",
                "**Correspondência com deployment:** `mismatch`",
            )
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_requires_multiple_revisions_when_more_than_one_was_observed(self) -> None:
        self.observe_revisions(self.commit, "b" * 40)

        result = self.validate(
            self.document().replace(
                "**Correspondência com deployment:** `unknown`",
                "**Correspondência com deployment:** `multiple_revisions`",
            )
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_reads_code_from_an_observed_revision_without_switching_checkout(self) -> None:
        deployed_file = self.checkout / "src/deployed.ts"
        deployed_file.write_text("export const deployed = true\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(self.checkout), "add", "."], check=True)
        subprocess.run(
            ["git", "-C", str(self.checkout), "commit", "-m", "deployed revision"],
            check=True,
            capture_output=True,
        )
        deployed_commit = subprocess.run(
            ["git", "-C", str(self.checkout), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        subprocess.run(
            ["git", "-C", str(self.checkout), "reset", "--hard", self.commit],
            check=True,
            capture_output=True,
        )
        self.observe_revisions(deployed_commit)
        document = (
            self.document()
            .replace("o checkout implementa", "a revisão implantada implementa")
            .replace("`src/app.ts:2`", "`src/deployed.ts:1`")
            .replace(
                "**Correspondência com deployment:** `unknown`",
                "**Correspondência com deployment:** `mismatch`",
            )
            .replace(
                f"**Revisão de código analisada:** `{self.commit}`",
                f"**Revisão de código analisada:** `{deployed_commit}`",
            )
            .replace(
                "**Origem da revisão analisada:** `checkout`",
                "**Origem da revisão analisada:** `deployment`",
            )
        )

        result = self.validate(document)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse(deployed_file.exists())

    def test_rejects_an_incomplete_v2_handoff(self) -> None:
        handoff = json.loads(self.handoff.read_text(encoding="utf-8"))
        del handoff["handoffId"]
        self.handoff.write_text(json.dumps(handoff), encoding="utf-8")

        result = self.validate(self.document())

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("handoffId", result.stdout)

    def test_requires_a_code_citation_for_an_explicit_code_claim(self) -> None:
        result = self.validate(
            self.document().replace(" (`src/app.ts:2`)", "")
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("code claim requires a code citation", result.stdout)

    def test_rejects_a_reference_that_does_not_match_the_handoff(self) -> None:
        result = self.validate(self.document().replace("http://loki.test/query", "http://wrong.test"))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("evidence reference does not match handoff", result.stdout)

    def test_rejects_a_source_that_does_not_match_the_handoff(self) -> None:
        result = self.validate(self.document().replace("| logs |", "| metrics |"))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("evidence source does not match handoff", result.stdout)

    def test_requires_evidence_to_be_cited_inside_the_diagnosis(self) -> None:
        result = self.validate(self.document().replace("(`logs-1`)", "sem citação"))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Diagnóstico must cite at least one evidence ID", result.stdout)

    def test_enforces_the_word_limit(self) -> None:
        oversized = self.document().replace(
            "O log registra indisponibilidade",
            " ".join(["palavra"] * 501),
        )
        result = self.validate(oversized)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("diagnosis exceeds 500 words", result.stdout)

    def test_requires_declared_handoff_limitations(self) -> None:
        result = self.validate(self.document().replace("`logs:truncated`", "logs incompletos"))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("declared handoff limitation is missing", result.stdout)

    def test_rejects_a_code_citation_outside_the_file(self) -> None:
        result = self.validate(self.document().replace("`src/app.ts:2`", "`src/app.ts:99`"))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("code citation line exceeds file", result.stdout)


if __name__ == "__main__":
    unittest.main()
