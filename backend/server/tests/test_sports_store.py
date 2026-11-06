"""Bounded PostgREST cursor reads, private player scope and defensive sports RPC replies."""

import asyncio
from uuid import UUID

import pytest

from server.errors import ApiError
from server.sports.service import refusal
from server.sports.store import SportsStore
from server.supabase_admin import SupabaseRejected
from server.tests.test_sports_api import PLAYER, ScriptedDatabase, stake_row


class PagedDatabase:
    def __init__(self, count):
        self.count, self.reads = count, []

    async def select_rows(self, table, query):
        self.reads.append((table, query))
        start = int(query.get("id", "gt.0")[3:]) + 1
        return [
            stake_row(number, player=str(UUID(int=number)), amount=1)
            for number in range(start, min(start + 1000, self.count + 1))
        ]


def test_default_1000_row_server_cap_cannot_truncate_a_sports_pool():
    database = PagedDatabase(2000)
    stakes = asyncio.run(SportsStore(database).stakes(["fd-101"]))
    assert len(stakes) == 2000 and stakes[-1].id == 2000
    assert [query.get("id") for _, query in database.reads] == [None, "gt.1000", "gt.2000"]
    assert all(query["limit"] == "1000" for _, query in database.reads)


def test_more_than_10000_stakes_fails_closed_before_any_settlement_can_use_the_list():
    with pytest.raises(SupabaseRejected):
        asyncio.run(SportsStore(PagedDatabase(10001)).stakes(["fd-101"]))


def test_malformed_or_cross_player_stake_rows_are_rejected():
    class UnscopedDatabase(ScriptedDatabase):
        async def select_rows(self, table, query):
            return self.stakes

    database = UnscopedDatabase()
    database.stakes = [stake_row(player="another")]
    with pytest.raises(SupabaseRejected):
        asyncio.run(SportsStore(database).mine(PLAYER))
    database.stakes = [stake_row() | {"amount": True}]
    with pytest.raises(SupabaseRejected):
        asyncio.run(SportsStore(database).stake_for_uid(PLAYER, "sportsuid01"))


@pytest.mark.parametrize(
    "reply",
    [
        {},
        {"status": "done", "id": True, "coins": 1, "amount": 1, "stakedToday": 1},
        {"status": "refused"},
        {"status": "done", "id": 1, "coins": 1, "amount": 1, "stakedToday": 1},
    ],
)
def test_malformed_stake_replies_become_generic_database_errors(reply):
    database = ScriptedDatabase()
    database.reply = reply
    with pytest.raises(SupabaseRejected):
        asyncio.run(
            SportsStore(database).run(
                "sports_place_stake",
                {
                    "p_fixture_id": "fd-101",
                    "p_pick": "home",
                    "p_amount": 1,
                },
            )
        )


@pytest.mark.parametrize(
    "raw,code,status",
    [
        ("fixture_closed", "pool_closed", 409),
        ("player_missing", "player_not_set_up", 404),
        ("fixture_missing", "no_such_fixture", 404),
        ("stake_id_conflict", "stake_id_conflict", 409),
    ],
)
def test_database_refusal_vocabulary_maps_to_the_published_api(raw, code, status):
    with pytest.raises(ApiError) as failure:
        refusal({"status": "refused", "reason": raw})
    assert failure.value.code == code and failure.value.status_code == status
