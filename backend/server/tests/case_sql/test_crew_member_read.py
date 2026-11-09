"""G9 R7: crew members may read shared player ids, while outsiders and writes are refused."""

import json
import os
from uuid import UUID

import pytest

from .conftest import PLAYERS, seed_crew

pytestmark = [
    pytest.mark.pg,
    pytest.mark.skipif(os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in database tests"),
]


def authenticate(database, player):
    database.execute("set local role authenticated")
    # A real Supabase token of a GitHub or Google player says is_anonymous false.
    claims = json.dumps({"sub": str(player), "is_anonymous": False})
    database.execute("select set_config('request.jwt.claims', %s, true)", (claims,))


def test_a_member_can_read_player_ids_of_only_their_own_crew(database):
    own = seed_crew(database)
    others = tuple(UUID(int=number) for number in range(11, 15))
    outside = seed_crew(database, players=others)
    authenticate(database, PLAYERS[0])

    rows = database.execute("select crew_id, player_id from public.crew_seats").fetchall()

    assert {crew for crew, _ in rows} == {own}
    assert {player for _, player in rows} == set(PLAYERS)
    assert (
        database.execute(
            "select player_id from public.crew_seats where crew_id = %s", (outside,)
        ).fetchall()
        == []
    )


def test_a_signed_in_player_with_no_seat_cannot_read_any_crew_member_id(database):
    seed_crew(database)
    authenticate(database, UUID(int=999))
    assert database.execute("select player_id from public.crew_seats").fetchall() == []


def test_a_member_cannot_change_shared_player_ids(database):
    import psycopg

    crew = seed_crew(database)
    authenticate(database, PLAYERS[0])
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        database.execute(
            "update public.crew_seats set player_id = %s where crew_id = %s", (PLAYERS[1], crew)
        )
