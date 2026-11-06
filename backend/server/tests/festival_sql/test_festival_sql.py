"""Real festival timing, durable receipts, private claims and atomic A7 pairing checks."""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from threading import Barrier
from uuid import UUID

import pytest

from server.duels.rules import resolve
from server.tests.case_sql.conftest import as_owner, as_server, rpc

pytestmark = pytest.mark.skipif(
    os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in scratch PostgreSQL"
)
MIGRATION = Path(__file__).resolve().parents[4] / "supabase/migrations/20261106160000_festival.sql"
PLAYERS = tuple(UUID(int=number) for number in range(10, 14))
LAMPS = tuple(f"festival_lamp_{number:02}" for number in range(1, 13))
SIGNALS = ("flash", "mirror", "shade")
OTHER_SIGNALS = ("shade", "flash", "mirror")
TABLES = ("festival_control", "festival_actions", "festival_claims", "festival_queue")
FUNCTIONS = (
    "festival_phase",
    "festival_finish",
    "festival_begin",
    "festival_ring_candidate",
    "festival_claim",
    "festival_ring_leave",
    "festival_ring_join",
)


def prepare(database, *, active=True):
    database.execute("insert into public.world_state (id) values (1) on conflict do nothing")
    for player in PLAYERS:
        database.execute("insert into auth.users (id) values (%s)", (player,))
    if active:
        database.execute(
            "update public.world_state set stage = 'relit', "
            "relit_at = clock_timestamp() - interval '1 hour', "
            "solves = 1, extra_lights = 2 where id = 1"
        )
    as_server(database)


def claim(database, *, player=PLAYERS[0], uid="claim001", lamp=LAMPS[0]):
    return rpc(database, "festival_claim", player, uid, lamp)


def candidate(database, player):
    return rpc(database, "festival_ring_candidate", player)["candidate"]


def join(database, *, player=PLAYERS[0], uid="join0001", signals=SIGNALS, expected="read"):
    first = candidate(database, player) if expected == "read" else expected
    resolution = resolve(tuple(first["signals"]), signals) if first else None
    return rpc(
        database,
        "festival_ring_join",
        player,
        uid,
        list(signals),
        first["id"] if first else None,
        list(resolution.round_results) if resolution else None,
        resolution.outcome if resolution else None,
        datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0),
    )


def test_full_chain_applies_twice_and_reapply_preserves_claims_actions_and_queue(database):
    prepare(database)
    claimed, queued = claim(database), join(database)
    as_owner(database)
    database.execute(MIGRATION.read_text())
    as_server(database)
    assert claim(database) == {**claimed, "repeat": True}
    assert join(database) == {**queued, "repeat": True}
    assert database.execute("select count(*) from public.festival_actions").fetchone() == (2,)
    assert database.execute("select count(*) from public.wallet_transactions").fetchone() == (0,)


def test_the_original_relighting_controls_waiting_active_and_exact_end(database):
    prepare(database, active=False)
    assert rpc(database, "festival_phase") == "waiting"
    first = claim(database)
    assert first["reason"] == "festival_waiting" and not first["accepted"]
    as_owner(database)
    database.execute(
        "update public.world_state set stage = 'relit', "
        "relit_at = clock_timestamp() - interval '47 hours 59 minutes 59 seconds', "
        "solves = 1 where id = 1"
    )
    as_server(database)
    assert rpc(database, "festival_phase") == "active"
    assert claim(database, uid="claim002")["accepted"]
    as_owner(database)
    database.execute(
        "update public.world_state set "
        "relit_at = clock_timestamp() - interval '48 hours' where id = 1"
    )
    as_server(database)
    assert rpc(database, "festival_phase") == "ended"
    assert claim(database, uid="claim003", lamp=LAMPS[1])["reason"] == "festival_ended"
    assert claim(database, uid="claim002", lamp=LAMPS[1])["outcome"] == "claimed"
    assert claim(database, uid="claim001")["reason"] == "festival_waiting"


