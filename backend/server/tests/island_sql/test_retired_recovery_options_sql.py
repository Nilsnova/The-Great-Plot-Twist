"""The recovery-v1 retirement fence rejects new choices atomically and preserves stored ones."""

import threading
import time
from uuid import UUID

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    add_players,
    as_owner,
    as_server,
    balance,
    call,
    ledger,
)
from server.tests.island_sql.test_structure_recovery_mutations_sql import (  # noqa: E402
    OWNER,
    seed_v1,
)


def assert_retired(database, sql, *arguments):
    database.execute("savepoint retired_option_attempt")
    with pytest.raises(psycopg.errors.RaiseException) as error:
        call(database, sql, *arguments)
    assert error.value.diag.message_primary == "recovery_option_retired"
    database.execute("rollback to savepoint retired_option_attempt")
    database.execute("release savepoint retired_option_attempt")


def seed_v0(database):
    seed_player(database, OWNER, "Q7R3S")


def seed_player(database, player, code):
    add_players(database, player)
    as_server(database)
    call(database, "select public.island_open(%s,%s,300)", player, code)
    call(
        database,
        "select public.islet_build(%s,'wall_1','wall',10,0,0,'seed-wall-01')",
        player,
    )


def admit_v1(database):
    as_owner(database)
    database.execute(
        "update public.island_recovery_state set recovery_version=1,wave_protocol=2 "
        "where island_owner=%s",
        (OWNER,),
    )
    as_server(database)


def test_retired_paid_choices_roll_back_wallet_and_progression(database):
    seed_v1(database)
    as_server(database)
    before = balance(database, OWNER)

    assert_retired(
        database,
        "select public.island_hire(%s,'carpenter','hire-0001',10,10)",
        OWNER,
    )
    assert balance(database, OWNER) == before
    assert ledger(database, OWNER, "crew_hire") == []
    assert (
        call(database, "select crew_carpenter from public.islands where player_id=%s", OWNER) == 0
    )

    database.execute(
        "insert into public.island_research(island_owner,branch,researched_by,coins_paid,ref,tier) "
        "values (%s,'wall',%s,10,'research:seed-0001',1)",
        (OWNER, OWNER),
    )
    assert_retired(
        database,
        "select public.island_research(%s,%s,'wall','research-0002',10,0,2,'mason_drill',false)",
        OWNER,
        OWNER,
    )
    assert balance(database, OWNER) == before
    assert ledger(database, OWNER, "tech_research") == []
    assert call(
        database,
        "select choice_2 from public.island_research where island_owner=%s and branch='wall'",
        OWNER,
    ) is None

    assert_retired(
        database,
        "select public.island_specialise(%s,%s,'wall_1','wall','quick_mend','skill-0001',40)",
        OWNER,
        OWNER,
    )
    assert balance(database, OWNER) == before
    assert ledger(database, OWNER, "tower_skill") == []
    assert call(
        database,
        "select spec from public.islet_buildings where player_id=%s and plot='wall_1'",
        OWNER,
    ) is None


def test_retired_workshop_role_refusal_is_free_and_bastion_remains_selectable(database):
    seed_v1(database)
    as_server(database)
    call(database, "select public.islet_build(%s,'house_1','house',10,0,0,'seed-house-01')", OWNER)
    as_owner(database)
    database.execute(
        "update public.islet_buildings set level=2 where player_id=%s and plot='house_1'",
        (OWNER,),
    )
    database.execute(
        "insert into public.island_research(island_owner,branch,researched_by,coins_paid,ref,"
        "tier,choice_2,choice_3) "
        "values (%s,'wall',%s,10,'research:seed-0003',3,'thick_walls','bastion')",
        (OWNER, OWNER),
    )
    database.execute("update public.wallets set balance=300 where player_id=%s", (OWNER,))
    admit_v1(database)
    as_server(database)
    before = balance(database, OWNER)

    assert_retired(
        database,
        "select public.island_specialise(%s,%s,'house_1','house','workshop',null,0)",
        OWNER,
        OWNER,
    )
    assert balance(database, OWNER) == before
    assert call(
        database,
        "select spec from public.islet_buildings where player_id=%s and plot='house_1'",
        OWNER,
    ) is None

    bastion = call(
        database,
        "select public.island_specialise(%s,%s,'wall_1','wall','bastion','skill-0002',160)",
        OWNER,
        OWNER,
    )
    assert bastion["status"] == "done"
    assert call(
        database,
        "select spec from public.islet_buildings where player_id=%s and plot='wall_1'",
        OWNER,
    ) == "bastion"


