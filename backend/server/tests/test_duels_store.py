"""Tests for duels/store.py: the reads, the three database functions and their replies.

No network: the database is a fake transport (make_admin). The tests look at what the server
SENDS (the address of every read, the arguments of every function) and at how it READS the
answers, including odd ones, which must become a 502 and never a guess.
"""

import asyncio
import json
from datetime import UTC, datetime

import httpx
import pytest

from server.duels import rules
from server.duels.rules import resolve
from server.duels.store import (
    DUEL_COLUMNS,
    AnswerOutcome,
    CreateOutcome,
    DuelRow,
    Envelope,
    VoidOutcome,
    answer_arguments,
    create_arguments,
    create_uid_exists,
    read_answer_reply,
    read_balance,
    read_create_reply,
    read_duel,
    read_envelope,
    read_my_duels,
    read_names,
    read_open_challenges,
    read_void_reply,
    row_to_duel,
    to_time,
    to_whole_number,
    void_arguments,
)
from server.supabase_admin import SupabaseRejected
from server.tests.helpers import make_admin

NOW = datetime(2026, 11, 6, 10, 0, tzinfo=UTC)
DUEL_ID = "6f1c0c2e-9a52-4b8e-8d3a-0a7c3f1d2b44"
ALICE = "11111111-1111-4111-8111-111111111111"
BOB = "22222222-2222-4222-8222-222222222222"

SIGNALS = ("flash", "shade", "shade", "mirror", "shade")
ANSWER = ("mirror", "flash", "shade", "shade", "mirror")

DUEL_ROW = {
    "id": DUEL_ID,
    "challenger_id": ALICE,
    "opponent_id": BOB,
    "is_open": False,
    "rounds": 5,
    "stake": 100,
    "cut_percent": 5,
    "status": "open",
    "outcome": None,
    "round_results": None,
    "created_at": "2026-11-06T10:00:00+00:00",
    "expires_at": "2026-11-07T10:00:00+00:00",
    "answered_at": None,
    "closed_at": None,
}

FINISHED_ROW = {
    **DUEL_ROW,
    "status": "finished",
    "outcome": "opponent",
    "round_results": ["opponent", "opponent", "even", "opponent", "challenger"],
    "answered_at": "2026-11-06T10:04:12.250000+00:00",
    "closed_at": "2026-11-06T10:04:12.250000+00:00",
}


def run(coroutine):
    return asyncio.run(coroutine)


def database_saying(body, status: int = 200):
    """A fake database that answers every request with `body`. Returns the admin and the log."""
    return make_admin(lambda request: httpx.Response(status, json=body))


def asked(seen) -> dict:
    """The query of the one request that was sent, as a plain dictionary."""
    assert len(seen) == 1
    return dict(seen[0].url.params)


def sent_body(seen) -> dict:
    return json.loads(seen[0].content)


# --- numbers and times from the database ---


@pytest.mark.parametrize("value", [5, 5.0, 0])
def test_a_whole_number_is_accepted(value):
    assert to_whole_number(value) == int(value)


@pytest.mark.parametrize("value", [5.5, True, "5", None])
def test_something_that_is_not_a_whole_number_is_refused(value):
    with pytest.raises(SupabaseRejected):
        to_whole_number(value)


def test_a_time_with_a_timezone_is_read():
    assert to_time("2026-11-06T10:00:00+00:00") == NOW


@pytest.mark.parametrize("value", ["2026-11-06T10:00:00", "yesterday", 5, None])
def test_a_time_without_a_timezone_or_that_is_not_text_is_refused(value):
    with pytest.raises(SupabaseRejected):
        to_time(value)


# --- a row of duels ---


def test_a_row_of_duels_becomes_a_duel_row():
    assert row_to_duel(DUEL_ROW) == DuelRow(
        id=DUEL_ID,
        challenger_id=ALICE,
        opponent_id=BOB,
        is_open=False,
        rounds=5,
        stake=100,
        cut_percent=5,
        status="open",
        outcome=None,
        round_results=None,
        created_at=NOW,
        expires_at=datetime(2026, 11, 7, 10, 0, tzinfo=UTC),
        answered_at=None,
        closed_at=None,
    )


