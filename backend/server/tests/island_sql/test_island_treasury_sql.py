"""Real shared-treasury accounting, authorization and races on disposable PostgreSQL.

Run with CASE_PG_SCRATCH=1 and the existing test-only pgserver/psycopg tools.
Every migration is applied twice; no configured database or credentials are read.
"""

from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

# Register this fixture here so committed races use this module's own cached cluster.
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    add_players,
    as_owner,
    as_server,
    balance,
    call,
    open_island,
)


def rpc(connection, name, *arguments):
    placeholders = ",".join("%s" for _ in arguments)
    return call(connection, f"select public.{name}({placeholders})", *arguments)


def ready(connection, coins=200, *, admitted=True):
    owner, member, outsider = uuid4(), uuid4(), uuid4()
    add_players(connection, owner, member, outsider)
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    number = owner.int
    code = "".join(alphabet[(number >> (5 * index)) % len(alphabet)] for index in range(5))
    open_island(connection, owner, code)
    rpc(connection, "game_join", member, owner, 10)
    result = (
        rpc(connection, "island_treasury_admit", owner, owner, "admit0001", coins)
        if admitted
        else None
    )
    return owner, member, outsider, result


def keys(result):
    current = result["currentEconomy"]
    return current["accountId"], current["runEpoch"]


def spend(connection, actor, result, coins, uid="spend001", reference="build:1"):
    return rpc(
        connection,
        "island_treasury_spend",
        actor,
        *keys(result),
        uid,
        "building_purchase",
        reference,
        coins,
    )


def reserve(connection, actor, result, coins, fee=0, uid="stake001", reference="market:1"):
    return rpc(
        connection,
        "island_treasury_reserve",
        actor,
        *keys(result),
        uid,
        "market_call_stake",
        reference,
        coins,
        fee,
    )


def settle(connection, result, gross, uid="settle01", reference="settle:1"):
    return rpc(connection, "island_treasury_settle", result["receipt"]["id"], gross, reference, uid)


def money(result):
    value = result["currentEconomy"]["treasury"]
    return tuple(int(value[key]) for key in ("balanceCoins", "committedCoins", "availableCoins"))


def reconciles(connection, account_id):
    assert connection.execute(
        "select a.balance_coins = coalesce(sum(t.balance_delta),0), "
        "a.committed_coins = coalesce(sum(t.committed_delta),0), "
        "a.revision = count(t.id) from public.island_economy_accounts a "
        "left join public.island_treasury_transactions t on t.account_id=a.id "
        "where a.id=%s group by a.id",
        (account_id,),
    ).fetchone() == (True, True, True)
    assert connection.execute(
        "select a.committed_coins = coalesce((select sum(r.committed_delta) "
        "from public.island_treasury_transactions r where r.account_id=a.id "
        "and r.kind='reserve' and not exists (select 1 from public.island_treasury_transactions s "
        "where s.source_reservation_id=r.id)),0) from public.island_economy_accounts a "
        "where a.id=%s",
        (account_id,),
    ).fetchone() == (True,)


def test_explicit_admission_grants_once_without_touching_personal_wallet(database):
    owner, _, _, _ = ready(database, admitted=False)
    assert rpc(database, "island_economy_context", owner) == {
        "status": "legacy",
        "islandOwner": str(owner),
    }
    first = rpc(database, "island_treasury_admit", owner, owner, "admit0001", 200)
    again = rpc(database, "island_treasury_admit", owner, owner, "admit0001", 200)
    assert first["repeat"] is False and again["repeat"] is True
    assert first["receipt"] == again["receipt"]
    assert money(again) == (200, 0, 200)
    assert balance(database, owner) == 100
    assert rpc(database, "island_treasury_admit", owner, owner, "admit0002", 999) == {
        "status": "refused",
        "reason": "already_admitted",
    }
    assert rpc(database, "island_treasury_admit", owner, owner, "admit0001", 999) == {
        "status": "refused",
        "reason": "action_conflict",
    }
    reconciles(database, keys(first)[0])


