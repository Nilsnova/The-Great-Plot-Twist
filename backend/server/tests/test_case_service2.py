"""Phase 2 service writes preserve pure decisions, retries, private extras and fresh views."""

import asyncio
from dataclasses import replace

import pytest

from server.game.case_snapshot import Signal
from server.game.station_lookup import IsletStations, NoStations
from server.settings import Settings
from server.supabase_admin import SupabaseRejected
from server.tests.case_rule_helpers import PLAYER
from server.tests.case_service2_helpers import intent, scenario


@pytest.mark.parametrize(
    "kind,reply",
    [
        ("pin", {"status": "done", "coinsPaid": 50, "revision": 5}),
        (
            "pair",
            {"status": "formed", "payouts": [{"playerId": PLAYER, "paid": 200}], "revision": 5},
        ),
        ("nightfall", {"status": "done", "nightNo": 1, "endsSecond": 1200, "revision": 5}),
        ("post", {"status": "done", "onPostSecond": 60, "revision": 5}),
        ("signal", {"status": "locked", "parted": False, "revision": 5}),
    ],
)
def test_accepted_intents_write_once_refresh_and_send_only_the_version(kind, reply):
    service, store, sender, targets = scenario(kind, reply)
    answer = asyncio.run(intent(service, kind, targets))
    assert answer["accepted"] and answer["reason"] is None
    assert answer["case"] == {"writeRevision": 5}
    assert store.trace == ["lookup", "snapshot", kind, "snapshot"]
    assert sender.events == [(store.current.crew_id, "board_changed", {"version": 5})]
    if kind == "pair":
        assert answer["coinsPaid"] == 200
        assert set(answer["deduction"]) == {
            "id",
            "name",
            "finding",
            "clearLine",
            "opens",
            "opensLine",
        }
        assert "payouts" not in answer
    if kind == "signal":
        sent = store.writes[0][1][-1]
        assert sent == round(round(targets[1], 1) % 360, 1)


@pytest.mark.parametrize("kind", ["pin", "pair", "nightfall", "post", "signal"])
def test_repeats_precede_rule_and_target_checks_even_for_finished_crews(kind):
    service, store, sender, targets = scenario(kind, {})
    target, outcome = {
        "pin": (targets[0] if targets else None, "pinned"),
        "pair": (service.data.deductions[0].id, "formed"),
        "nightfall": (None, "night"),
        "post": (targets[0] if targets else None, "climbing"),
        "signal": (targets[0] if targets else None, "locked"),
    }[kind]
    store.current = replace(store.current, status="finished")
    store.actions[(PLAYER, "intent0001")] = {
        "crewId": store.current.crew_id,
        "kind": kind,
        "target": target,
        "outcome": outcome,
    }
    invalid = (
        ()
        if kind == "nightfall"
        else (
            ("unknown", "unknown")
            if kind == "pair"
            else (("unknown", 0) if kind == "signal" else ("unknown",))
        )
    )
    answer = asyncio.run(intent(service, kind, invalid))
    assert answer["accepted"] and answer["repeat"]
    assert set(answer) == {"accepted", "reason", "message", "repeat", "case"}
    assert store.trace == ["lookup", "snapshot"] and store.writes == [] and sender.events == []


@pytest.mark.parametrize("kind", ["pin", "pair", "nightfall", "post", "signal"])
def test_ordinary_rule_refusals_write_and_notify_nothing(kind):
    service, store, sender, targets = scenario(kind, {})
    changes = {
        "pin": {"finds": ()},
        "pair": {"pins": ()},
        "nightfall": {"formed": ()},
        "post": {"night_no": 0},
        "signal": {"posts": ()},
    }
    store.current = replace(store.current, **changes[kind])
    answer = asyncio.run(intent(service, kind, targets))
    assert not answer["accepted"]
    assert store.writes == [] and sender.events == []


@pytest.mark.parametrize("kind,status", [("pair", "wrong_pair"), ("signal", "off_target")])
def test_false_but_writing_results_are_logged_notified_and_remain_false_on_retry(kind, status):
    service, store, sender, targets = scenario(
        kind, {"status": status, "seconds": 30, "revision": 5}, wrong=True
    )
    answer = asyncio.run(intent(service, kind, targets))
    assert answer["accepted"] is False and answer["reason"] == status
    assert answer["seconds"] == 30 and answer["case"]["writeRevision"] == 5
    assert len(store.writes) == len(sender.events) == 1
    store.actions[(PLAYER, "intent0001")] = {
        "crewId": store.current.crew_id,
        "kind": kind,
        "target": targets[0],
        "outcome": status,
    }
    repeated = asyncio.run(intent(service, kind, targets))
    assert repeated["accepted"] is False and repeated["reason"] == status and repeated["repeat"]
    assert "seconds" not in repeated and len(store.writes) == len(sender.events) == 1


