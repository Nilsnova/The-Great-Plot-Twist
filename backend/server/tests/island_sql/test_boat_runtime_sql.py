"""Real boat runtime/legacy separation on disposable PostgreSQL with TEST-ONLY authority."""

import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")
from server.tests.economy_test_authority import (  # noqa: E402
    configure_test_authority,
    install_test_authority,
)
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    as_owner,
    keys,
    ready,
    rpc,
)

ROOT = Path(__file__).resolve().parents[4]


@pytest.fixture(scope="session")
def runtime_server(tmp_path_factory):
    if os.environ.get("CASE_PG_SCRATCH") != "1":
        pytest.skip("opt-in disposable PostgreSQL")
    pgserver = pytest.importorskip("pgserver")
    directory = tmp_path_factory.mktemp("boat-runtime-pg") / "data"
    with pgserver.get_server(directory, cleanup_mode="delete") as server:
        assert psycopg.conninfo.conninfo_to_dict(server.get_uri())["host"].startswith("/")
        with psycopg.connect(server.get_uri(), autocommit=True) as connection:
            connection.execute((ROOT / "backend/server/tests/case_sql/stub.sql").read_text())
            for _ in range(2):
                for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
                    if (
                        migration.name <= "20261118070000_revive_reconciliation.sql"
                        or migration.name == "20261118181500_shared_boat_runtime.sql"
                    ):
                        connection.execute(migration.read_text())
            install_test_authority(connection)
        yield server
    assert not directory.exists()


@pytest.fixture
def database(runtime_server):
    with psycopg.connect(runtime_server.get_uri()) as connection:
        yield connection
        connection.rollback()


def setup(connection, *, admitted=False):
    owner, member, outsider, initial = ready(connection, admitted=admitted)
    as_owner(connection)
    connection.execute(
        "update public.islands set wave_best=30,wreck_paid=500 where player_id=%s", (owner,)
    )
    for actor in (owner, member, outsider):
        configure_test_authority(connection, actor, owner)
    return owner, member, outsider, initial


def legacy_claim(connection, actor, owner, stars=1):
    return rpc(connection, "island_legacy_boat_reward", actor, owner, "dash", stars)


def test_legacy_rewards_keep_original_once_per_player_game_record_behavior(database):
    owner, member, _, _ = setup(database)
    status = rpc(database, "island_boat_runtime_status", member, owner)
    assert status["status"] == "legacy" and "economy" not in status
    first = legacy_claim(database, member, owner)
    repeat = legacy_claim(database, member, owner, 3)
    assert first["paid"] is True and first["coins"] == 12
    assert repeat["already"] is True and repeat["coins"] == 0


def test_legacy_award_is_forbidden_after_shared_admission(database):
    owner, member, _, _ = setup(database)
    rpc(database, "island_treasury_admit", owner, owner, "admitboat1", 200)
    assert legacy_claim(database, member, owner) == {
        "status": "refused",
        "reason": "shared_context_required",
    }
    assert (
        database.execute(
            "select balance from public.wallets where player_id=%s", (member,)
        ).fetchone()[0]
        == 0
    )


def test_shared_status_uses_shared_bucket_and_actual_current_context(database):
    owner, member, _, initial = setup(database, admitted=True)
    status = rpc(database, "island_boat_runtime_status", member, owner)
    assert status["economy"]["accountId"] == keys(initial)[0]
    assert status["games"][1]["remainingCoins"] == "36"
    opened = rpc(
        database, "island_shared_boat_start", member, owner, keys(initial)[1], "dash", "startboat1"
    )
    source = opened["receipt"]["result"]["round"]
    rpc(
        database,
        "island_shared_boat_claim",
        member,
        source["id"],
        source["runEpoch"],
        1,
        "claimboat1",
    )
    status = rpc(database, "island_boat_runtime_status", member, owner)
    dash = next(game for game in status["games"] if game["id"] == "dash")
    assert (dash["claimedCoins"], dash["remainingCoins"], dash["maximumCoins"]) == (
        "12",
        "24",
        "36",
    )
    assert status["economy"]["treasury"]["balanceCoins"] == "212"


def test_shared_status_checks_membership_and_reservation_authority(database):
    owner, member, outsider, _ = setup(database, admitted=True)
    assert rpc(database, "island_boat_runtime_status", outsider, owner)["reason"] == "not_member"
    configure_test_authority(database, member, owner, reservation_id=uuid4())
    status = rpc(database, "island_boat_runtime_status", member, owner)
    assert status["open"] is False and status["reason"] == "wave_running"
    database.execute("drop function public.island_economy_authority(uuid,uuid)")
    assert (
        rpc(database, "island_boat_runtime_status", member, owner)["reason"] == "path_unavailable"
    )


def test_admission_and_legacy_award_share_one_atomic_scope_boundary(database, runtime_server):
    owner, member, _, _ = setup(database)
    database.commit()
    barrier = Barrier(2)

    def run(admit):
        with psycopg.connect(runtime_server.get_uri()) as connection:
            connection.execute("set local role service_role")
            barrier.wait(timeout=10)
            value = (
                rpc(connection, "island_treasury_admit", owner, owner, "admitboat1", 200)
                if admit
                else legacy_claim(connection, member, owner)
            )
            connection.commit()
            return value

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, (False, True)))
    award, admission = results
    assert admission["status"] == "done"
    assert award.get("reason") == "shared_context_required" or award["coins"] == 12
    assert legacy_claim(database, member, owner)["reason"] == "shared_context_required"
    amount = database.execute(
        "select balance from public.wallets where player_id=%s", (member,)
    ).fetchone()[0]
    assert amount == (12 if award.get("paid") else 0)
