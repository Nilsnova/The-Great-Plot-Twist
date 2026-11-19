"""Committed ship reward races on disposable PostgreSQL with test-seeded canonical facts.

No configured database or credentials are read. Seeding the actual provider tables is not
persisted multiplayer runtime acceptance. The full migration chain is applied twice.
"""

import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.economy_test_authority import (  # noqa: E402
    authority_outage,
    configure_test_authority,
    install_test_authority,
    malformed_authority_domain,
)
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    as_owner,
    keys,
    ready,
    reconciles,
    rpc,
)
from server.tests.island_sql.test_islands_and_waves_sql import add_players  # noqa: E402

ROOT = Path(__file__).resolve().parents[4]
MIGRATION = ROOT / "supabase/migrations/20261118051500_shared_ship_rewards.sql"


@pytest.fixture(scope="session")
def ship_server(tmp_path_factory):
    if os.environ.get("CASE_PG_SCRATCH") != "1":
        pytest.skip("opt-in disposable PostgreSQL")
    pgserver = pytest.importorskip("pgserver")
    directory = tmp_path_factory.mktemp("ship-pg") / "data"
    with pgserver.get_server(directory, cleanup_mode="delete") as server:
        parameters = psycopg.conninfo.conninfo_to_dict(server.get_uri())
        assert parameters.get("host", "").startswith("/")
        with psycopg.connect(server.get_uri(), autocommit=True) as connection:
            stub = ROOT / "backend/server/tests/case_sql/stub.sql"
            connection.execute(stub.read_text())
            chain = sorted((ROOT / "supabase/migrations").glob("*.sql"))
            for _ in range(2):
                for path in chain:
                    connection.execute(path.read_text())
            install_test_authority(connection)
        yield server
    assert not directory.exists()


@pytest.fixture
def database(ship_server):
    with psycopg.connect(ship_server.get_uri()) as connection:
        yield connection
        connection.rollback()


def setup(database):
    owner, member, outsider, initial = ready(database)
    as_owner(database)
    for actor in (owner, member, outsider):
        configure_test_authority(database, actor, owner)
    database.execute(
        "update public.islands set wave_best=30,wreck_paid=500 where player_id=%s", (owner,)
    )
    return owner, member, outsider, initial


def start(connection, actor, owner, initial, uid="boatstart1", game="dash"):
    return rpc(connection, "island_shared_boat_start", actor, owner, keys(initial)[1], game, uid)


def claim(connection, actor, round_result, stars=3, uid="boatclaim1"):
    source = round_result["receipt"]["result"]["round"]
    return rpc(
        connection, "island_shared_boat_claim", actor, source["id"], source["runEpoch"], stars, uid
    )


def test_same_uid_lost_response_and_altered_payloads(database):
    owner, member, _, initial = setup(database)
    opened = start(database, member, owner, initial)
    assert (
        start(database, member, owner, initial)["receipt"]["result"]["round"]
        == opened["receipt"]["result"]["round"]
    )
    first = claim(database, member, opened, 1)
    again = claim(database, member, opened, 1)
    assert first["receipt"] == again["receipt"] and again["repeat"] is True
    assert first["receipt"]["result"]["coins"] == "12"
    assert claim(database, member, opened, 3) == {"status": "refused", "reason": "action_conflict"}
    assert claim(database, member, opened, 3, uid="another01")["reason"] == "round_completed"
    reconciles(database, keys(initial)[0])


def test_positive_improvements_and_zero_claims_share_one_bucket(database):
    owner, member, _, initial = setup(database)
    results = []
    for index, stars in enumerate((0, 1, 3, 2, 3)):
        opened = start(database, member, owner, initial, uid=f"round-{index:04d}")
        results.append(claim(database, member, opened, stars, uid=f"claim-{index:04d}"))
    assert [item["receipt"]["result"]["coins"] for item in results] == ["0", "12", "24", "0", "0"]
    assert (
        database.execute("select paid_coins from public.island_boat_reward_buckets").fetchone()[0]
        == 36
    )
    assert database.execute("select count(*) from public.island_boat_results").fetchone()[0] == 5
    reconciles(database, keys(initial)[0])


def test_round_origin_keeps_record_after_island_progresses(database):
    owner, member, _, initial = setup(database)
    old = start(database, member, owner, initial)
    database.execute("update public.islands set wave_best=35 where player_id=%s", (owner,))
    paid = claim(database, member, old)
    new = start(database, member, owner, initial, uid="newrecord1")
    later = claim(database, member, new, uid="newclaim01")
    assert (
        paid["receipt"]["result"]["recordWave"] == 30 and paid["receipt"]["result"]["coins"] == "36"
    )
    assert (
        later["receipt"]["result"]["recordWave"] == 35
        and later["receipt"]["result"]["coins"] == "39"
    )