def test_claims_are_exclusive_not_one_total_and_never_light_or_reward(database):
    prepare(database)
    first = claim(database)
    assert first["outcome"] == "claimed"
    assert claim(database, player=PLAYERS[1])["reason"] == "lamp_occupied"
    assert claim(database, uid="claim002")["outcome"] == "already_claimed"
    assert claim(database, uid="claim003", lamp=LAMPS[1])["outcome"] == "claimed"
    assert database.execute(
        "select extra_lights from public.world_state where id = 1"
    ).fetchone() == (2,)
    assert database.execute("select count(*) from public.wallet_transactions").fetchone() == (0,)
    assert database.execute(
        "select count(*) from public.festival_claims where player_id = %s", (PLAYERS[0],)
    ).fetchone() == (2,)


def test_action_uid_replays_the_original_kind_and_target_across_all_mutations(database):
    prepare(database)
    first = claim(database)
    assert rpc(database, "festival_ring_leave", PLAYERS[0], "claim001") == {**first, "repeat": True}
    assert join(database, uid="claim001") == {**first, "repeat": True}
    assert claim(database, lamp="not-a-lamp") == {**first, "repeat": True}
    assert database.execute("select count(*) from public.festival_queue").fetchone() == (0,)


def test_fifo_pairing_creates_one_real_friendly_duel_with_no_wallet_changes(database):
    prepare(database)
    queued = join(database)
    assert queued["outcome"] == "queued"
    assert database.execute("select count(*) from public.duels").fetchone() == (0,)
    first = candidate(database, PLAYERS[1])
    assert first["id"] == queued["queueId"] and first["playerId"] == str(PLAYERS[0])
    paired = join(database, player=PLAYERS[1], uid="join0002", signals=OTHER_SIGNALS)
    assert paired["outcome"] == "paired" and paired["duelId"]
    assert database.execute(
        "select status, rounds, stake, challenger_id, opponent_id from public.duels"
    ).fetchone() == ("finished", 3, 0, PLAYERS[0], PLAYERS[1])
    assert database.execute("select count(*) from public.duel_moves").fetchone() == (6,)
    assert database.execute("select count(*) from public.wallet_transactions").fetchone() == (0,)
    assert database.execute(
        "select state, duel_id::text from public.festival_queue order by created_at, id"
    ).fetchall() == [("paired", paired["duelId"]), ("paired", paired["duelId"])]
    assert join(database, player=PLAYERS[1], uid="join0002") == {**paired, "repeat": True}
    assert join(database) == {**queued, "repeat": True}
    assert database.execute("select count(*) from public.duels").fetchone() == (1,)
    assert "signals" not in str(
        database.execute("select reply from public.festival_actions").fetchall()
    )


def test_stale_fifo_resolution_creates_no_duel_or_receipt_and_can_be_retried(database):
    prepare(database)
    join(database)
    stale = join(database, player=PLAYERS[1], uid="join0002", expected=None)
    assert stale == {"status": "state_changed"}
    assert database.execute("select count(*) from public.festival_actions").fetchone() == (1,)
    assert join(database, player=PLAYERS[1], uid="join0002")["outcome"] == "paired"


def test_leave_is_own_scoped_and_repeating_never_removes_a_later_join(database):
    prepare(database)
    joined = join(database)
    assert rpc(database, "festival_ring_leave", PLAYERS[1], "leave001")["reason"] == "not_queued"
    left = rpc(database, "festival_ring_leave", PLAYERS[0], "leave001")
    assert left["outcome"] == "left" and left["queueId"] == joined["queueId"]
    join(database, uid="join0002")
    assert rpc(database, "festival_ring_leave", PLAYERS[0], "leave001") == {**left, "repeat": True}
    assert database.execute(
        "select count(*) from public.festival_queue where state = 'queued'"
    ).fetchone() == (1,)
    assert join(database, uid="join0003")["reason"] == "already_queued"


