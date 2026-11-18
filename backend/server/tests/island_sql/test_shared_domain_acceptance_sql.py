"""Actual cross-domain SQL transactions with TEST-ONLY phase/leader/assignment.

These checks are not authenticated browser or persistent session-authority acceptance.
They run only once the actual domain migrations are integrated in the tested tree.
"""

from pathlib import Path

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.economy_domain_test_helpers import (  # noqa: E402
    buy_copy,
    claim_round,
    concurrent_calls,
    open_market_call,
    prepare_domains,
    start_round,
)
from server.tests.economy_test_authority import authority_outage, install_test_authority  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    as_owner,
    keys,
    reconciles,
    rpc,
)

MIGRATIONS = Path(__file__).resolve().parents[4] / "supabase/migrations"
DOMAIN_MIGRATIONS = (
    "20261118050900_shared_arsenal.sql",
    "20261118051400_shared_island_wagers.sql",
    "20261118051500_shared_ship_rewards.sql",
)
pytestmark = pytest.mark.skipif(
    not all((MIGRATIONS / name).exists() for name in DOMAIN_MIGRATIONS),
    reason="Actual arsenal/wager/ship migrations not integrated; acceptance not executed.",
)


@pytest.fixture(autouse=True)
def injected_authority(database):
    """A missing actual RPC fails once its migration is present; never substitute a mock."""
    names = (
        "island_shared_arsenal_mutate",
        "island_wager_open",
        "island_shared_boat_start",
        "island_shared_boat_claim",
    )
    assert database.execute(
        "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
        "where n.nspname='public' and p.proname=any(%s)",
        (list(names),),
    ).fetchone()[0] == len(names)
    as_owner(database)
    install_test_authority(database)


def account_money(connection, initial):
    as_owner(connection)
    return connection.execute(
        "select balance_coins,committed_coins,balance_coins-committed_coins "
        "from public.island_economy_accounts where id=%s",
        (keys(initial)[0],),
    ).fetchone()


def test_actual_arsenal_buy_and_wager_reserve_share_last_available_funds(database, scratch_server):
    owner, member, _, initial = prepare_domains(database)
    database.commit()
    results = concurrent_calls(
        scratch_server,
        [
            lambda c: buy_copy(c, member, initial, "race-buy001"),
            lambda c: open_market_call(c, owner, initial, "race-bet001"),
        ],
    )
    assert sorted(item["status"] for item in results) == ["done", "refused"]
    refusal = next(item for item in results if item["status"] == "refused")
    assert refusal["reason"] == "insufficient_funds"
    assert account_money(database, initial) in ((0, 0, 0), (60, 60, 0))
    assert (
        database.execute(
            "select (select count(*) from public.arsenal_copies where economy_account_id=%s) + "
            "(select count(*) from public.island_wagers where account_id=%s)",
            (keys(initial)[0], keys(initial)[0]),
        ).fetchone()[0]
        == 1
    )
    assert (
        database.execute(
            "select count(*) from public.island_economy_operations "
            "where account_id=%s and is_player_intent",
            (keys(initial)[0],),
        ).fetchone()[0]
        == 1
    )
    reconciles(database, keys(initial)[0])


def test_actual_free_ship_start_and_paid_arsenal_buy_share_one_global_root(
    database, scratch_server
):
    _, member, _, initial = prepare_domains(database, 200)
    database.commit()
    results = concurrent_calls(
        scratch_server,
        [
            lambda c: start_round(c, member, initial, "same-root001"),
            lambda c: buy_copy(c, member, initial, "same-root001"),
        ],
    )
    statuses = sorted(item["status"] for item in results)
    assert statuses in (["done", "refused"], ["refused", "started"])
    assert next(item for item in results if item["status"] == "refused")["reason"] == (
        "action_conflict"
    )
    assert account_money(database, initial) in ((140, 0, 140), (200, 0, 200))
    assert (
        database.execute(
            "select count(*) from public.island_economy_operations where actor_id=%s "
            "and action_uid='same-root001'",
            (member,),
        ).fetchone()[0]
        == 1
    )
    assert (
        database.execute(
            "select (select count(*) from public.shared_arsenal_receipts where account_id=%s) + "
            "(select count(*) from public.island_boat_rounds where account_id=%s)",
            (keys(initial)[0], keys(initial)[0]),
        ).fetchone()[0]
        == 1
    )
    reconciles(database, keys(initial)[0])


def test_real_ship_reward_can_fund_purchase_after_wager_refusal_without_an_orphan_root(database):
    owner, member, _, initial = prepare_domains(database)
    database.execute("update public.islands set wave_best=100 where player_id=%s", (owner,))
    assert open_market_call(database, member, initial, "held-funds01")["status"] == "done"
    assert buy_copy(database, member, initial, "retry-buy001")["reason"] == "insufficient_funds"
    assert account_money(database, initial) == (60, 60, 0)
    assert (
        database.execute(
            "select count(*) from public.island_economy_operations where actor_id=%s "
            "and action_uid='retry-buy001'",
            (member,),
        ).fetchone()[0]
        == 0
    )
    opened = start_round(database, member, initial, "reward-start1")
    paid = claim_round(database, member, opened, "reward-claim1")
    assert paid["receipt"]["result"]["coins"] == "78"
    assert buy_copy(database, member, initial, "retry-buy001")["status"] == "done"
    assert account_money(database, initial) == (78, 60, 18)
    reconciles(database, keys(initial)[0])