def test_a_finished_row_keeps_its_outcome_results_and_times():
    duel = row_to_duel(FINISHED_ROW)

    assert duel.status == "finished"
    assert duel.outcome == "opponent"
    assert duel.round_results == ("opponent", "opponent", "even", "opponent", "challenger")
    assert duel.closed_at == datetime(2026, 11, 6, 10, 4, 12, 250000, tzinfo=UTC)


def test_an_open_challenge_row_has_no_opponent_yet():
    duel = row_to_duel({**DUEL_ROW, "is_open": True, "opponent_id": None})

    assert duel.is_open is True
    assert duel.opponent_id is None


@pytest.mark.parametrize("missing", list(DUEL_ROW))
def test_a_row_with_a_missing_column_is_refused(missing):
    row = {name: value for name, value in DUEL_ROW.items() if name != missing}

    with pytest.raises(SupabaseRejected):
        row_to_duel(row)


@pytest.mark.parametrize(
    "odd",
    [
        {"status": "cancelled"},
        {"status": None},
        {"is_open": "false"},
        {"rounds": "5"},
        {"stake": 10.5},
        {"created_at": "2026-11-06T10:00:00"},
        {"round_results": "opponent"},
        {"round_results": [1, 2, 3]},
        {"id": 7},
        {"outcome": 3},
    ],
)
def test_a_row_with_an_odd_value_is_refused(odd):
    with pytest.raises(SupabaseRejected):
        row_to_duel({**DUEL_ROW, **odd})


# --- what each read asks for ---


def test_the_duel_columns_hold_no_secret():
    assert "signal" not in DUEL_COLUMNS
    assert "create_uid" not in DUEL_COLUMNS
    assert DUEL_COLUMNS.split(",") == list(DUEL_ROW)


def test_reading_one_duel_asks_for_its_columns_and_that_id_only():
    admin, seen = database_saying([DUEL_ROW])

    duel = run(read_duel(admin, DUEL_ID))

    assert duel.id == DUEL_ID
    assert asked(seen) == {"select": DUEL_COLUMNS, "id": f"eq.{DUEL_ID}", "limit": "1"}
    assert seen[0].url.path.endswith("/rest/v1/duels")


def test_a_duel_that_is_not_there_is_none():
    admin, _ = database_saying([])

    assert run(read_duel(admin, DUEL_ID)) is None


def test_the_repeat_check_looks_for_this_challenger_and_this_create_uid():
    admin, seen = database_saying([{"id": DUEL_ID}])

    exists = run(create_uid_exists(admin, ALICE, "q7x2k9m4ab"))

    assert exists is True
    assert asked(seen) == {
        "select": "id",
        "challenger_id": f"eq.{ALICE}",
        "create_uid": "eq.q7x2k9m4ab",
        "limit": "1",
    }


def test_a_new_create_uid_is_not_a_repeat():
    admin, _ = database_saying([])

    assert run(create_uid_exists(admin, ALICE, "q7x2k9m4ab")) is False


def test_my_duels_are_read_in_both_roles_newest_first_with_a_limit():
    admin, seen = database_saying([DUEL_ROW, FINISHED_ROW])

    duels = run(read_my_duels(admin, ALICE))

    assert [duel.status for duel in duels] == ["open", "finished"]
    assert asked(seen) == {
        "select": DUEL_COLUMNS,
        "or": f"(challenger_id.eq.{ALICE},opponent_id.eq.{ALICE})",
        "order": "created_at.desc",
        "limit": str(rules.MY_DUELS_LIMIT),
    }


def test_the_open_challenges_of_other_captains_are_still_open_and_not_expired():
    admin, seen = database_saying([{**DUEL_ROW, "is_open": True, "opponent_id": None}])

    duels = run(read_open_challenges(admin, BOB, NOW))

    assert len(duels) == 1
    assert asked(seen) == {
        "select": DUEL_COLUMNS,
        "status": "eq.open",
        "is_open": "eq.true",
        "challenger_id": f"neq.{BOB}",
        "expires_at": f"gt.{NOW.isoformat()}",
        "order": "created_at.desc",
        "limit": str(rules.OPEN_CHALLENGES_LIMIT),
    }