def test_authorization_phase_and_unlock_refusals_leave_no_root_claim(database):
    owner, member, outsider, initial = setup(database)
    assert start(database, outsider, owner, initial)["reason"] == "not_member"
    configure_test_authority(database, member, owner, reservation_id=uuid4())
    assert start(database, member, owner, initial)["reason"] == "wave_running"
    configure_test_authority(database, member, owner)
    database.execute("update public.islands set wreck_paid=499 where player_id=%s", (owner,))
    assert start(database, member, owner, initial)["reason"] == "not_repaired"
    database.execute(
        "update public.islands set wave_best=29,wreck_paid=500 where player_id=%s", (owner,)
    )
    assert start(database, member, owner, initial)["reason"] == "locked"
    assert (
        database.execute(
            "select count(*) from public.island_economy_operations where domain_action='boat:start'"
        ).fetchone()[0]
        == 0
    )


def test_missing_authority_fails_closed(database):
    owner, member, _, initial = setup(database)
    with authority_outage(database):
        assert start(database, member, owner, initial)["reason"] == "path_unavailable"


def test_actor_substitution_cannot_claim_another_members_round(database):
    owner, member, outsider, initial = setup(database)
    opened = start(database, member, owner, initial)
    assert claim(database, owner, opened)["reason"] == "not_round_actor"
    assert claim(database, outsider, opened)["reason"] == "not_round_actor"


def test_committed_replay_survives_departure_but_fresh_claim_does_not(database):
    owner, member, _, initial = setup(database)
    done = start(database, member, owner, initial)
    pending = start(database, member, owner, initial, uid="pending001")
    paid = claim(database, member, done)
    database.execute(
        "update public.island_members set left_at=clock_timestamp() "
        "where island_owner=%s and player_id=%s",
        (owner, member),
    )
    assert claim(database, member, done)["receipt"] == paid["receipt"]
    assert claim(database, member, pending, uid="pending002")["reason"] == "not_member"


def test_epoch_switch_fences_pending_round_and_keeps_old_receipt(database):
    owner, member, _, initial = setup(database)
    done = start(database, member, owner, initial)
    pending = start(database, member, owner, initial, uid="pending001")
    paid = claim(database, member, done)
    old_account, old_epoch = keys(initial)
    database.execute(
        "update public.island_economy_accounts set state='retired',"
        "retired_at=clock_timestamp() where id=%s",
        (old_account,),
    )
    new = database.execute(
        "insert into public.island_economy_accounts(island_owner) "
        "values(%s) returning id,run_epoch",
        (owner,),
    ).fetchone()
    database.execute(
        "update public.island_economy_state set current_account_id=%s,run_epoch=%s "
        "where island_owner=%s",
        (*new, owner),
    )
    assert claim(database, member, done)["receipt"] == paid["receipt"]
    refused = claim(database, member, pending, uid="pending002")
    assert refused["reason"] in ("path_unavailable", "epoch_mismatch")
    forged = rpc(
        database,
        "island_shared_boat_claim",
        member,
        pending["receipt"]["result"]["round"]["id"],
        new[1],
        3,
        "forged0001",
    )
    assert forged["reason"] == "epoch_mismatch"
    assert (
        database.execute(
            "select balance_coins from public.island_economy_accounts where id=%s", (new[0],)
        ).fetchone()[0]
        == 0
    )
    reconciles(database, old_account)


def race(server, actions):
    barrier = Barrier(len(actions))

    def run(action):
        with psycopg.connect(server.get_uri()) as connection:
            barrier.wait(timeout=20)
            connection.execute("set local role service_role")
            result = action(connection)
            connection.commit()
            return result

    with ThreadPoolExecutor(max_workers=len(actions)) as pool:
        return list(pool.map(run, actions))


