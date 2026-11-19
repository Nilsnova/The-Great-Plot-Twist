"""Read-only journal capacity planning for T60 reviewers and deployment operators.

This tool never connects to a database or deletes history. Supply a source-pinned
measurement and explicit capacity controls; a refused plan cannot authorize rollout.
"""

import argparse
import json
import re
from pathlib import Path


def positive_integer(value: object, name: str) -> int:
    if type(value) is not int or value < 1:
        raise ValueError(f"{name} must be a positive integer.")
    return value


def plan_capacity(
    measurement: dict,
    *,
    source_commit: str,
    retained_waves: int,
    events_per_wave: int,
    storage_budget_bytes: int,
    event_budget: int,
    safety_factor: int,
) -> dict:
    """Reserve whole allocated bytes conservatively without proposing destructive retention."""
    if not isinstance(source_commit, str) or not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise ValueError("source_commit must be one exact lowercase Git commit.")
    controls = {
        "retainedWaves": retained_waves,
        "eventsPerWave": events_per_wave,
        "storageBudgetBytes": storage_budget_bytes,
        "eventBudget": event_budget,
        "safetyFactor": safety_factor,
    }
    for name, value in controls.items():
        positive_integer(value, name)
    events = positive_integer(measurement.get("journalEvents"), "journalEvents")
    allocated = positive_integer(measurement.get("allocatedBytes"), "allocatedBytes")
    # Relation allocation includes the scratch sample's indexes/overhead; rounding
    # upward avoids treating payload size alone as a complete storage forecast.
    bytes_per_event = (allocated + events - 1) // events
    forecast_events = retained_waves * events_per_wave
    reserved = forecast_events * bytes_per_event * safety_factor
    reasons = []
    if measurement.get("sourceCommit") != source_commit:
        reasons.append("measurement_source_mismatch")
    if reserved > storage_budget_bytes:
        reasons.append("storage_budget_exceeded")
    if forecast_events > event_budget:
        reasons.append("event_budget_exceeded")
    return {
        "status": "blocked" if reasons else "within_budget",
        "reasons": reasons,
        "sourceCommit": source_commit,
        "controls": controls,
        "forecast": {
            "retainedEvents": forecast_events,
            "bytesPerEventUpperEstimate": bytes_per_event,
            "reservedBytes": reserved,
            "safetyFactor": safety_factor,
        },
        "retention": {
            "action": "retain_all",
            "destructiveOperations": 0,
            "automaticCleanup": False,
        },
        "constraints": {
            "durableCrossWorkerEventCap": False,
            "productionCapacityGuarantee": False,
            "newWaveAdmissionMustBeReviewedBeforeRollout": True,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("measurement", type=Path)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--retained-waves", type=int, required=True)
    parser.add_argument("--events-per-wave", type=int, required=True)
    parser.add_argument("--storage-budget-bytes", type=int, required=True)
    parser.add_argument("--event-budget", type=int, required=True)
    parser.add_argument("--safety-factor", type=int, required=True)
    arguments = vars(parser.parse_args())
    path = arguments.pop("measurement")
    try:
        result = plan_capacity(json.loads(path.read_text()), **arguments)
    except (OSError, ValueError, TypeError, AttributeError) as error:
        parser.error(str(error))
    print(json.dumps(result, indent=2))
    return 2 if result["status"] == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
