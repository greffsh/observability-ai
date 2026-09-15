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
                    "schemaVersion": 1,
                    "incident": {
                        "id": "incident-1",
                        "service": "connect-api",
                        "environment": "local",
                    },
                    "severity": {
                        "recommendedSeverity": "alta",
                        "limitations": ["logs:truncated"],
                    },
                    "evidence": {
                        "items": [
                            {
                                "id": "logs-1",
                                "source": "logs",
                                "reference": "http://loki.test/query",
                            }
                        ],
                        "limitations": [
                            {"source": "logs", "code": "truncated", "description": "limited"}
                        ],
                    },
                    "repositoryContext": {"included": False},
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
"""

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
