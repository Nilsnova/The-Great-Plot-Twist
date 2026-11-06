"""Database refusals and historical Phase 2 outcomes retain their public message and truth."""

import pytest

from server.game.case_answers import refusal_answer, repeat_answer
from server.game.case_data import load_case
from server.supabase_admin import SupabaseRejected


@pytest.mark.parametrize(
    "reason", ["pair_cooldown", "wrong_pair", "dawn_wait", "aim_cooldown", "off_target"]
)
def test_database_wait_messages_are_formatted_from_the_authoritative_seconds(reason):
    answer = refusal_answer(load_case(), "pair", None, {"reason": reason, "seconds": 7})
    assert answer["accepted"] is False and answer["seconds"] == 7
    assert "{seconds}" not in answer["message"]


@pytest.mark.parametrize("seconds", [None, True, -1, "7"])
def test_bad_database_waits_are_generic_errors(seconds):
    with pytest.raises(SupabaseRejected):
        refusal_answer(load_case(), "pair", None, {"reason": "pair_cooldown", "seconds": seconds})


def test_station_refusal_uses_the_building_message():
    data = load_case()
    light = next(
        light for light in data.night.lights if light.ready.get("building") == "signal_station"
    )
    answer = refusal_answer(data, "post", light.id, {"reason": "light_not_ready"})
    assert "signal station" in answer["message"]


def test_unknown_historical_deduction_is_a_generic_database_error():
    with pytest.raises(SupabaseRejected):
        repeat_answer(load_case(), {"kind": "pair", "target": "unknown", "outcome": "formed"})