def test_an_envelope_is_read_for_one_duel_and_one_captain_in_round_order():
    rows = [
        {"round_no": number, "signal": signal, "action_uid": "q7x2k9m4ab"}
        for number, signal in enumerate(SIGNALS, start=1)
    ]
    admin, seen = database_saying(rows)

    envelope = run(read_envelope(admin, DUEL_ID, ALICE))

    assert envelope == Envelope(signals=SIGNALS, action_uid="q7x2k9m4ab")
    assert asked(seen) == {
        "select": "round_no,signal,action_uid",
        "duel_id": f"eq.{DUEL_ID}",
        "player_id": f"eq.{ALICE}",
        "order": "round_no.asc",
        "limit": "5",
    }
    assert seen[0].url.path.endswith("/rest/v1/duel_moves")


def test_no_envelope_is_an_empty_one():
    admin, _ = database_saying([])

    envelope = run(read_envelope(admin, DUEL_ID, BOB))

    assert envelope == Envelope(signals=(), action_uid=None)
    assert envelope.is_sealed is False


def test_a_sealed_envelope_knows_it_is_sealed():
    assert Envelope(signals=SIGNALS, action_uid="q7x2k9m4ab").is_sealed is True


@pytest.mark.parametrize(
    "rows",
    [
        [{"round_no": 2, "signal": "flash", "action_uid": "q7x2k9m4ab"}],  # round 1 is missing
        [{"round_no": 1, "signal": "sparkle", "action_uid": "q7x2k9m4ab"}],
        [{"round_no": 1, "signal": "flash"}],
        [{"round_no": "1", "signal": "flash", "action_uid": "q7x2k9m4ab"}],
        [
            {"round_no": 1, "signal": "flash", "action_uid": "q7x2k9m4ab"},
            {"round_no": 2, "signal": "shade", "action_uid": "another-uid"},
        ],
    ],
)
def test_an_odd_envelope_is_refused(rows):
    admin, _ = database_saying(rows)

    with pytest.raises(SupabaseRejected):
        run(read_envelope(admin, DUEL_ID, ALICE))


def test_names_are_read_for_each_captain_once():
    admin, seen = database_saying(
        [{"id": ALICE, "display_name": "Brave Puffin 17"}, {"id": BOB, "display_name": "Bob"}]
    )

    names = run(read_names(admin, [BOB, ALICE, BOB, None]))

    assert names == {ALICE: "Brave Puffin 17", BOB: "Bob"}
    assert asked(seen) == {
        "select": "id,display_name",
        "id": f"in.({ALICE},{BOB})",
        "limit": "2",
    }


def test_no_captains_means_no_read():
    admin, seen = database_saying([])

    assert run(read_names(admin, [None])) == {}
    assert seen == []


def test_the_balance_is_read_for_the_verified_player_only():
    admin, seen = database_saying([{"balance": 900}])

    assert run(read_balance(admin, ALICE)) == 900
    assert asked(seen) == {"select": "balance", "player_id": f"eq.{ALICE}", "limit": "1"}


def test_a_player_without_a_wallet_is_refused():
    admin, _ = database_saying([])

    with pytest.raises(SupabaseRejected):
        run(read_balance(admin, ALICE))


# --- the arguments of the three functions ---


def test_duel_create_gets_the_agreed_arguments_with_the_numbers_of_the_rules():
    arguments = create_arguments(ALICE, "Captain-3fa85f", 5, 100, SIGNALS, "q7x2k9m4ab")

    assert arguments == {
        "p_challenger_id": ALICE,
        "p_opponent_name": "Captain-3fa85f",
        "p_rounds": 5,
        "p_stake": 100,
        "p_cut_percent": rules.CUT_PERCENT,
        "p_signals": list(SIGNALS),
        "p_create_uid": "q7x2k9m4ab",
        "p_answer_hours": rules.ANSWER_HOURS,
        "p_max_waiting": rules.MAX_WAITING,
    }