def test_active_a7_players_are_not_queued_or_paired(database):
    prepare(database)
    queued = join(database)
    created = rpc(
        database, "duel_create", PLAYERS[0], None, 3, 0, 5, list(SIGNALS), "outside1", 24, 3
    )
    assert created["status"] == "done"
    assert join(database, player=PLAYERS[0], uid="join0004")["reason"] == "in_duel"
    assert candidate(database, PLAYERS[1]) is None
    assert join(database, player=PLAYERS[1], uid="join0002")["outcome"] == "queued"
    assert database.execute(
        "select state from public.festival_queue where id = %s", (queued["queueId"],)
    ).fetchone() == ("left",)
    assert join(database, player=PLAYERS[0], uid="join0003")["reason"] == "in_duel"


@pytest.mark.parametrize(
    "signals", (["flash"] * 3, ["shade"] * 2, [None, "shade", "shade"], ["unknown"] * 3)
)
def test_bad_signals_roll_back_without_creating_a_receipt(database, signals):
    import psycopg

    prepare(database)
    with (
        pytest.raises(psycopg.errors.RaiseException, match="bad_festival_signals"),
        database.transaction(),
    ):
        join(database, signals=tuple(signals))
    assert database.execute("select count(*) from public.festival_actions").fetchone() == (0,)
    assert database.execute("select count(*) from public.festival_queue").fetchone() == (0,)


@pytest.mark.parametrize("role", ("anon", "authenticated"))
def test_browser_roles_have_no_table_or_function_access_and_all_functions_are_invokers(
    database, role
):
    import psycopg

    for table in TABLES:
        assert database.execute(
            "select relrowsecurity from pg_class where oid = %s::regclass", (f"public.{table}",)
        ).fetchone() == (True,)
        for right in ("select", "insert", "update", "delete"):
            assert database.execute(
                "select has_table_privilege(%s, %s, %s)", (role, f"public.{table}", right)
            ).fetchone() == (False,)
        assert database.execute(
            "select count(*) from pg_policies where schemaname = 'public' and tablename = %s",
            (table,),
        ).fetchone() == (0,)
    functions = database.execute(
        "select oid::regprocedure::text, prosecdef, proconfig from pg_proc "
        "where pronamespace = 'public'::regnamespace and proname = any(%s)",
        (list(FUNCTIONS),),
    ).fetchall()
    assert len(functions) == 7
    for name, definer, config in functions:
        assert not definer and config == ['search_path=""']
        assert database.execute(
            "select has_function_privilege(%s, %s, 'execute')", (role, name)
        ).fetchone() == (False,)
    database.execute(f"set local role {role}")
    with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
        claim(database)


def test_reapply_repairs_broad_grants_and_server_cannot_change_receipts_or_sealed_signals(database):
    import psycopg

    prepare(database)
    claim(database)
    join(database)
    as_owner(database)
    for table in TABLES:
        database.execute(f"grant all on public.{table} to anon, authenticated, service_role")
    database.execute(MIGRATION.read_text())
    as_server(database)
    for query in (
        "delete from public.festival_claims",
        "update public.festival_actions set kind = 'join'",
        "update public.festival_queue set signals = array['shade','shade','shade']",
    ):
        with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
            database.execute(query)
    for table in TABLES:
        assert database.execute(
            "select has_table_privilege('authenticated', %s, 'select')", (f"public.{table}",)
        ).fetchone() == (False,)


def test_deleting_a_captain_removes_reservations_private_envelopes_and_receipts(database):
    prepare(database)
    claim(database)
    join(database)
    assert rpc(database, "delete_player", PLAYERS[0])["status"] == "deleted"
    for table in ("festival_actions", "festival_claims", "festival_queue"):
        assert database.execute(
            f"select count(*) from public.{table} where player_id = %s", (PLAYERS[0],)
        ).fetchone() == (0,)


def test_simultaneous_lamp_claims_have_one_owner_and_durable_loser_receipt(scratch_server):
    import psycopg

    with psycopg.connect(scratch_server.get_uri()) as seed:
        prepare(seed)
    barrier = Barrier(2)

    def one(player):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            as_server(connection)
            barrier.wait(timeout=5)
            return claim(connection, player=player)

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            replies = list(pool.map(one, PLAYERS[:2]))
        assert sorted(reply["accepted"] for reply in replies) == [False, True]
        with psycopg.connect(scratch_server.get_uri()) as check:
            assert check.execute("select count(*) from public.festival_claims").fetchone() == (1,)
            assert check.execute("select count(*) from public.festival_actions").fetchone() == (2,)
    finally:
        with psycopg.connect(scratch_server.get_uri()) as cleanup:
            cleanup.execute("truncate auth.users cascade")
            cleanup.execute(
                "insert into public.world_state (id) values (1) on conflict (id) do update "
                "set stage = 'dark', relit_at = null, solves = 0, extra_lights = 0"
            )


