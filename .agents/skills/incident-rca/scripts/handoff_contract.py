#!/usr/bin/env python3
"""Structural validation for Analyzer RCA handoff schema v2."""

from __future__ import annotations

from typing import Any

EVIDENCE_SOURCES = {"alert", "logs", "metrics", "traces", "deployment"}
REVISION_SOURCES = {"vcs.ref.head.revision", "service.version"}
REF_TYPES = {"branch", "tag"}
DEPLOYMENT_STATUSES = {"observed", "not_observed"}


def _object(value: object, path: str, errors: list[str]) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        errors.append(f"{path} must be an object")
        return None
    return value


def _list(value: object, path: str, errors: list[str]) -> list[Any] | None:
    if not isinstance(value, list):
        errors.append(f"{path} must be an array")
        return None
    return value


def _required(value: dict[str, Any], keys: set[str], path: str, errors: list[str]) -> None:
    for key in sorted(keys - value.keys()):
        errors.append(f"{path} is missing {key}")


def _non_empty_string(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate_handoff(
    value: object, expected_incident_id: str | None = None
) -> list[str]:
    """Return every structural error; an empty list means schema v2 is complete."""
    errors: list[str] = []
    handoff = _object(value, "handoff", errors)
    if handoff is None:
        return errors

    _required(
        handoff,
        {
            "schemaVersion",
            "handoffId",
            "exportedAt",
            "incident",
            "occurrences",
            "severity",
            "evidence",
            "deploymentContext",
            "repositoryContext",
        },
        "handoff",
        errors,
    )
    if handoff.get("schemaVersion") != 2:
        errors.append("handoff.schemaVersion must be 2")
    for key in ("handoffId", "exportedAt"):
        if key in handoff and not _non_empty_string(handoff[key]):
            errors.append(f"handoff.{key} must be a non-empty string")

    incident = _object(handoff.get("incident"), "handoff.incident", errors)
    if incident is not None:
        _required(
            incident,
            {
                "id",
                "status",
                "service",
                "environment",
                "incidentScope",
                "mergedIntoIncidentId",
                "detectedAt",
                "lastActivityAt",
                "signalsClearedAt",
                "closure",
            },
            "handoff.incident",
            errors,
        )
        for key in ("id", "status", "service", "environment", "incidentScope", "detectedAt", "lastActivityAt"):
            if key in incident and not _non_empty_string(incident[key]):
                errors.append(f"handoff.incident.{key} must be a non-empty string")
        if expected_incident_id is not None and incident.get("id") != expected_incident_id:
            errors.append("handoff.incident.id does not match the requested incident")

    occurrences = _list(handoff.get("occurrences"), "handoff.occurrences", errors)
    if occurrences is not None:
        for index, occurrence_value in enumerate(occurrences):
            path = f"handoff.occurrences[{index}]"
            occurrence = _object(occurrence_value, path, errors)
            if occurrence is None:
                continue
            _required(
                occurrence,
                {"id", "status", "alertName", "startedAt", "endedAt", "firingObserved"},
                path,
                errors,
            )

    severity = _object(handoff.get("severity"), "handoff.severity", errors)
    if severity is not None:
        _required(
            severity,
            {
                "assessedAt",
                "recommendedSeverity",
                "serviceCriticality",
                "signals",
                "triggeredRules",
                "observations",
                "limitations",
            },
            "handoff.severity",
            errors,
        )
        for key in ("triggeredRules", "observations", "limitations"):
            if key in severity:
                _list(severity[key], f"handoff.severity.{key}", errors)
        if "signals" in severity:
            _object(severity["signals"], "handoff.severity.signals", errors)

    evidence = _object(handoff.get("evidence"), "handoff.evidence", errors)
    if evidence is not None:
        _required(
            evidence,
            {"packageId", "collectedAt", "window", "items", "limitations"},
            "handoff.evidence",
            errors,
        )
        window = _object(evidence.get("window"), "handoff.evidence.window", errors)
        if window is not None:
            _required(window, {"start", "end"}, "handoff.evidence.window", errors)
        items = _list(evidence.get("items"), "handoff.evidence.items", errors)
        if items is not None:
            if not items:
                errors.append("handoff.evidence.items must not be empty")
            for index, item_value in enumerate(items):
                path = f"handoff.evidence.items[{index}]"
                item = _object(item_value, path, errors)
                if item is None:
                    continue
                _required(
                    item,
                    {"id", "source", "description", "reference", "interval", "untrusted", "data"},
                    path,
                    errors,
                )
                if "source" in item and item["source"] not in EVIDENCE_SOURCES:
                    errors.append(f"{path}.source is invalid")
        if "limitations" in evidence:
            _list(evidence["limitations"], "handoff.evidence.limitations", errors)

    deployment = _object(
        handoff.get("deploymentContext"), "handoff.deploymentContext", errors
    )
    if deployment is not None:
        _required(deployment, {"status", "revisions"}, "handoff.deploymentContext", errors)
        status = deployment.get("status")
        revisions = _list(
            deployment.get("revisions"), "handoff.deploymentContext.revisions", errors
        )
        if status not in DEPLOYMENT_STATUSES:
            errors.append("handoff.deploymentContext.status is invalid")
        if revisions is not None:
            if status == "observed" and not revisions:
                errors.append("observed deploymentContext must contain revisions")
            if status == "not_observed" and revisions:
                errors.append("not_observed deploymentContext must not contain revisions")
            for index, revision_value in enumerate(revisions):
                path = f"handoff.deploymentContext.revisions[{index}]"
                revision = _object(revision_value, path, errors)
                if revision is None:
                    continue
                _required(
                    revision,
                    {
                        "service",
                        "repositoryUrl",
                        "revision",
                        "revisionSource",
                        "serviceVersion",
                        "ref",
                        "firstObservedAt",
                        "lastObservedAt",
                        "evidenceIds",
                    },
                    path,
                    errors,
                )
                if "revision" in revision and not _non_empty_string(revision["revision"]):
                    errors.append(f"{path}.revision must be a non-empty string")
                if revision.get("revisionSource") not in REVISION_SOURCES:
                    errors.append(f"{path}.revisionSource is invalid")
                ref = _object(revision.get("ref"), f"{path}.ref", errors)
                if ref is not None:
                    _required(ref, {"name", "type"}, f"{path}.ref", errors)
                    if ref.get("type") is not None and ref.get("type") not in REF_TYPES:
                        errors.append(f"{path}.ref.type is invalid")
                if "evidenceIds" in revision:
                    _list(revision["evidenceIds"], f"{path}.evidenceIds", errors)

    repository = _object(
        handoff.get("repositoryContext"), "handoff.repositoryContext", errors
    )
    if repository is not None:
        _required(
            repository,
            {"included", "checkoutRequiredSeparately"},
            "handoff.repositoryContext",
            errors,
        )
        if repository.get("included") is not False:
            errors.append("handoff.repositoryContext.included must be false")
        if repository.get("checkoutRequiredSeparately") is not True:
            errors.append(
                "handoff.repositoryContext.checkoutRequiredSeparately must be true"
            )

    return errors
