"""The local station lookup accepts only a small canonical, bound player UUID list.

Used by: the adapter gate and the opt-in real PostgreSQL check. Other columns and
malformed PostgREST list syntax keep failing closed.
"""

import asyncio
import os
from uuid import UUID

import pytest

from server.supabase_admin import SupabaseRejected
from tools.local_admin import LocalAdmin, filter_parts
from tools.local_database import ScratchDatabase
from tools.local_players import PLAYERS

IDS = tuple(str(UUID(int=number)) for number in range(1, 6))


@pytest.mark.parametrize("count", [1, 2, 3, 4])
def test_station_batch_accepts_one_to_four_canonical_player_ids(count):
    expression = "in.(" + ",".join(IDS[:count]) + ")"
    assert filter_parts({"player_id"}, "player_id", expression) == (
        "in",
        [UUID(value) for value in IDS[:count]],
    )


@pytest.mark.parametrize(
    "expression",
    [
        "in.()",
        "in.(,)",
        "in.(" + ",".join(IDS) + ")",
        "in.(not_a_uuid)",
        f"in.({IDS[0]},)",
        f"in.(,{IDS[0]})",
        f"in.({IDS[0]}, {IDS[1]})",
        f'in.("{IDS[0]}")',
        f"in.({IDS[0]});select",
        f"in.[{IDS[0]}]",
        "in.(" + IDS[0].replace("-", "") + ")",
        "in.(AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA)",
        None,
    ],
)
def test_station_batch_rejects_empty_oversized_malformed_and_noncanonical_lists(expression):
    with pytest.raises(SupabaseRejected):
        filter_parts({"player_id"}, "player_id", expression)


@pytest.mark.parametrize("column", ["id", "crew_id", "unknown"])
def test_uuid_lists_are_not_general_filters_for_other_columns(column):
    with pytest.raises(SupabaseRejected):
        filter_parts({column}, column, f"in.({IDS[0]})")


@pytest.mark.skipif(
    os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in disposable PostgreSQL check"
)
def test_uuid_list_reads_only_bound_selected_players_from_actual_postgresql():
    pytest.importorskip("pgserver")
    pytest.importorskip("psycopg")
    database = ScratchDatabase()
    database.start()
    try:
        rows = asyncio.run(
            LocalAdmin(database).select_rows(
                "wallets",
                {
                    "select": "player_id",
                    "player_id": f"in.({PLAYERS[0].id},{PLAYERS[2].id})",
                    "order": "player_id.asc",
                },
            )
        )
        assert rows == [{"player_id": PLAYERS[0].id}, {"player_id": PLAYERS[2].id}]
        with pytest.raises(SupabaseRejected):
            asyncio.run(
                LocalAdmin(database).select_rows(
                    "wallets",
                    {
                        "select": "player_id",
                        "player_id": f"in.({PLAYERS[0].id}) or true",
                    },
                )
            )
    finally:
        database.close()
