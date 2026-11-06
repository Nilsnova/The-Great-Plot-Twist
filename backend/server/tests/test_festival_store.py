"""Private festival rows and RPC replies fail closed instead of leaking queued signals or owners."""

import asyncio

import pytest

from server.festival.store import FestivalStore, checked_reply
from server.supabase_admin import SupabaseRejected

PLAYER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
QUEUE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


@pytest.mark.parametrize(
    "raw",
    (
        None,
        [],
        "not a reply",
        {},
        {"status": "done", "accepted": 1, "reason": None, "outcome": "queued", "repeat": False},
        {"status": "done", "accepted": True, "reason": {}, "outcome": "queued", "repeat": False},
        {"status": "done", "accepted": True, "reason": None, "outcome": [], "repeat": False},
        {"status": "done", "accepted": True, "reason": None, "outcome": "claimed", "repeat": False},
        {"status": "done", "accepted": True, "reason": None, "outcome": "queued", "repeat": False},
        {
            "status": "done",
            "accepted": True,
            "reason": None,
            "outcome": "paired",
            "repeat": False,
            "queueId": QUEUE,
        },
        {"status": "refused", "accepted": False, "reason": "untrusted text", "repeat": False},
        {
            "status": "refused",
            "accepted": False,
            "reason": "in_duel",
            "repeat": False,
            "signals": ["shade"] * 3,
        },
    ),
)
def test_unexpected_replies_fail_without_returning_their_contents(raw):
    with pytest.raises(SupabaseRejected):
        checked_reply(raw)


class Rows:
    def __init__(self, rows):
        self.rows, self.seen = rows, []

    async def select_rows(self, table, query):
        self.seen.append((table, query))
        return self.rows

    async def call_function(self, name, args):
        self.seen.append((name, args))
        return self.rows


@pytest.mark.parametrize(
    "row",
    (
        {"player_id": OTHER, "action_uid": "click001", "kind": "join", "reply": {}},
        {"player_id": PLAYER, "action_uid": "wronguid", "kind": "join", "reply": {}},
        {"player_id": PLAYER, "action_uid": "click001", "kind": "not_a_kind", "reply": {}},
    ),
)
def test_stored_receipts_must_belong_to_the_verified_player_uid_and_known_kind(row):
    admin = Rows([row])
    with pytest.raises(SupabaseRejected):
        asyncio.run(FestivalStore(admin).receipt(PLAYER, "click001"))
    assert admin.seen[0][1]["player_id"] == f"eq.{PLAYER}"
    assert admin.seen[0][1]["action_uid"] == "eq.click001"
    assert admin.seen[0][1]["limit"] == "1"


def test_another_players_queue_row_is_rejected_and_signals_are_not_selected():
    admin = Rows([{"id": QUEUE, "player_id": OTHER, "state": "queued", "duel_id": None}])
    with pytest.raises(SupabaseRejected):
        asyncio.run(FestivalStore(admin).mine(PLAYER))
    assert "signals" not in admin.seen[0][1]["select"]


@pytest.mark.parametrize(
    "signals", (["flash"] * 3, ["unknown"] * 3, ["shade"] * 4, [["shade"]] * 3)
)
def test_invalid_sealed_candidate_sequences_never_reach_a7_resolution(signals):
    admin = Rows({"candidate": {"id": QUEUE, "playerId": OTHER, "signals": signals}})
    with pytest.raises(SupabaseRejected):
        asyncio.run(FestivalStore(admin).candidate(PLAYER))


def test_normalized_race_replies_cannot_be_mistaken_for_a_completed_action():
    assert checked_reply({"status": "state_changed"}) == {
        "status": "state_changed",
        "accepted": False,
        "reason": "state_changed",
        "repeat": False,
    }