def test_an_open_challenge_sends_no_name():
    arguments = create_arguments(ALICE, None, 3, 0, ("shade", "shade", "shade"), "q7x2k9m4ab")

    assert arguments["p_opponent_name"] is None


def test_duel_answer_gets_the_results_worked_out_in_python():
    resolution = resolve(SIGNALS, ANSWER)

    arguments = answer_arguments(DUEL_ID, BOB, ANSWER, "z81kq0p3dd", resolution, NOW)

    assert arguments == {
        "p_duel_id": DUEL_ID,
        "p_player_id": BOB,
        "p_signals": list(ANSWER),
        "p_action_uid": "z81kq0p3dd",
        "p_round_results": ["opponent", "opponent", "even", "opponent", "challenger"],
        "p_outcome": "opponent",
        "p_day_start": NOW.isoformat(),
        "p_pair_daily_limit": rules.PAIR_DAILY_LIMIT,
    }


def test_duel_void_gets_the_duel_the_player_and_the_new_status():
    assert void_arguments(DUEL_ID, ALICE, "withdrawn") == {
        "p_duel_id": DUEL_ID,
        "p_player_id": ALICE,
        "p_new_status": "withdrawn",
    }


def test_the_arguments_are_plain_json():
    resolution = resolve(SIGNALS, ANSWER)

    json.dumps(create_arguments(ALICE, None, 5, 100, SIGNALS, "q7x2k9m4ab"))
    json.dumps(answer_arguments(DUEL_ID, BOB, ANSWER, "z81kq0p3dd", resolution, NOW))
    json.dumps(void_arguments(DUEL_ID, ALICE, "expired"))


# --- the replies of the three functions ---


def test_a_done_reply_of_duel_create_is_read():
    reply = {
        "status": "done",
        "duelId": DUEL_ID,
        "opponentId": BOB,
        "opponentName": "Captain-3fa85f",
        "balance": 900,
    }

    assert read_create_reply(reply) == CreateOutcome(done=True, duel_id=DUEL_ID, balance=900)


def test_a_refused_reply_of_duel_create_carries_its_reason():
    reply = {"status": "refused", "reason": "too_many_waiting"}

    assert read_create_reply(reply) == CreateOutcome(done=False, reason="too_many_waiting")


def test_a_done_reply_of_duel_answer_is_read():
    reply = {"status": "done", "balance": 990, "winnerTakes": 190}

    assert read_answer_reply(reply) == AnswerOutcome(done=True, balance=990, winner_takes=190)


def test_a_refused_reply_of_duel_answer_carries_its_reason():
    reply = {"status": "refused", "reason": "duel_taken"}

    assert read_answer_reply(reply) == AnswerOutcome(done=False, reason="duel_taken")


def test_a_done_reply_of_duel_void_is_read():
    reply = {"status": "done", "refunded": 100, "challengerBalance": 1000}

    assert read_void_reply(reply) == VoidOutcome(done=True, refunded=100, challenger_balance=1000)


def test_a_refused_reply_of_duel_void_carries_its_reason():
    reply = {"status": "refused", "reason": "not_expired"}

    assert read_void_reply(reply) == VoidOutcome(done=False, reason="not_expired")


ODD_REPLIES = [
    None,
    [],
    "done",
    {},
    {"status": "maybe"},
    {"status": "refused"},
    {"status": "refused", "reason": 7},
    {"status": "done"},
    {"status": "done", "duelId": 7, "balance": 900},
    {"status": "done", "duelId": DUEL_ID, "balance": "900"},
    {"status": "done", "balance": 990, "winnerTakes": 1.5},
    {"status": "done", "refunded": 100, "challengerBalance": None},
]


@pytest.mark.parametrize("reply", ODD_REPLIES)
@pytest.mark.parametrize("reader", [read_create_reply, read_answer_reply, read_void_reply])
def test_an_odd_reply_is_refused_and_never_guessed(reader, reply):
    with pytest.raises(SupabaseRejected):
        reader(reply)
