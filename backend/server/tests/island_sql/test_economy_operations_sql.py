"""Global free/paid intent isolation on disposable PostgreSQL; no configured database."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    as_owner,
    keys,
    money,
    ready,
    reconciles,
    rpc,
    spend,
)

MIGRATION = (
    Path(__file__).resolve().parents[4]
    / "supabase/migrations/20261118050150_island_economy_operations.sql"
)


def claim(connection, actor, account, epoch, uid, domain, fingerprint):
    return rpc(
        connection,
        "island_economy_claim_operation_locked",
        actor,
        account,
        epoch,
        uid,
        domain,
        Jsonb(fingerprint),
    )


def effect(connection, operation_id, key="charge"):
    return rpc(connection, "island_economy_effect_uid", operation_id, key)


class DomainRefusal(Exception):
    def __init__(self, reply):
        self.reply = reply


def apply_intent(connection, actor, initial, uid, domain, fingerprint, *, price=0, fail=False):
    """Model an encompassing domain transaction, including rollback on business refusal."""
    try:
        with connection.transaction():
            as_owner(connection)
            account, epoch = keys(initial)
            owner = initial["currentEconomy"]["islandOwner"]
            rpc(connection, "island_treasury_lock_scope", owner)
            connection.execute(
                "select id from public.island_economy_accounts where id=%s for update", (account,)
            )
            result = claim(connection, actor, account, epoch, uid, domain, fingerprint)
            if result["status"] != "claimed":
                return result
            if price:
                financial = spend(
                    connection,
                    actor,
                    initial,
                    price,
                    uid=effect(connection, result["operationId"]),
                    reference="operation:" + result["operationId"],
                )
                if financial["status"] != "done":
                    raise DomainRefusal(financial)
            connection.execute(
                "update public.islands set flags=flags+1 where player_id=%s", (owner,)
            )
            if fail:
                raise DomainRefusal({"status": "refused", "reason": "simulated_failure"})
            return {**result, "status": "done"}
    except DomainRefusal as error:
        return error.reply


def operation_count(connection, actor, uid):
    return connection.execute(
        "select count(*) from public.island_economy_operations where actor_id=%s and action_uid=%s",
        (actor, uid),
    ).fetchone()[0]


@pytest.mark.parametrize("first_price,second_price", [(0, 10), (10, 0)])
def test_free_and_paid_domains_cannot_reuse_one_intent_in_either_order(
    database,
    first_price,
    second_price,
):
    _, actor, _, initial = ready(database)
    first_domain = "construction:build" if first_price else "house:role"
    second_domain = "construction:build" if second_price else "house:role"
    first = apply_intent(
        database, actor, initial, "intent001", first_domain, {"quote": "first"}, price=first_price
    )
    refused = apply_intent(
        database,
        actor,
        initial,
        "intent001",
        second_domain,
        {"quote": "second"},
        price=second_price,
    )
    assert first["status"] == "done"
    assert refused == {"status": "refused", "reason": "action_conflict"}
    assert operation_count(database, actor, "intent001") == 1
    assert (
        database.execute(
            "select balance_coins from public.island_economy_accounts where id=%s",
            (keys(initial)[0],),
        ).fetchone()[0]
        == 200 - first_price
    )
    reconciles(database, keys(initial)[0])


def test_matching_replay_precedes_mutable_price_or_state_validation(database):
    _, actor, _, initial = ready(database)
    first = apply_intent(
        database, actor, initial, "intent001", "construction:build", {"quote": "v1"}, price=10
    )
    again = apply_intent(
        database, actor, initial, "intent001", "construction:build", {"quote": "v1"}, price=10**40
    )
    assert again == {"status": "replay", "operationId": first["operationId"], "repeat": True}
    assert apply_intent(
        database, actor, initial, "intent001", "construction:build", {"quote": "v2"}
    ) == {"status": "refused", "reason": "action_conflict"}
    reconciles(database, keys(initial)[0])


@pytest.mark.parametrize("raw_first", [False, True])
def test_raw_financial_and_free_claim_share_the_same_global_namespace(database, raw_first):
    _, actor, _, initial = ready(database)
    as_owner(database)
    if raw_first:
        assert spend(database, actor, initial, 10, uid="intent001")["status"] == "done"
        refused = apply_intent(database, actor, initial, "intent001", "house:role", {})
    else:
        assert (
            apply_intent(database, actor, initial, "intent001", "house:role", {})["status"]
            == "done"
        )
        refused = spend(database, actor, initial, 10, uid="intent001")
    assert refused == {"status": "refused", "reason": "action_conflict"}
    assert operation_count(database, actor, "intent001") == 1
    reconciles(database, keys(initial)[0])


def test_post_claim_business_failure_rolls_back_intent_charge_and_domain_mutation(database):
    owner, actor, _, initial = ready(database)
    result = apply_intent(
        database, actor, initial, "intent001", "construction:build", {}, price=10, fail=True
    )
    assert result == {"status": "refused", "reason": "simulated_failure"}
    assert operation_count(database, actor, "intent001") == 0
    assert database.execute(
        "select flags from public.islands where player_id=%s", (owner,)
    ).fetchone() == (0,)
    assert (
        apply_intent(database, actor, initial, "intent001", "construction:build", {}, price=10)[
            "status"
        ]
        == "done"
    )
    reconciles(database, keys(initial)[0])


def test_cross_account_and_personal_retargeting_conflicts_with_original_intent(database):
    _, actor, _, initial = ready(database)
    _, _, _, other = ready(database)
    first = apply_intent(database, actor, initial, "intent001", "house:role", {})
    as_owner(database)
    assert claim(database, actor, *keys(other), "intent001", "house:role", {}) == {
        "status": "refused",
        "reason": "action_conflict",
    }
    assert claim(database, actor, None, None, "intent001", "captain:role", {}) == {
        "status": "refused",
        "reason": "action_conflict",
    }
    personal = claim(database, actor, None, None, "personal1", "captain:role", {"role": "medic"})
    assert personal["status"] == "claimed" and personal["operationId"] != first["operationId"]
    assert claim(database, actor, *keys(initial), "personal1", "house:role", {}) == {
        "status": "refused",
        "reason": "action_conflict",
    }


def race(server, actions):
    barrier = Barrier(len(actions))

    def run(action):
        with psycopg.connect(server.get_uri()) as connection:
            connection.execute("set lock_timeout='5s'")
            barrier.wait(timeout=5)
            result = action(connection)
            connection.commit()
            return result

    with ThreadPoolExecutor(len(actions)) as pool:
        return list(pool.map(run, actions))


def test_concurrent_identical_claims_create_one_effect(database, scratch_server):
    _, actor, _, initial = ready(database)
    database.commit()
    results = race(
        scratch_server,
        [
            lambda c: apply_intent(
                c, actor, initial, "intent001", "construction:build", {}, price=10
            ),
            lambda c: apply_intent(
                c, actor, initial, "intent001", "construction:build", {}, price=10
            ),
        ],
    )
    assert sorted(row["status"] for row in results) == ["done", "replay"]
    assert results[0]["operationId"] == results[1]["operationId"]
    as_owner(database)
    reconciles(database, keys(initial)[0])


@pytest.mark.parametrize("raw", [False, True])
def test_concurrent_cross_account_claim_and_raw_races_never_commit_both(
    database,
    scratch_server,
    raw,
):
    _, actor, _, initial = ready(database)
    second_owner, _, _, other = ready(database)
    rpc(database, "game_join", actor, second_owner, 10)
    database.commit()
    second = (
        (lambda c: spend(c, actor, other, 10, uid="intent001"))
        if raw
        else (lambda c: apply_intent(c, actor, other, "intent001", "research:advance", {}))
    )
    results = race(
        scratch_server,
        [
            lambda c: apply_intent(c, actor, initial, "intent001", "house:role", {}),
            second,
        ],
    )
    assert sum(row["status"] == "done" for row in results) == 1
    assert {"status": "refused", "reason": "action_conflict"} in results
    as_owner(database)
    assert operation_count(database, actor, "intent001") == 1
    reconciles(database, keys(initial)[0])
    reconciles(database, keys(other)[0])


def test_children_require_exact_root_actor_account_and_epoch(database):
    owner, actor, _, initial = ready(database)
    other_owner, other_actor, _, other = ready(database)
    rpc(database, "game_join", actor, other_owner, 10)
    rpc(database, "game_join", other_actor, owner, 10)
    as_owner(database)
    root = claim(database, actor, *keys(initial), "intent001", "construction:build", {})
    child = effect(database, root["operationId"])
    assert spend(database, actor, other, 1, uid=child) == {
        "status": "refused",
        "reason": "action_conflict",
    }
    assert spend(database, other_actor, initial, 1, uid=child) == {
        "status": "refused",
        "reason": "action_conflict",
    }
    assert spend(database, actor, initial, 1, uid=effect(database, uuid4())) == {
        "status": "refused",
        "reason": "action_conflict",
    }
    assert claim(database, actor, *keys(initial), child, "construction:build", {}) == {
        "status": "refused",
        "reason": "invalid_change",
    }
    assert spend(database, actor, initial, 1, uid=child)["status"] == "done"


@pytest.mark.parametrize(
    "account,epoch,uid,domain,fingerprint",
    [
        (None, "epoch", "intent001", "house:role", {}),
        ("account", None, "intent001", "house:role", {}),
        ("account", "epoch", "sys_00000000000000000000000000000001_settle", "house:role", {}),
        ("account", "epoch", "intent001", "UPPER", {}),
        ("account", "epoch", "intent001", "house:role", []),
    ],
)
def test_invalid_claims_leave_no_operation(database, account, epoch, uid, domain, fingerprint):
    _, actor, _, initial = ready(database)
    as_owner(database)
    result = claim(
        database,
        actor,
        keys(initial)[0] if account is not None else None,
        keys(initial)[1] if epoch is not None else None,
        uid,
        domain,
        fingerprint,
    )
    assert result == {"status": "refused", "reason": "invalid_change"}
    assert operation_count(database, actor, uid) == 0


def test_new_claim_with_wrong_epoch_creates_no_identity(database):
    _, actor, _, initial = ready(database)
    as_owner(database)
    assert claim(database, actor, keys(initial)[0], uuid4(), "intent001", "house:role", {}) == {
        "status": "refused",
        "reason": "epoch_mismatch",
    }
    assert operation_count(database, actor, "intent001") == 0


def test_reapplying_backfill_preserves_valid_children_without_extra_operations(database):
    _, actor, _, initial = ready(database)
    assert (
        apply_intent(database, actor, initial, "intent001", "construction:build", {}, price=10)[
            "status"
        ]
        == "done"
    )
    count = database.execute("select count(*) from public.island_economy_operations").fetchone()
    database.execute(MIGRATION.read_text())
    assert (
        database.execute("select count(*) from public.island_economy_operations").fetchone()
        == count
    )


@pytest.mark.parametrize("prefix", ["fx_", "sys_"])
def test_prefixed_historic_financial_rows_backfill_as_opaque_history(database, prefix):
    _, actor, _, initial = ready(database)
    as_owner(database)
    database.execute(
        "drop trigger island_treasury_operation_identity on public.island_treasury_transactions"
    )
    uid = prefix + uuid4().hex + "_charge"
    old = spend(database, actor, initial, 10, uid=uid)
    database.execute(MIGRATION.read_text())
    assert database.execute(
        "select is_player_intent from public.island_economy_operations "
        "where actor_id=%s and action_uid=%s",
        (actor, uid),
    ).fetchone() == (False,)
    assert claim(database, actor, *keys(initial), uid, "construction:build", {}) == {
        "status": "refused",
        "reason": "invalid_change",
    }
    assert spend(database, actor, initial, 10, uid=uid)["receipt"] == old["receipt"]


def test_source_settlement_survives_departure_and_retired_origin_without_new_run_credit(database):
    owner, actor, _, initial = ready(database, 100)
    as_owner(database)
    root = claim(database, actor, *keys(initial), "intent001", "harbor:open", {})
    reserved = rpc(
        database,
        "island_treasury_reserve",
        actor,
        *keys(initial),
        effect(database, root["operationId"], "stake"),
        "market_call_stake",
        "bet:1",
        50,
        0,
    )
    rpc(database, "game_leave", actor, owner)
    database.execute(
        "update public.island_economy_accounts set state='retired',retired_at=clock_timestamp() "
        "where id=%s",
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
    uid = rpc(database, "island_economy_system_uid", reserved["receipt"]["id"], "settle")
    paid = rpc(database, "island_treasury_settle", reserved["receipt"]["id"], 100, "settle:1", uid)
    assert money(paid) == (150, 0, 150) and paid["accountState"] == "retired"
    assert database.execute(
        "select balance_coins from public.island_economy_accounts where id=%s", (replacement[0],)
    ).fetchone() == (0,)
    assert claim(database, actor, *replacement, "intent001", "harbor:open", {}) == {
        "status": "refused",
        "reason": "action_conflict",
    }
    assert claim(database, actor, *keys(initial), "newroot1", "harbor:open", {}) == {
        "status": "refused",
        "reason": "path_unavailable",
    }
    reconciles(database, keys(initial)[0])


def test_registry_and_helpers_are_private_and_history_is_immutable(database):
    _, actor, _, initial = ready(database)
    as_owner(database)
    row = claim(database, actor, *keys(initial), "intent001", "house:role", {})
    for role in ("anon", "authenticated", "service_role"):
        assert database.execute(
            "select has_function_privilege(%s,"
            "'public.island_economy_claim_operation_locked(uuid,uuid,uuid,text,text,jsonb)',"
            "'execute')",
            (role,),
        ).fetchone() == (False,)
        assert database.execute(
            "select has_table_privilege(%s,'public.island_economy_operations',"
            "'insert,update,delete')",
            (role,),
        ).fetchone() == (False,)
    with pytest.raises(psycopg.errors.RaiseException, match="operation_immutable"):
        with database.transaction():
            database.execute(
                "update public.island_economy_operations set fingerprint='{}' where id=%s",
                (row["operationId"],),
            )