def test_failure_after_actual_asset_and_charge_rolls_back_root_and_every_effect(database):
    owner, member, _, initial = prepare_domains(database)
    database.execute("""
        create function pg_temp.reject_arsenal_receipt() returns trigger
        language plpgsql as $$begin raise exception 'test_post_effect_failure'; end$$;
        create trigger acceptance_reject_receipt before insert on public.shared_arsenal_receipts
        for each row execute function pg_temp.reject_arsenal_receipt();
    """)
    with pytest.raises(psycopg.errors.RaiseException, match="post_effect"), database.transaction():
        buy_copy(database, member, initial, "failure-buy1")
    assert account_money(database, initial) == (60, 0, 60)
    assert (
        database.execute(
            "select count(*) from public.arsenal_copies where island_owner=%s", (owner,)
        ).fetchone()[0]
        == 0
    )
    assert (
        database.execute(
            "select count(*) from public.island_economy_operations where actor_id=%s "
            "and action_uid='failure-buy1'",
            (member,),
        ).fetchone()[0]
        == 0
    )
    database.execute("drop trigger acceptance_reject_receipt on public.shared_arsenal_receipts")
    assert buy_copy(database, member, initial, "failure-buy1")["status"] == "done"
    assert account_money(database, initial) == (0, 0, 0)
    reconciles(database, keys(initial)[0])


@pytest.mark.skipif(
    not (MIGRATIONS / "20261118051200_shared_combat_repairs.sql").exists(),
    reason="Actual shared repair migration not integrated; repair race not executed.",
)
def test_actual_countdown_repair_and_wager_share_last_funds_without_extra_heal_or_quota(
    database,
    scratch_server,
):
    from server.tests.island_sql.test_shared_combat_repairs_sql import repair, seed

    # The helper explicitly injects the missing canonical economy-bound snapshot producer.
    world = seed(database, coins=10)
    as_owner(database)
    database.execute("update public.islands set wave_best=7 where player_id=%s", (world.owner,))
    database.commit()
    results = concurrent_calls(
        scratch_server,
        [
            lambda c: repair(c, world, uid="race-repair1"),
            lambda c: open_market_call(c, world.owner, world.initial, "repair-bet01", stake=10),
        ],
    )
    assert sorted(item["status"] for item in results) == ["done", "refused"]
    assert next(item for item in results if item["status"] == "refused")["reason"] == (
        "insufficient_funds"
    )
    money = account_money(database, world.initial)
    assert money in ((0, 0, 0), (10, 10, 0))
    expected_repairs = int(money == (0, 0, 0))
    assert database.execute(
        "select paid_used,journal_head from public.recovery_wave_states where wave_id=%s",
        (world.wave,),
    ).fetchone() == (expected_repairs, expected_repairs)
    assert database.execute(
        "select hp_units,repair_seq from public.island_structure_health "
        "where island_owner=%s and spot='wall_1'",
        (world.owner,),
    ).fetchone() == (500_000 + expected_repairs * 500_000, expected_repairs)
    assert (
        database.execute(
            "select count(*) from public.island_economy_operations "
            "where account_id=%s and is_player_intent",
            (keys(world.initial)[0],),
        ).fetchone()[0]
        == 1
    )
    reconciles(database, keys(world.initial)[0])


@pytest.mark.parametrize("domain", ["arsenal", "wager", "ship"])
def test_actual_domain_replay_after_departure_returns_common_receipt_without_current_treasury(
    database,
    domain,
):
    owner, member, _, initial = prepare_domains(database, 200)
    calls = {
        "arsenal": lambda: buy_copy(database, member, initial, "privacy-buy1"),
        "wager": lambda: open_market_call(database, member, initial, "privacy-bet1"),
    }
    if domain == "ship":
        opened = start_round(database, member, initial, "privacy-start")
        calls["ship"] = lambda: claim_round(database, member, opened, "privacy-claim")
    first = calls[domain]()
    assert first["status"] == "done" and first["repeat"] is False
    receipt = first["receipt"]
    assert set(receipt) == {"receiptId", "actionUid", "action", "actorId", "origin", "result"}
    assert receipt["actorId"] == str(member)
    assert receipt["origin"] == {
        "mode": "island_shared",
        "version": 1,
        "islandOwner": str(owner),
        "accountId": keys(initial)[0],
        "runEpoch": keys(initial)[1],
    }
    assert rpc(database, "game_leave", member, owner)["status"] == "left"
    as_owner(database)
    with authority_outage(database):
        again = calls[domain]()
        assert again["repeat"] is True and again["receipt"] == receipt
        assert again["currentEconomy"] is None
        reconciles(database, keys(initial)[0])
