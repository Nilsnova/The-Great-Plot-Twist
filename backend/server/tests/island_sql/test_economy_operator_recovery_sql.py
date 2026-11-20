"""Operator CAS/replay and attacker/race checks on disposable PostgreSQL only."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    as_owner,
    keys,
    money,
    ready,
    reconciles,
    reserve,
    rpc,
    settle,
    spend,
)
from server.tests.island_sql.test_islands_and_waves_sql import as_server, balance, start  # noqa: E402


def context(connection, owner):
    as_server(connection)
    return rpc(connection, "island_economy_operator_context", owner)


def control(
    connection, owner, initial, uid="operator_pause01", revision=0, before="active", target="paused"
):
    as_server(connection)
    return rpc(
        connection,
        "island_economy_set_offers",
        uid,
        owner,
        *keys(initial),
        revision,
        before,
        target,
    )


def test_pause_resume_old_pause_replay_never_repauses_or_changes_money(database):
    owner, member, _, initial = ready(database)
    held = reserve(database, member, initial, 50)
    wallet = balance(database, owner)
    paused = control(database, owner, initial)
    assert paused["current"]["admissionState"] == "paused"
    assert spend(database, member, initial, 1)["reason"] == "path_unavailable"
    assert start(database, owner, "fenced_pause01", owner=owner)["reason"] == (
        "economy_context_required"
    )
    paid = settle(database, held, 75)
    assert money(paid) == (225, 0, 225)
    resumed = control(database, owner, initial, "operator_resume01", 1, "paused", "active")
    assert resumed["current"]["controlRevision"] == "2"
    repeated = control(database, owner, initial)
    assert repeated["repeat"] is True and repeated["receipt"] == paused["receipt"]
    assert repeated["current"]["admissionState"] == "active"
    assert repeated["current"]["controlRevision"] == "2"
    assert context(database, owner)["economy"]["revision"] == paid["currentEconomy"]["revision"]
    assert balance(database, owner) == wallet
    as_owner(database)
    reconciles(database, keys(initial)[0])
    assert database.execute(
        "select count(*) from public.island_treasury_transactions "
        "where account_id=%s and reason='starting_coins'",
        (keys(initial)[0],),
    ).fetchone() == (1,)


@pytest.mark.parametrize("change", ["owner", "account", "epoch", "revision", "states"])
def test_changed_operator_uid_is_not_another_transition(database, change):
    owner, _, _, initial = ready(database)
    first = control(database, owner, initial)
    arguments = ["operator_pause01", owner, *keys(initial), 0, "active", "paused"]
    if change in {"owner", "account", "epoch"}:
        arguments[{"owner": 1, "account": 2, "epoch": 3}[change]] = uuid4()
    elif change == "revision":
        arguments[4] = 8
    else:
        arguments[5:] = ["paused", "active"]
    assert rpc(database, "island_economy_set_offers", *arguments) == {
        "status": "refused",
        "reason": "action_conflict",
    }
    assert context(database, owner) == first["current"]


def test_stale_control_generation_cannot_pass_after_state_cycles(database):
    owner, _, _, initial = ready(database)
    control(database, owner, initial)
    control(database, owner, initial, "operator_resume01", 1, "paused", "active")
    assert control(database, owner, initial, "different_pause01") == {
        "status": "refused",
        "reason": "control_revision_mismatch",
    }
    assert context(database, owner)["admissionState"] == "active"


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_browser_roles_cannot_call_or_forge_service_authority(database, role):
    owner, _, _, initial = ready(database)
    database.execute(f"set local role {role}")
    database.execute('set local request.jwt.claims = \'{"role":"service_role"}\'')
    for name, args in [
        ("island_economy_operator_context", (owner,)),
        (
            "island_economy_set_offers",
            ("operator_pause01", owner, *keys(initial), 0, "active", "paused"),
        ),
    ]:
        with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
            rpc(database, name, *args)
    as_owner(database)
    assert database.execute(
        "select relrowsecurity from pg_class "
        "where oid='island_economy_private.operator_offer_receipts'::regclass"
    ).fetchone() == (True,)
    assert context(database, owner)["admissionState"] == "active"


@pytest.mark.parametrize("same_uid", [False, True])
def test_concurrent_controls_have_one_effect(scratch_server, same_uid):
    with psycopg.connect(scratch_server.get_uri()) as connection:
        owner, _, _, initial = ready(connection)
    gate = Barrier(2)

    def execute(index):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            gate.wait(timeout=10)
            uid = "operator_same01" if same_uid else f"operator_race0{index}"
            return control(connection, owner, initial, uid)

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(execute, range(2)))
    with psycopg.connect(scratch_server.get_uri()) as connection:
        assert context(connection, owner)["controlRevision"] == "1"
        assert context(connection, owner)["admissionState"] == "paused"
    if same_uid:
        assert sorted(row["repeat"] for row in results) == [False, True]
        assert results[0]["receipt"] == results[1]["receipt"]
    else:
        assert sorted(row["status"] for row in results) == ["done", "refused"]


def test_receipt_failure_rolls_back_pause_and_control_generation(database):
    owner, _, _, initial = ready(database)
    as_owner(database)
    database.execute("""
      create function pg_temp.fail_operator_receipt() returns trigger language plpgsql as $$
      begin raise exception 'operator_receipt_failure'; end $$;
      create trigger operator_fault before insert
        on island_economy_private.operator_offer_receipts
        for each row execute function pg_temp.fail_operator_receipt();
    """)
    with pytest.raises(psycopg.errors.RaiseException), database.transaction():
        control(database, owner, initial)
    assert context(database, owner)["admissionState"] == "active"
    assert context(database, owner)["controlRevision"] == "0"


def test_operator_cannot_admit_a_legacy_island_or_resume_a_different_origin(database):
    owner, _, _, _ = ready(database, admitted=False)
    assert context(database, owner) == {"status": "refused", "reason": "not_admitted"}
    as_server(database)
    assert (
        rpc(
            database,
            "island_economy_set_offers",
            "operator_pause01",
            owner,
            uuid4(),
            uuid4(),
            0,
            "active",
            "paused",
        )["status"]
        == "refused"
    )
    initial = rpc(database, "island_treasury_admit", owner, owner, "admit0001", 200)
    changed = {**initial, "currentEconomy": {**initial["currentEconomy"], "runEpoch": str(uuid4())}}
    assert control(database, owner, changed)["reason"] == "origin_mismatch"
    assert context(database, owner)["controlRevision"] == "0"


def test_private_operator_receipt_is_immutable_and_not_directly_writable(database):
    owner, _, _, initial = ready(database)
    control(database, owner, initial)
    with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
        database.execute("delete from island_economy_private.operator_offer_receipts")
    as_owner(database)
    with pytest.raises(psycopg.errors.RaiseException), database.transaction():
        database.execute("delete from island_economy_private.operator_offer_receipts")


def test_retired_account_cannot_be_resumed(database):
    owner, _, _, initial = ready(database)
    control(database, owner, initial)
    as_owner(database)
    # Inconsistent retained-pointer fixture: even this cannot revive a retired account.
    database.execute(
        "update public.island_economy_accounts set state='retired', "
        "retired_at=clock_timestamp() where id=%s",
        (keys(initial)[0],),
    )
    result = control(database, owner, initial, "operator_resume01", 1, "paused", "active")
    assert result == {"status": "refused", "reason": "account_retired"}
    assert context(database, owner)["admissionState"] == "paused"


def test_already_frozen_wave_can_close_after_operator_pause(database):
    from server.tests.island_sql.test_wave_treasury_settlement_sql import (
        close,
        confirm,
        freeze,
        ready_wave,
    )

    wave = ready_wave(database)
    freeze(database, wave)
    confirm(database, wave, wave.owner)
    control(database, wave.owner, wave.treasury)
    wallet = balance(database, wave.owner)
    completed = close(database, wave)
    repeated = close(database, wave)
    assert completed["status"] == "done" and repeated["repeat"] is True
    assert completed["treasuryReceiptId"] == repeated["treasuryReceiptId"]
    assert completed["economy"]["accountId"] == keys(wave.treasury)[0]
    assert balance(database, wave.owner) == wallet
    assert context(database, wave.owner)["admissionState"] == "paused"


def test_pause_and_last_funds_write_have_one_compatible_lock_order(scratch_server):
    with psycopg.connect(scratch_server.get_uri()) as connection:
        owner, member, _, initial = ready(connection)
    gate = Barrier(2)

    def execute(action):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            gate.wait(timeout=10)
            return (
                control(connection, owner, initial, "operator_funds01")
                if action == "pause"
                else spend(connection, member, initial, 200)
            )

    with ThreadPoolExecutor(2) as pool:
        paused, purchase = list(pool.map(execute, ["pause", "spend"]))
    assert paused["status"] == "done"
    assert purchase["status"] in ("done", "refused")
    with psycopg.connect(scratch_server.get_uri()) as connection:
        current = context(connection, owner)
        expected = "0" if purchase["status"] == "done" else "200"
        assert current["admissionState"] == "paused"
        assert current["economy"]["treasury"]["availableCoins"] == expected
        as_owner(connection)
        reconciles(connection, keys(initial)[0])