def test_existing_retired_values_and_unrelated_updates_remain_legal(database):
    seed_v0(database)
    as_server(database)
    call(database, "select public.islet_build(%s,'house_1','house',10,0,0,'seed-house-02')", OWNER)
    database.execute(
        "insert into public.island_research(island_owner,branch,researched_by,coins_paid,ref,"
        "tier,choice_2) "
        "values (%s,'wall',%s,10,'research:seed-0004',2,'mason_drill')",
        (OWNER, OWNER),
    )
    as_owner(database)
    database.execute(
        "update public.islet_buildings set level=2,spec='workshop' "
        "where player_id=%s and plot='house_1'",
        (OWNER,),
    )
    database.execute(
        "update public.islet_buildings set spec='quick_mend' "
        "where player_id=%s and plot='wall_1'",
        (OWNER,),
    )
    database.execute(
        "update public.islands set crew_carpenter=1 where player_id=%s",
        (OWNER,),
    )
    admit_v1(database)

    # Rewriting a saved value and changing an unrelated field do not retire old IDs.
    database.execute(
        "update public.islet_buildings set spec='workshop' where player_id=%s and plot='house_1'",
        (OWNER,),
    )
    database.execute(
        "update public.island_research set choice_2='mason_drill' "
        "where island_owner=%s and branch='wall'",
        (OWNER,),
    )
    database.execute(
        "update public.islands set crew_gunner=crew_gunner where player_id=%s", (OWNER,)
    )

    assert (
        call(database, "select crew_carpenter from public.islands where player_id=%s", OWNER) == 1
    )
    assert call(
        database,
        "select spec from public.islet_buildings where player_id=%s and plot='wall_1'",
        OWNER,
    ) == "quick_mend"
    assert call(
        database,
        "select choice_2 from public.island_research where island_owner=%s and branch='wall'",
        OWNER,
    ) == "mason_drill"


def test_wave_admission_lock_serializes_a_stale_carpenter_request(database, scratch_server):
    race_owner = UUID(int=2_000_001)
    seed_player(database, race_owner, "RAC32")
    database.commit()

    owner_lock = psycopg.connect(scratch_server.get_uri())
    attempting = threading.Event()
    results = []
    worker_pid = []

    def hire():
        with psycopg.connect(scratch_server.get_uri()) as connection:
            as_server(connection)
            pid = connection.info.backend_pid
            worker_pid.append(pid)
            attempting.set()
            try:
                call(
                    connection,
                    "select public.island_hire(%s,'carpenter','race-hire-01',10,10)",
                    race_owner,
                )
            except psycopg.errors.RaiseException as error:
                results.append((pid, error.diag.message_primary))

    worker = threading.Thread(target=hire)
    try:
        owner_lock.execute(
            "select player_id from public.islands where player_id=%s for update", (race_owner,)
        )
        worker.start()
        assert attempting.wait(timeout=5)
        deadline = time.monotonic() + 5
        blocked_pid = None
        while time.monotonic() < deadline:
            if results:
                break
            blockers = database.execute(
                "select pg_blocking_pids(%s)", (worker_pid[0],)
            ).fetchone()[0]
            if owner_lock.info.backend_pid in blockers:
                blocked_pid = worker_pid[0]
                break
            time.sleep(0.01)
        assert blocked_pid is not None

        owner_lock.execute(
            "update public.island_recovery_state set recovery_version=1,wave_protocol=2 "
            "where island_owner=%s",
            (race_owner,),
        )
        owner_lock.commit()
        worker.join(timeout=5)
        assert not worker.is_alive()
        assert len(results) == 1
        assert results[0][1] == "recovery_option_retired"
        assert (
            call(
                database,
                "select crew_carpenter from public.islands where player_id=%s",
                race_owner,
            )
            == 0
        )
        assert ledger(database, race_owner, "crew_hire") == []
    finally:
        if not owner_lock.closed:
            owner_lock.rollback()
            owner_lock.close()
        worker.join(timeout=5)
        with psycopg.connect(scratch_server.get_uri(), autocommit=True) as cleanup:
            cleanup.execute("delete from auth.users where id=%s", (race_owner,))