def test_ten_members_and_parallel_improvements_never_multiply_cap(database, ship_server):
    owner, member, _, initial = setup(database)
    actors = [owner, member, *(uuid4() for _ in range(8))]
    rounds = []
    for index, actor in enumerate(actors):
        if actor not in (owner, member):
            add_players(database, actor)
            rpc(database, "game_join", actor, owner, 10)
            configure_test_authority(database, actor, owner)
        rounds.append(start(database, actor, owner, initial, uid=f"start-{index:04d}"))
    database.commit()
    actions = [
        lambda connection, actor=actor, opened=opened, index=index: claim(
            connection, actor, opened, (index % 3) + 1, uid=f"claim-{index:04d}"
        )
        for index, (actor, opened) in enumerate(zip(actors, rounds, strict=True))
    ]
    results = race(ship_server, actions)
    assert all(item["status"] == "done" for item in results)
    assert sum(int(item["receipt"]["result"]["coins"]) for item in results) == 36
    assert (
        database.execute(
            "select paid_coins from public.island_boat_reward_buckets where account_id=%s",
            (keys(initial)[0],),
        ).fetchone()[0]
        == 36
    )
    reconciles(database, keys(initial)[0])


def test_parallel_same_uid_returns_one_receipt(database, ship_server):
    owner, member, _, initial = setup(database)
    opened = start(database, member, owner, initial)
    database.commit()
    results = race(ship_server, [lambda connection: claim(connection, member, opened)] * 5)
    assert len({item["receipt"]["receiptId"] for item in results}) == 1
    assert sum(not item["repeat"] for item in results) == 1
    reconciles(database, keys(initial)[0])


def test_injected_receipt_failure_rolls_back_bucket_treasury_and_operation(database):
    owner, member, _, initial = setup(database)
    opened = start(database, member, owner, initial)
    database.execute("""
      create function public.ship_test_failure() returns trigger language plpgsql as $$
      begin raise exception 'test_receipt_failure'; end $$;
      create trigger ship_test_failure before insert on public.island_boat_results
      for each row execute function public.ship_test_failure();""")
    with pytest.raises(psycopg.errors.RaiseException), database.transaction():
        claim(database, member, opened)
    assert (
        database.execute(
            "select count(*) from public.island_economy_operations "
            "where action_uid='boatclaim1' and actor_id=%s",
            (member,),
        ).fetchone()[0]
        == 0
    )
    assert (
        database.execute(
            "select count(*) from public.island_boat_reward_buckets where account_id=%s",
            (keys(initial)[0],),
        ).fetchone()[0]
        == 0
    )
    reconciles(database, keys(initial)[0])


def test_domains_and_changed_start_terms_share_common_uid_conflicts(database):
    owner, member, _, initial = setup(database)
    opened = start(database, member, owner, initial)
    assert start(database, member, owner, initial, game="broadside")["reason"] == "action_conflict"
    assert claim(database, member, opened, uid="boatstart1")["reason"] == "action_conflict"
    assert claim(database, member, opened)["status"] == "done"


def test_each_game_has_one_independent_record_bucket(database):
    owner, member, _, initial = setup(database)
    dash = start(database, member, owner, initial)
    broadside = start(database, member, owner, initial, uid="broadside1", game="broadside")
    rewards = [claim(database, member, dash), claim(database, member, broadside, uid="broadside2")]
    assert sum(int(item["receipt"]["result"]["coins"]) for item in rewards) == 72


def test_replay_returns_common_original_receipt_without_current_treasury(database):
    owner, member, _, initial = setup(database)
    opened = start(database, member, owner, initial)
    first = claim(database, member, opened)
    with authority_outage(database):
        replay = claim(database, member, opened)
        receipt = replay["receipt"]
        assert receipt == first["receipt"] and replay["currentEconomy"] is None
        assert set(receipt) == {"receiptId", "actionUid", "action", "actorId", "origin", "result"}
        assert receipt["actionUid"] == "boatclaim1" and receipt["action"] == "boat:claim"
        assert receipt["origin"] == {
            "mode": "island_shared",
            "version": 1,
            "islandOwner": str(owner),
            "accountId": keys(initial)[0],
            "runEpoch": keys(initial)[1],
        }


@pytest.mark.parametrize(
    "field,value",
    [
        ("reservation_id", "bad-uuid"),
        ("session_leader_id", 123),
        ("actor_assignment_wave_id", []),
        ("is_member", "true"),
        ("actor_id", None),
        ("island_owner", "other"),
        ("reservation_id", "missing"),
    ],
)
def test_malformed_or_missing_authority_fields_fail_closed(database, field, value, monkeypatch):
    owner, member, _, initial = setup(database)
    authority = {
        "actor_id": str(member),
        "island_owner": str(owner),
        "is_member": True,
        "reservation_id": None,
        "session_leader_id": None,
        "actor_assignment_wave_id": None,
    }
    if value == "missing":
        authority.pop(field)
    else:
        authority[field] = value
    monkeypatch.setattr(__name__ + ".rpc", malformed_authority_domain(
        database, "island_shared_boat_start", authority
    ))
    assert start(database, member, owner, initial)["reason"] == "path_unavailable"
    assert (
        database.execute(
            "select count(*) from public.island_economy_operations "
            "where actor_id=%s and action_uid='boatstart1'",
            (member,),
        ).fetchone()[0]
        == 0
    )


