#!/usr/bin/env python3
"""Behavioral tests for fetch_handoff.py."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

FETCHER = Path(__file__).with_name("fetch_handoff.py")
INCIDENT_ID = "66abe742-b7b8-45d7-b2dd-2540e869796a"


class AnalyzerHandler(BaseHTTPRequestHandler):
    response_status = 200
    response_incident_id = INCIDENT_ID
    authorization: str | None = None
    content_type: str | None = None
    requested_path: str | None = None

    def do_POST(self) -> None:  # noqa: N802
        type(self).authorization = self.headers.get("Authorization")
        type(self).content_type = self.headers.get("Content-Type")
        type(self).requested_path = self.path
        body = json.dumps(
            {
                "schemaVersion": 1,
                "handoffId": "handoff-1",
                "incident": {
                    "id": type(self).response_incident_id,
                    "service": "connect",
                    "environment": "local",
                },
                "severity": {"recommendedSeverity": "alta"},
                "evidence": {"items": [{"id": "logs-1"}], "limitations": []},
                "repositoryContext": {"included": False, "checkoutRequiredSeparately": True},
            }
        ).encode()
        self.send_response(type(self).response_status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


class FetchHandoffTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        AnalyzerHandler.response_status = 200
        AnalyzerHandler.response_incident_id = INCIDENT_ID
        AnalyzerHandler.authorization = None
        AnalyzerHandler.content_type = None
        AnalyzerHandler.requested_path = None
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), AnalyzerHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.environment = {
            **os.environ,
            "ANALYZER_URL": f"http://127.0.0.1:{self.server.server_port}",
            "ANALYZER_OPERATOR_TOKEN": "operator-secret",
        }

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temporary_directory.cleanup()

    def run_fetcher(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(FETCHER), *arguments],
            cwd=self.root,
            env=self.environment,
            capture_output=True,
            text=True,
        )

    def test_fetches_valid_handoff_with_operator_authentication(self) -> None:
        result = self.run_fetcher(INCIDENT_ID)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        destination = Path(result.stdout.strip())
        self.assertEqual(json.loads(destination.read_text())["incident"]["id"], INCIDENT_ID)
        self.assertEqual(AnalyzerHandler.authorization, "Bearer operator-secret")
        self.assertIsNone(AnalyzerHandler.content_type)
        self.assertEqual(
            AnalyzerHandler.requested_path,
            f"/v1/incidents/{INCIDENT_ID}/rca-handoff",
        )

    def test_preserves_an_existing_snapshot(self) -> None:
        existing = self.root / f"rca-handoff-{INCIDENT_ID}.json"
        existing.write_text("original", encoding="utf-8")

        result = self.run_fetcher(INCIDENT_ID)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(existing.read_text(encoding="utf-8"), "original")
        self.assertEqual(Path(result.stdout.strip()).name, f"rca-handoff-{INCIDENT_ID}-handoff-1.json")

    def test_rejects_a_mismatched_incident(self) -> None:
        AnalyzerHandler.response_incident_id = "11111111-1111-4111-8111-111111111111"

        result = self.run_fetcher(INCIDENT_ID)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not match", result.stderr)
        self.assertNotIn("operator-secret", result.stderr)

    def test_rejects_non_uuid_incident_id_before_calling_analyzer(self) -> None:
        result = self.run_fetcher("incident-1")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must be a UUID", result.stderr)
        self.assertIsNone(AnalyzerHandler.requested_path)


if __name__ == "__main__":
    unittest.main()
