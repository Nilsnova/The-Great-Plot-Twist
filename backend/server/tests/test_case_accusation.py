"""Accusations enforce the shared order and a one-minute wait without exposing an answer."""

from dataclasses import replace

import pytest

from server.errors import ApiError
from server.game.case_accusation import decide_accusation
from server.game.case_data import load_case
from server.game.case_snapshot import Formed
from server.tests.case_rule_helpers import snapshot


def ready(data):
    return replace(
        snapshot(),
        schooner_found_second=0,
        formed=tuple(Formed(value, 0) for value in data.accusation.needs_deductions),
    )


def test_accusation_needs_the_evidence_and_the_schooner():
    data = load_case()
    assert decide_accusation(data, snapshot(), "unknown", 0).reason == "schooner_required"
    crew = replace(snapshot(), schooner_found_second=0)
    assert decide_accusation(data, crew, "unknown", 0).reason == "evidence_required"
    for missing in data.accusation.needs_deductions:
        crew = replace(
            ready(data),
            formed=tuple(item for item in ready(data).formed if item.deduction_id != missing),
        )
        assert decide_accusation(data, crew, "unknown", 0).reason == "evidence_required"


def test_wrong_accusation_only_costs_a_minute():
    data = load_case()
    crew = ready(data)
    wrong = next(item for item in data.suspects if item.id != data.accusation.culprit)
    refusal = decide_accusation(data, crew, wrong.id, 0)
    assert refusal.reason == "accusation_refused" and refusal.seconds == 60
    assert wrong.refused_line in refusal.message
    waiting = replace(crew, accuse_wait_until=60)
    assert (
        decide_accusation(data, waiting, data.accusation.culprit, 59).reason
        == "accusation_cooldown"
    )
    assert decide_accusation(data, waiting, data.accusation.culprit, 60).accepted


def test_accusation_checks_run_in_the_fixed_order():
    data = load_case()
    crew = replace(snapshot(), solved_second=0, accuse_wait_until=60)
    assert decide_accusation(data, crew, "unknown", 0).reason == "already_solved"
    crew = replace(ready(data), accuse_wait_until=60)
    assert decide_accusation(data, crew, "unknown", 0).reason == "accusation_cooldown"
    with pytest.raises(ApiError) as problem:
        decide_accusation(data, ready(data), "unknown", 0)
    assert problem.value.code == "no_such_suspect"


def test_the_right_suspect_is_accepted_once():
    data = load_case()
    assert decide_accusation(data, ready(data), data.accusation.culprit, 0).accepted
    assert (
        decide_accusation(
            data, replace(ready(data), solved_second=0), data.accusation.culprit, 0
        ).reason
        == "already_solved"
    )