def test_claim_during_new_reservation_is_refused_without_consuming_round_or_uid(database):
    owner, member, _, initial = setup(database)
    opened = start(database, member, owner, initial)
    configure_test_authority(database, member, owner, reservation_id=uuid4())
    assert claim(database, member, opened)["reason"] == "wave_running"
    configure_test_authority(database, member, owner)
    assert claim(database, member, opened)["receipt"]["result"]["coins"] == "36"


def test_grants_and_immutable_round_and_result_history(database):
    owner, member, _, initial = setup(database)
    opened = start(database, member, owner, initial)
    paid = claim(database, member, opened)
    for role in ("anon", "authenticated"):
        assert (
            database.execute(
                "select has_function_privilege(%s,"
                "'public.island_shared_boat_claim(uuid,uuid,uuid,integer,text)','execute')",
                (role,),
            ).fetchone()[0]
            is False
        )
    for table in ("island_boat_rounds", "island_boat_reward_buckets", "island_boat_results"):
        for privilege in ("INSERT", "UPDATE", "DELETE"):
            assert (
                database.execute(
                    "select has_table_privilege('service_role',%s,%s)",
                    ("public." + table, privilege),
                ).fetchone()[0]
                is False
            )
    with pytest.raises(psycopg.errors.RaiseException), database.transaction():
        database.execute(
            "update public.island_boat_rounds set game='broadside' where id=%s",
            (opened["receipt"]["result"]["round"]["id"],),
        )
    with pytest.raises(psycopg.errors.RaiseException), database.transaction():
        database.execute(
            "delete from public.island_boat_results where operation_id=%s",
            (paid["receipt"]["receiptId"],),
        )


def test_concurrent_distinct_claim_ids_cannot_complete_one_round_twice(database, ship_server):
    owner, member, _, initial = setup(database)
    opened = start(database, member, owner, initial)
    database.commit()
    results = race(
        ship_server,
        [
            lambda connection: claim(connection, member, opened, uid="same-round1"),
            lambda connection: claim(connection, member, opened, uid="same-round2"),
        ],
    )
    assert sorted(item["status"] for item in results) == ["done", "refused"]
    refused = next(item for item in results if item["status"] == "refused")
    assert refused["reason"] == "round_completed"
    assert (
        database.execute(
            "select count(*) from public.island_economy_operations "
            "where actor_id=%s and domain_action='boat:claim'",
            (member,),
        ).fetchone()[0]
        == 1
    )
    reconciles(database, keys(initial)[0])


def test_scoped_account_retirement_racing_claim_keeps_new_account_unfunded(
    database,
    ship_server,
):
    owner, member, _, initial = setup(database)
    opened = start(database, member, owner, initial)
    old_account, _ = keys(initial)
    database.commit()

    def retire_account_fixture(connection):
        # TEST ONLY: exercise the documented scope/account/epoch boundary, not a reset RPC.
        as_owner(connection)
        rpc(connection, "island_treasury_lock_scope", owner)
        connection.execute(
            "select id from public.island_economy_accounts where id=%s for update",
            (old_account,),
        )
        connection.execute(
            "select player_id from public.islands where player_id=%s for update", (owner,)
        )
        connection.execute(
            "update public.island_economy_accounts set state='retired',"
            "retired_at=clock_timestamp() where id=%s",
            (old_account,),
        )
        new_account, new_epoch = connection.execute(
            "insert into public.island_economy_accounts(island_owner) "
            "values(%s) returning id,run_epoch",
            (owner,),
        ).fetchone()
        connection.execute(
            "update public.island_economy_state set current_account_id=%s,run_epoch=%s "
            "where island_owner=%s",
            (new_account, new_epoch, owner),
        )
        return {"new_account": new_account}

    results = race(
        ship_server, [lambda connection: claim(connection, member, opened), retire_account_fixture]
    )
    reward, retirement = results
    assert reward["status"] in ("done", "refused")
    if reward["status"] == "refused":
        assert reward["reason"] in ("path_unavailable", "epoch_mismatch")
    assert (
        database.execute(
            "select balance_coins from public.island_economy_accounts where id=%s",
            (retirement["new_account"],),
        ).fetchone()[0]
        == 0
    )
    reconciles(database, old_account)