def test_simultaneous_ring_joiners_pair_the_fifo_captain_once_and_retry_the_loser(scratch_server):
    import psycopg

    with psycopg.connect(scratch_server.get_uri()) as seed:
        prepare(seed)
        join(seed)
    barrier = Barrier(2)

    def one(player):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            as_server(connection)
            first = candidate(connection, player)
            barrier.wait(timeout=5)
            return join(connection, player=player, uid="join0002", expected=first)

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            replies = list(pool.map(one, PLAYERS[1:3]))
        assert sorted(reply["status"] for reply in replies) == ["done", "state_changed"]
        loser = PLAYERS[1:3][
            next(index for index, reply in enumerate(replies) if reply["status"] == "state_changed")
        ]
        with psycopg.connect(scratch_server.get_uri()) as retry:
            as_server(retry)
            assert join(retry, player=loser, uid="join0002")["outcome"] == "queued"
            assert retry.execute("select count(*) from public.duels").fetchone() == (1,)
            assert retry.execute("select count(*) from public.duel_moves").fetchone() == (6,)
            assert retry.execute(
                "select state,count(*) from public.festival_queue group by state order by state"
            ).fetchall() == [("paired", 2), ("queued", 1)]
            assert retry.execute("select count(*) from public.festival_actions").fetchone() == (3,)
            assert retry.execute("select count(*) from public.wallet_transactions").fetchone() == (
                0,
            )
    finally:
        with psycopg.connect(scratch_server.get_uri()) as cleanup:
            cleanup.execute("truncate auth.users cascade")
            cleanup.execute(
                "insert into public.world_state (id) values (1) on conflict (id) do update "
                "set stage = 'dark', relit_at = null, solves = 0, extra_lights = 0"
            )


def test_a_ring_join_waiting_for_wallets_rechecks_the_exact_festival_end(scratch_server):
    import time

    import psycopg

    with psycopg.connect(scratch_server.get_uri()) as seed:
        prepare(seed)
        join(seed)
    with (
        psycopg.connect(scratch_server.get_uri()) as blocker,
        psycopg.connect(scratch_server.get_uri()) as waiting,
        psycopg.connect(scratch_server.get_uri(), autocommit=True) as monitor,
        ThreadPoolExecutor(max_workers=1) as pool,
    ):
        try:
            blocker.execute(
                "select 1 from public.wallets where player_id = %s for update", (PLAYERS[1],)
            )
            as_server(waiting)
            future = pool.submit(join, waiting, player=PLAYERS[1], uid="join0002")
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                state = monitor.execute(
                    "select wait_event_type from pg_stat_activity where pid = %s",
                    (waiting.info.backend_pid,),
                ).fetchone()
                if state == ("Lock",):
                    break
                time.sleep(0.01)
            else:
                pytest.fail("The ring join did not reach the held wallet lock.")
            blocker.execute(
                "update public.world_state set "
                "relit_at = clock_timestamp() - interval '48 hours' where id = 1"
            )
            blocker.commit()
            reply = future.result(timeout=5)
            assert reply["reason"] == "festival_ended"
            assert waiting.execute("select count(*) from public.duels").fetchone() == (0,)
            assert waiting.execute("select count(*) from public.festival_queue").fetchone() == (1,)
            waiting.commit()
        finally:
            blocker.rollback()
            waiting.rollback()
            blocker.execute("truncate auth.users cascade")
            blocker.execute(
                "insert into public.world_state (id) values (1) on conflict (id) do update "
                "set stage = 'dark', relit_at = null, solves = 0, extra_lights = 0"
            )
            blocker.commit()
