"""The case database port is player-scoped, strict about replies and safe on unique violations."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.flags import parse_flags
from server.game.case_store import CaseStore, run_function
from server.settings import Settings
from server.supabase_admin import AlreadyApplied, SupabaseRejected
from server.tests.case_api_helpers import HEADER, TestVerifier
from server.tests.case_rule_helpers import FRIEND, PLAYER, snapshot
from server.tests.helpers import assert_error


def stored_crew():
    crew = snapshot()
    return {
        "id": crew.crew_id,
        "code": None,
        "status": "active",
        "mode": "crew",
        "version": 1,
        "started_at": crew.started_at.isoformat(),
        "crew_seats": [
            {
                "seat_no": seat.seat_no,
                "player_id": seat.player_id,
                "npc_id": seat.npc_id,
                "kit": seat.kit,
                "profiles": {"display_name": seat.name} if seat.player_id else None,
            }
            for seat in crew.seats
        ],
        "case_state": {
            "crew_id": crew.crew_id,
            "started_at": crew.started_at.isoformat(),
            "revision": 1,
            "pair_wait_until": 0,
            "accuse_wait_until": 0,
            "schooner_found_second": None,
            "solved_second": None,
            "solved_by": None,
            "world_outcome": None,
        },
        "case_finds": [],
        "case_deductions": [],
        "case_accusations": [],
        "case_solvers": [],
    }


class RowsDatabase:
    def __init__(self):
        self.tables = {
            "case_actions": [],
            "crew_seats": [{"crew_id": snapshot().crew_id, "crews": {"status": "active"}}],
            "crews": [stored_crew()],
            "entry_profiles": [{"read_log": False}],
            "wallets": [{"balance": 1000}],
        }
        self.reads = []
        self.reply = {"status": "opened"}

    async def select_rows(self, table, query):
        self.reads.append((table, query))
        return self.tables[table]

    async def call_function(self, name, params):
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


def test_action_lookup_is_filtered_by_both_verified_player_and_uid():
    database = RowsDatabase()
    assert asyncio.run(CaseStore(database).action_lookup(PLAYER, "search0001")) is None
    table, query = database.reads[0]
    assert table == "case_actions"
    assert query["player_id"] == f"eq.{PLAYER}" and query["action_uid"] == "eq.search0001"


def test_snapshot_scopes_the_crew_and_reads_only_the_viewers_profile_and_wallet():
    database = RowsDatabase()
    result = asyncio.run(CaseStore(database).snapshot(PLAYER))
    assert result is not None and result.coins == 1000 and result.seat_for_player(PLAYER)
    for table, query in database.reads:
        if table in ("crew_seats", "entry_profiles", "wallets"):
            assert query["player_id"] == f"eq.{PLAYER}"
        if table == "crews":
            assert query["id"] == f"eq.{snapshot().crew_id}"


def test_open_crew_wins_over_a_newer_finished_crew():
    database = RowsDatabase()
    database.tables["crew_seats"].insert(
        0, {"crew_id": "old-finished", "crews": {"status": "finished"}}
    )
    assert asyncio.run(CaseStore(database).crew_for_player(PLAYER)) == snapshot().crew_id


def test_a_viewer_without_a_seat_cannot_read_a_selected_crew():
    database = RowsDatabase()
    database.tables["crews"][0]["crew_seats"] = []
    assert asyncio.run(CaseStore(database).snapshot(PLAYER, snapshot().crew_id)) is None


def test_a_solver_row_from_another_crew_is_refused_before_building_a_reveal():
    database = RowsDatabase()
    database.tables["crews"][0]["case_solvers"] = [
        {
            "crew_id": "another-crew",
            "player_id": PLAYER,
            "seat_no": 1,
            "kit": "informant",
            "contributor": True,
            "share": 500,
            "share_paid": 500,
            "solved_second": 0,
        }
    ]
    with pytest.raises(SupabaseRejected):
        asyncio.run(CaseStore(database).snapshot(PLAYER))


@pytest.mark.parametrize(
    "table", ["case_actions", "crew_seats", "crews", "entry_profiles", "wallets"]
)
def test_malformed_table_members_are_private_database_errors(table):
    database = RowsDatabase()
    database.tables[table] = [None]
    app = create_app(
        Settings(flags=parse_flags("case"), demo_mode=True), verifier=TestVerifier(), admin=database
    )
    client = TestClient(app)
    response = (
        client.post(
            "/api/case/search",
            headers=HEADER,
            json={"routeId": "C1.notice_board", "actionUid": "search0001"},
        )
        if table == "case_actions"
        else client.get("/api/case", headers=HEADER)
    )
    assert_error(response, 502, "database_error")
    assert response.headers["cache-control"] == "private, no-store"


def test_a_unique_violation_is_a_database_error_not_a_wallet_repeat():
    database = RowsDatabase()
    database.reply = AlreadyApplied()
    with pytest.raises(SupabaseRejected) as problem:
        asyncio.run(run_function(database, "case_open", {}))
    assert problem.value.status_code == 502


@pytest.mark.parametrize(
    "reply",
    [
        None,
        [],
        {"status": "unknown"},
        {"status": "refused"},
        {"status": "done", "now": 1},
        {"status": "done", "now": True, "revision": 1},
        {"status": "solved", "revision": 1, "payouts": [None]},
    ],
)
def test_unreadable_rpc_replies_are_database_errors(reply):
    database = RowsDatabase()
    database.reply = reply
    with pytest.raises(SupabaseRejected):
        asyncio.run(run_function(database, "case_start_route", {}))


def test_a_profile_of_another_player_is_never_used_to_mark_read_log():
    database = RowsDatabase()
    database.tables["entry_profiles"] = [{"read_log": True}]
    result = asyncio.run(CaseStore(database).snapshot(PLAYER))
    assert result.seat_for_player(PLAYER).read_log
    assert not result.seat_for_player(FRIEND).read_log