def test_case_open_retries_once_and_a_second_closed_result_is_a_database_error():
    for second in (
        {"status": "done", "coinsPaid": 0, "revision": 5},
        {"status": "refused", "reason": "case_not_open"},
    ):
        service, store, sender, targets = scenario("pin", {})
        store.replies = [{"status": "refused", "reason": "case_not_open"}, second]
        if second["status"] == "done":
            assert asyncio.run(intent(service, "pin", targets))["accepted"]
            assert len(sender.events) == 1
        else:
            with pytest.raises(SupabaseRejected):
                asyncio.run(intent(service, "pin", targets))
            assert sender.events == []
        assert store.trace.count("open") == 1 and len(store.writes) == 2


def test_sql_state_race_is_private_crew_busy_and_does_not_write_again():
    from server.errors import ApiError

    service, store, sender, targets = scenario(
        "pin", {"status": "refused", "reason": "seat_changed"}
    )
    with pytest.raises(ApiError) as error:
        asyncio.run(intent(service, "pin", targets))
    assert error.value.status_code == 409 and len(store.writes) == 1 and sender.events == []


@pytest.mark.parametrize("kind,reason", [("pair", "pair_cooldown"), ("signal", "aim_cooldown")])
def test_locked_sql_refusals_override_the_earlier_python_decision_without_a_hint(kind, reason):
    service, store, sender, targets = scenario(
        kind, {"status": "refused", "reason": reason, "seconds": 7}
    )
    answer = asyncio.run(intent(service, kind, targets))
    assert not answer["accepted"] and answer["reason"] == reason and answer["seconds"] == 7
    assert "{seconds}" not in answer["message"]
    assert len(store.writes) == 1 and sender.events == []


def test_repeat_found_under_the_sql_lock_uses_the_stored_outcome_and_sends_no_hint():
    service, store, sender, targets = scenario("pin", {})
    store.replies = [
        {
            "status": "repeat",
            "crewId": store.current.crew_id,
            "kind": "pin",
            "target": targets[0],
            "outcome": "pinned",
        }
    ]
    answer = asyncio.run(intent(service, "pin", targets))
    assert answer["accepted"] and answer["repeat"] and "coinsPaid" not in answer
    assert len(store.writes) == 1 and sender.events == []


@pytest.mark.parametrize(
    "reply",
    [{"status": "opened", "revision": 5}, {"status": "done", "coinsPaid": 50, "revision": True}],
)
def test_bad_intent_status_or_revision_cannot_become_a_success_or_nudge(reply):
    service, _, sender, targets = scenario("pin", reply)
    with pytest.raises(SupabaseRejected):
        asyncio.run(intent(service, "pin", targets))
    assert sender.events == []


def test_parting_uses_fresh_locks_and_returns_the_crew_seeded_target():
    service, store, _, targets = scenario(
        "signal", {"status": "locked", "parted": True, "revision": 5}
    )
    signals = tuple(
        Signal(light.id, index, PLAYER, 1, 0, True, 0, 90, parted=True)
        for index, light in enumerate(service.data.active_lights, 1)
    )
    store.after_write = lambda current: replace(current, signals=signals, schooner_found_second=0)
    answer = asyncio.run(intent(service, "signal", targets))
    assert answer["parted"] and len(answer["lights"]) == service.data.night.lights_needed
    assert set(answer["target"]) == {"x", "y"}


def test_direct_service_is_station_free_but_factory_uses_l2_and_forwards_the_port(monkeypatch):
    from server.game.case_service import case_or_none

    service, _, _, _ = scenario("pin", {})
    assert isinstance(service.stations, NoStations)
    factory = case_or_none(Settings(), clock=service.clock)
    assert isinstance(factory.stations, IsletStations)
    assert factory.clock is service.clock
    seen = []
    monkeypatch.setattr(
        "server.game.case_service.CaseStore", lambda admin, *, stations: seen.append(stations)
    )
    service.store_for = type(service).store_for.__get__(service)
    service.store_for(None)
    assert seen == [service.stations]