def test_large_available_balance_can_be_fully_reserved_and_winnings_reinvested(database):
    _, member, _, initial = ready(database, 10**30)
    held = reserve(database, member, initial, 10**30)
    assert money(held) == (10**30, 10**30, 0)
    assert spend(database, member, initial, 1) == {
        "status": "refused",
        "reason": "insufficient_funds",
    }
    won = settle(database, held, 2 * 10**30)
    assert money(won) == (2 * 10**30, 0, 2 * 10**30)
    reinvested = reserve(database, member, won, 2 * 10**30, uid="stake002", reference="market:2")
    assert money(reinvested) == (2 * 10**30, 2 * 10**30, 0)
    reconciles(database, keys(initial)[0])


def test_reservation_fee_refund_loss_and_unique_source_settlement(database):
    _, member, _, initial = ready(database, 100)
    held = reserve(database, member, initial, 99, 1)
    assert money(held) == (99, 99, 0)
    assert held["receipt"]["balanceDelta"] == "-1"
    assert held["receipt"]["committedDelta"] == "99"
    lost = settle(database, held, 0)
    assert money(lost) == (0, 0, 0)
    repeat = settle(database, held, 0)
    assert repeat["repeat"] is True and repeat["receipt"] == lost["receipt"]
    assert settle(database, held, 99, uid="settle02", reference="settle:2") == {
        "status": "refused",
        "reason": "reservation_settled",
    }
    reconciles(database, keys(initial)[0])


def test_closing_fee_is_deducted_once_by_the_product_before_returned_payout(database):
    _, member, _, initial = ready(database, 100)
    held = reserve(database, member, initial, 50, 2)
    returned_payout = 150 - 3
    paid = settle(database, held, returned_payout)
    assert money(paid) == (195, 0, 195)
    assert paid["receipt"]["balanceDelta"] == "97"
    reconciles(database, keys(initial)[0])


def test_separate_same_event_bets_are_allowed_and_zero_cash_holds_are_audited(database):
    _, member, _, initial = ready(database, 100)
    for index in range(6):
        held = reserve(
            database, member, initial, 1, uid=f"stake00{index}", reference=f"same-event:{index}"
        )
        assert held["status"] == "done"
        assert held["receipt"]["balanceDelta"] == "0"
    assert money(held) == (100, 6, 94)
    refunded = settle(database, held, 1)
    assert money(refunded) == (100, 5, 95)
    reconciles(database, keys(initial)[0])


def test_retry_keeps_original_receipt_but_returns_fresh_account_state(database):
    owner, member, _, initial = ready(database)
    first = spend(database, member, initial, 20)
    spend(database, owner, initial, 30, uid="spend002", reference="build:2")
    again = spend(database, member, initial, 20)
    assert again["repeat"] is True and again["receipt"] == first["receipt"]
    assert again["receipt"]["balanceAtCommit"] == "180"
    assert money(again) == (150, 0, 150)
    assert spend(database, member, initial, 21) == {
        "status": "refused",
        "reason": "action_conflict",
    }
    reconciles(database, keys(initial)[0])


def test_departed_member_cannot_spend_but_origin_settlement_survives_retirement(database):
    owner, member, outsider, initial = ready(database, 100)
    assert spend(database, outsider, initial, 1) == {"status": "refused", "reason": "not_member"}
    held = reserve(database, member, initial, 50)
    rpc(database, "game_leave", member, owner)
    assert spend(database, member, initial, 1) == {"status": "refused", "reason": "not_member"}
    as_owner(database)
    database.execute(
        "update public.island_economy_accounts set state='retired', "
        "retired_at=clock_timestamp() where id=%s",
        (keys(initial)[0],),
    )
    replacement = database.execute(
        "insert into public.island_economy_accounts(island_owner) values(%s) "
        "returning id,run_epoch",
        (owner,),
    ).fetchone()
    database.execute(
        "update public.island_economy_state set current_account_id=%s,run_epoch=%s "
        "where island_owner=%s",
        (*replacement, owner),
    )
    as_server(database)
    won = settle(database, held, 100)
    assert money(won) == (150, 0, 150) and won["accountState"] == "retired"
    assert database.execute(
        "select balance_coins from public.island_economy_accounts where id=%s", (replacement[0],)
    ).fetchone() == (0,)
    assert spend(database, owner, initial, 1, uid="spend003") == {
        "status": "refused",
        "reason": "path_unavailable",
    }
    reconciles(database, keys(initial)[0])


def test_action_uid_cannot_be_retargeted_to_another_island(database):
    _, member, _, first = ready(database)
    owner_two, _, _, second = ready(database)
    rpc(database, "game_join", member, owner_two, 10)
    assert spend(database, member, first, 10)["status"] == "done"
    assert spend(database, member, second, 10) == {
        "status": "refused",
        "reason": "action_conflict",
    }
    reconciles(database, keys(first)[0])
    reconciles(database, keys(second)[0])


def test_failed_bootstrap_uid_collision_leaves_no_admission_or_orphan_account(database):
    owner_one, _, _, first = ready(database)
    owner_two, _, _, _ = ready(database, admitted=False)
    rpc(database, "game_join", owner_two, owner_one, 10)
    assert spend(database, owner_two, first, 10, uid="cross001")["status"] == "done"
    assert rpc(database, "island_treasury_admit", owner_two, owner_two, "cross001", 200) == {
        "status": "refused",
        "reason": "action_conflict",
    }
    assert rpc(database, "island_economy_context", owner_two) == {
        "status": "legacy",
        "islandOwner": str(owner_two),
    }
    assert database.execute(
        "select count(*) from public.island_economy_accounts where island_owner=%s",
        (owner_two,),
    ).fetchone() == (0,)
    reconciles(database, keys(first)[0])


def test_paused_mode_stays_shared_and_canonical_credits_keep_the_original_account(database):
    owner, member, _, initial = ready(database)
    assert rpc(database, "island_economy_context", uuid4()) == {"status": "missing_island"}
    rpc(database, "game_leave", member, owner)
    as_owner(database)
    database.execute(
        "update public.island_economy_state set admission_state='paused' where island_owner=%s",
        (owner,),
    )
    as_server(database)
    snapshot = rpc(database, "island_economy_context", owner)
    assert snapshot["status"] == "ok" and snapshot["economy"]["mode"] == "island_shared"
    assert snapshot["admissionState"] == "paused"
    assert spend(database, owner, initial, 1) == {
        "status": "refused",
        "reason": "path_unavailable",
    }
    credited = rpc(
        database,
        "island_treasury_credit",
        member,
        *keys(initial),
        "reward01",
        "pirate_loot",
        "wave:canonical",
        50,
    )
    assert money(credited) == (250, 0, 250)
    repeated = rpc(
        database,
        "island_treasury_credit",
        member,
        *keys(initial),
        "reward02",
        "pirate_loot",
        "wave:canonical",
        50,
    )
    assert repeated["repeat"] is True and repeated["receipt"] == credited["receipt"]
    assert rpc(
        database,
        "island_treasury_credit",
        member,
        *keys(initial),
        "reward03",
        "starting_coins",
        "new-grant",
        200,
    ) == {
        "status": "refused",
        "reason": "invalid_change",
    }
    reconciles(database, keys(initial)[0])


@pytest.mark.parametrize(
    "coins", [Decimal("0"), Decimal("-1"), Decimal("1.5"), Decimal("NaN"), Decimal("Infinity")]
)
def test_invalid_money_cannot_mutate_account(database, coins):
    _, member, _, initial = ready(database)
    assert spend(database, member, initial, coins) == {
        "status": "refused",
        "reason": "invalid_change",
    }
    reconciles(database, keys(initial)[0])


def test_tables_and_public_rpcs_are_server_only_and_receipts_are_immutable(database):
    _, member, _, initial = ready(database)
    spent = spend(database, member, initial, 1)
    for table in (
        "island_economy_accounts",
        "island_economy_state",
        "island_treasury_transactions",
    ):
        assert database.execute(
            "select relrowsecurity from pg_class where oid=%s::regclass", (f"public.{table}",)
        ).fetchone() == (True,)
        for role in ("anon", "authenticated"):
            assert database.execute(
                "select has_table_privilege(%s,%s,'select,insert,update,delete')",
                (role, f"public.{table}"),
            ).fetchone() == (False,)
        assert database.execute(
            "select has_table_privilege('service_role',%s,'insert,update,delete')",
            (f"public.{table}",),
        ).fetchone() == (False,)
    for role in ("anon", "authenticated"):
        assert database.execute(
            "select has_function_privilege(%s,"
            "'public.island_treasury_admit(uuid,uuid,text,numeric)','execute')",
            (role,),
        ).fetchone() == (False,)
    as_owner(database)
    with pytest.raises(psycopg.errors.RaiseException, match="receipt_immutable"):
        with database.transaction():
            database.execute(
                "update public.island_treasury_transactions set reference='changed' where id=%s",
                (spent["receipt"]["id"],),
            )


def race(scratch_server, actions):
    barrier = Barrier(len(actions))

    def run(action):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            connection.execute("set lock_timeout='5s'")
            as_server(connection)
            barrier.wait(timeout=5)
            result = action(connection)
            connection.commit()
            return result

    with ThreadPoolExecutor(len(actions)) as pool:
        return list(pool.map(run, actions))


def test_simultaneous_purchase_and_all_in_reservation_share_the_same_funds(
    database, scratch_server
):
    _, member, _, initial = ready(database, 100)
    database.commit()
    results = race(
        scratch_server,
        [
            lambda connection: spend(connection, member, initial, 100),
            lambda connection: reserve(connection, member, initial, 100),
        ],
    )
    assert sorted(result["status"] for result in results) == ["done", "refused"]
    assert next(result for result in results if result["status"] == "refused") == {
        "status": "refused",
        "reason": "insufficient_funds",
    }
    reconciles(database, keys(initial)[0])


def test_simultaneous_admission_and_duplicate_settlement_pay_once(database, scratch_server):
    owner, member, _, _ = ready(database, admitted=False)
    database.commit()
    opened = race(
        scratch_server,
        [
            lambda connection: rpc(
                connection, "island_treasury_admit", owner, owner, "admit0001", 100
            ),
            lambda connection: rpc(
                connection, "island_treasury_admit", owner, owner, "admit0001", 100
            ),
        ],
    )
    assert sorted(result["repeat"] for result in opened) == [False, True]
    as_server(database)
    held = reserve(database, member, opened[0], 100)
    database.commit()
    paid = race(
        scratch_server,
        [
            lambda connection: settle(connection, held, 200),
            lambda connection: settle(connection, held, 200),
        ],
    )
    assert sorted(result["repeat"] for result in paid) == [False, True]
    assert paid[0]["receipt"] == paid[1]["receipt"]
    assert money(paid[0]) == (200, 0, 200)
    reconciles(database, keys(opened[0])[0])


def test_two_different_bootstrap_requests_cannot_create_two_accounts(database, scratch_server):
    owner, _, _, _ = ready(database, admitted=False)
    database.commit()
    results = race(
        scratch_server,
        [
            lambda connection: rpc(
                connection, "island_treasury_admit", owner, owner, "admit0001", 100
            ),
            lambda connection: rpc(
                connection, "island_treasury_admit", owner, owner, "admit0002", 100
            ),
        ],
    )
    assert sorted(result["status"] for result in results) == ["done", "refused"]
    assert next(result for result in results if result["status"] == "refused") == {
        "status": "refused",
        "reason": "already_admitted",
    }
    account_id = next(result for result in results if result["status"] == "done")["currentEconomy"][
        "accountId"
    ]
    assert database.execute(
        "select count(*) from public.island_economy_accounts where island_owner=%s",
        (owner,),
    ).fetchone() == (1,)
    reconciles(database, account_id)
