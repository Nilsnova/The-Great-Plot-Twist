"""Disposable PostgreSQL proof for conservative historical revival refunds; no live access."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_captain_revive_sql import running_wave  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    FRIEND,
    OWNER,
    as_owner,
    as_server,
    balance,
    call,
    ledger,
)
from server.tests.island_sql.test_recovery_revive_sql import context  # noqa: E402

RECONCILE = "select public.recovery_revive_reconcile(%s,%s)"
RUNNER = Path(__file__).resolve().parents[4] / "docs/handoff/reconcile-historical-revives.sql"


def close_wave(database, wave_id):
    as_owner(database)
    database.execute(
        "update public.recovery_wave_states set closed_at=clock_timestamp(),closed_hp='{}'::jsonb "
        "where wave_id=%s",
        (wave_id,),
    )
    database.execute(
        "update public.wave_runs set finished_at=clock_timestamp(),"
        "survived=false,ships_sunk=0,loot=0 "
        "where id=%s",
        (wave_id,),
    )
    as_server(database)


def historical_payment(database, *, closed=True):
    wave_id, target = context(database)
    paid = call(
        database,
        "select public.wave_revive_charge(%s,%s,%s,10,%s,20,5)",
        OWNER,
        wave_id,
        target,
        "historical01",
    )
    assert paid["status"] == "done", paid
    payment_id = database.execute(
        "select id from public.wallet_transactions where player_id=%s "
        "and reason='captain_revive' and ref='revive:historical01'",
        (OWNER,),
    ).fetchone()[0]
    if closed:
        close_wave(database, wave_id)
    return payment_id, wave_id, target


def old_revival(database, wave_id, target, *, payer=OWNER, exact=False):
    token = database.execute(
        "select participant_token from public.recovery_wave_participants "
        "where wave_id=%s and player_id=%s",
        (wave_id, payer),
    ).fetchone()[0]
    payload = {
        "participantToken": str(token),
        "inputUid": "oldrevival01",
        "actorCounter": 1,
        "captain": {"level": 1, "skills": [], "weapon": "musket"},
        "command": {"type": "captain_revive", "targetId": target, "x": 1, "z": 2},
    }
    if exact:
        payload["reviveRef"] = "revive:historical01"
        payload["command"]["downAt"] = 10
    from psycopg.types.json import Jsonb

    call(
        database,
        "select public.recovery_wave_append_event_locked("
        "%s,%s,%s,'oldrevival01',1,0,%s,0,%s::jsonb)",
        wave_id,
        payer,
        token,
        "captain_revive" if exact else "captain_input",
        Jsonb(payload),
    )


def test_dry_run_is_read_only_and_apply_refunds_the_exact_original_amount_once(database):
    payment_id, wave_id, _ = historical_payment(database)
    before = balance(database, OWNER)
    head = database.execute(
        "select journal_head from public.recovery_wave_states where wave_id=%s",
        (wave_id,),
    ).fetchone()[0]
    dry = call(database, "select public.recovery_revive_reconcile(%s)", payment_id)
    assert dry["classification"] == "confirmed_missing"
    assert dry["applied"] is False
    assert dry["amount"] == 25
    assert balance(database, OWNER) == before
    assert ledger(database, OWNER, "admin_adjust") == []

    applied = call(database, RECONCILE, payment_id, True)
    repeated = call(database, RECONCILE, payment_id, True)
    assert applied["classification"] == "refunded"
    assert applied["amount"] == 25 and applied["applied"] is True
    assert repeated["classification"] == "already_refunded"
    assert repeated["applied"] is False
    assert balance(database, OWNER) == before + 25
    assert ledger(database, OWNER, "admin_adjust") == [(25, f"revive_refund:{payment_id}")]
    assert (
        database.execute(
            "select journal_head from public.recovery_wave_states where wave_id=%s",
            (wave_id,),
        ).fetchone()[0]
        == head
    )
    assert (
        database.execute(
            "select count(*) from public.captain_revives where wave_id=%s",
            (wave_id,),
        ).fetchone()[0]
        == 1
    )


@pytest.mark.parametrize("payer,exact", [(OWNER, True), (OWNER, False), (FRIEND, False)])
def test_any_potentially_same_target_old_event_blocks_a_refund(database, payer, exact):
    payment_id, wave_id, target = historical_payment(database, closed=False)
    old_revival(database, wave_id, target.upper(), payer=payer, exact=exact)
    close_wave(database, wave_id)
    answer = call(database, RECONCILE, payment_id, True)
    assert answer["classification"] == ("recorded" if exact else "ambiguous_old_event")
    assert answer["applied"] is False
    assert ledger(database, OWNER, "admin_adjust") == []


def test_successful_legacy_room_revival_cannot_be_inferred_missing(database):
    wave_id = running_wave(database, FRIEND)
    assert (
        call(
            database,
            "select public.wave_revive(%s,%s,'p-friend',10,'historical01',20,5)",
            OWNER,
            wave_id,
        )["status"]
        == "done"
    )
    payment_id = database.execute(
        "select id from public.wallet_transactions where player_id=%s and reason='captain_revive'",
        (OWNER,),
    ).fetchone()[0]
    assert call(database, RECONCILE, payment_id, True)["classification"] == "ambiguous_legacy"
    assert ledger(database, OWNER, "admin_adjust") == []


def test_active_wave_is_pending_without_a_guessed_revival_or_refund(database):
    payment_id, _, _ = historical_payment(database, closed=False)
    assert call(database, RECONCILE, payment_id, True)["classification"] == "pending_active"
    assert ledger(database, OWNER, "admin_adjust") == []


def test_missing_journal_rows_or_orphaned_debit_remain_unresolved(database):
    payment_id, wave_id, _ = historical_payment(database)
    as_owner(database)
    database.execute("delete from public.recovery_wave_events where wave_id=%s", (wave_id,))
    as_server(database)
    assert call(database, RECONCILE, payment_id, True)["classification"] == "incomplete_history"
    as_owner(database)
    database.execute("delete from public.wave_runs where id=%s", (wave_id,))
    as_server(database)
    assert call(database, RECONCILE, payment_id, True)["classification"] == "orphaned_debit"
    assert ledger(database, OWNER, "admin_adjust") == []


def test_receipt_price_or_existing_refund_mismatch_is_never_paid(database):
    payment_id, _, _ = historical_payment(database)
    as_owner(database)
    database.execute(
        "update public.captain_revives set price=30 where player_id=%s",
        (OWNER,),
    )
    as_server(database)
    assert call(database, RECONCILE, payment_id, True)["classification"] == "payment_mismatch"
    call(
        database,
        "select public.apply_wallet_transaction(%s,1,'admin_adjust',%s)",
        OWNER,
        f"revive_refund:{payment_id}",
    )
    assert call(database, RECONCILE, payment_id, True)["classification"] == "refund_conflict"
    assert ledger(database, OWNER, "admin_adjust") == [(1, f"revive_refund:{payment_id}")]


def test_repeat_stays_safe_after_reset_removed_the_receipt(database):
    payment_id, wave_id, _ = historical_payment(database)
    assert call(database, RECONCILE, payment_id, True)["classification"] == "refunded"
    as_owner(database)
    database.execute("delete from public.wave_runs where id=%s", (wave_id,))
    as_server(database)
    assert call(database, RECONCILE, payment_id, True)["classification"] == "already_refunded"
    assert ledger(database, OWNER, "admin_adjust") == [(25, f"revive_refund:{payment_id}")]


def test_refund_ledger_failure_rolls_back_the_balance(database):
    payment_id, _, _ = historical_payment(database)
    before = balance(database, OWNER)
    as_owner(database)
    database.execute("""
        create function public.reject_test_refund() returns trigger language plpgsql as $$
        begin
          if new.reason='admin_adjust' then raise exception 'test_refund_failure'; end if;
          return new;
        end; $$;
        create trigger reject_test_refund before insert on public.wallet_transactions
        for each row execute function public.reject_test_refund();
    """)
    as_server(database)
    with pytest.raises(psycopg.Error, match="test_refund_failure"), database.transaction():
        call(database, RECONCILE, payment_id, True)
    assert balance(database, OWNER) == before
    assert ledger(database, OWNER, "admin_adjust") == []


def test_rpc_is_server_only_and_rejects_invalid_arguments(database):
    signature = "public.recovery_revive_reconcile(bigint,boolean)"
    assert database.execute(
        "select has_function_privilege('anon',%s,'execute'),"
        "has_function_privilege('authenticated',%s,'execute'),"
        "has_function_privilege('service_role',%s,'execute')",
        (signature,) * 3,
    ).fetchone() == (False, False, True)
    assert call(database, RECONCILE, 9223372036854775807, False)["classification"] == "no_payment"
    with pytest.raises(psycopg.Error, match="bad_revive_reconciliation"), database.transaction():
        call(database, RECONCILE, 1, None)


def test_two_concurrent_applies_refund_once(scratch_server):
    with psycopg.connect(scratch_server.get_uri()) as seed:
        payment_id, _, _ = historical_payment(seed)
        before = balance(seed, OWNER)
        seed.commit()

    def apply(_):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            connection.execute("set local lock_timeout='5s'")
            as_server(connection)
            return call(connection, RECONCILE, payment_id, True)["classification"]

    try:
        with psycopg.connect(scratch_server.get_uri()) as preview:
            preview.execute("set transaction read only")
            as_server(preview)
            assert (
                call(preview, RECONCILE, payment_id, False)["classification"] == "confirmed_missing"
            )
            assert balance(preview, OWNER) == before
        with ThreadPoolExecutor(max_workers=2) as executor:
            assert sorted(executor.map(apply, range(2))) == ["already_refunded", "refunded"]
        with psycopg.connect(scratch_server.get_uri()) as check:
            as_server(check)
            assert balance(check, OWNER) == before + 25
            assert ledger(check, OWNER, "admin_adjust") == [(25, f"revive_refund:{payment_id}")]
    finally:
        with psycopg.connect(scratch_server.get_uri()) as cleanup:
            cleanup.execute("delete from auth.users where id in (%s,%s)", (OWNER, FRIEND))


def test_late_join_identity_is_proven_by_the_retained_join_event(database):
    payment_id, wave_id, target = historical_payment(database)
    snapshot = database.execute(
        "select initial_snapshot from public.recovery_wave_states where wave_id=%s",
        (wave_id,),
    ).fetchone()[0]
    assert target not in [
        participant["participantToken"] for participant in snapshot["participants"]
    ]
    assert call(database, RECONCILE, payment_id, False)["classification"] == "confirmed_missing"


def test_unknown_target_and_oversized_history_remain_unresolved(database):
    payment_id, wave_id, target = historical_payment(database, closed=False)
    as_owner(database)
    database.execute(
        "update public.captain_revives set fallen='ffffffff-ffff-4fff-8fff-ffffffffffff' "
        "where player_id=%s",
        (OWNER,),
    )
    as_server(database)
    assert (
        call(database, RECONCILE, payment_id, True)["classification"] == "missing_target_identity"
    )
    as_owner(database)
    database.execute(
        "update public.captain_revives set fallen=%s where player_id=%s", (target, OWNER)
    )
    database.execute(
        "update public.recovery_wave_states set journal_head=50001 where wave_id=%s",
        (wave_id,),
    )
    as_server(database)
    assert call(database, RECONCILE, payment_id, True)["classification"] == "history_too_large"
    assert ledger(database, OWNER, "admin_adjust") == []


def test_shifted_journal_with_the_right_count_is_not_complete_history(database):
    payment_id, wave_id, _ = historical_payment(database)
    as_owner(database)
    database.execute(
        "insert into public.recovery_wave_events "
        "(wave_id,seq,actor_id,participant_token,input_uid,event_kind,effective_tick,payload) "
        "select wave_id,seq+1,actor_id,participant_token,input_uid,event_kind,"
        "effective_tick,payload "
        "from public.recovery_wave_events where wave_id=%s",
        (wave_id,),
    )
    database.execute(
        "delete from public.recovery_wave_events where wave_id=%s and seq=1", (wave_id,)
    )
    as_server(database)
    assert call(database, RECONCILE, payment_id, True)["classification"] == "incomplete_history"
    assert ledger(database, OWNER, "admin_adjust") == []


def test_inconsistent_closed_state_does_not_authorize_refund(database):
    payment_id, wave_id, _ = historical_payment(database, closed=False)
    as_owner(database)
    database.execute(
        "update public.recovery_wave_states set closed_at=clock_timestamp(),closed_hp='[]'::jsonb "
        "where wave_id=%s",
        (wave_id,),
    )
    as_server(database)
    assert call(database, RECONCILE, payment_id, True)["classification"] == "incomplete_history"
    assert ledger(database, OWNER, "admin_adjust") == []


def test_owner_runner_defaults_to_no_work_and_rejects_unbounded_or_bulk_apply(scratch_server):
    script = RUNNER.read_text()
    with psycopg.connect(scratch_server.get_uri(), autocommit=True) as connection:
        before = connection.execute("select count(*) from public.wallet_transactions").fetchone()[0]
        connection.execute(script)
        assert (
            connection.execute("select count(*) from public.wallet_transactions").fetchone()[0]
            == before
        )
        bulk = script.replace("'{}'::bigint[]", "'{1,2}'::bigint[]").replace(
            "c_apply constant boolean := false;",
            "c_apply constant boolean := true;",
        )
        with pytest.raises(psycopg.Error, match="Apply exactly one approved payment"):
            connection.execute(bulk)
        connection.execute("rollback")
        oversized = script.replace("'{}'::bigint[]", "array(select generate_series(1,101))")
        with pytest.raises(psycopg.Error, match="at most 100 positive"):
            connection.execute(oversized)
        connection.execute("rollback")
        assert (
            connection.execute("select count(*) from public.wallet_transactions").fetchone()[0]
            == before
        )


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"command": []},
        {"command": {"targetId": "missing-type"}},
        {"command": {"type": "captain_revive", "targetId": 3}},
        {"command": {"type": "captain_revive", "targetId": "not-a-token"}},
    ],
)
def test_unreadable_input_history_does_not_prove_a_missing_revival(database, payload):
    from psycopg.types.json import Jsonb

    payment_id, wave_id, _ = historical_payment(database, closed=False)
    call(
        database,
        "select public.recovery_wave_append_event_locked("
        "%s,null,null,null,null,null,'captain_input',0,%s::jsonb)",
        wave_id,
        Jsonb(payload),
    )
    close_wave(database, wave_id)
    assert call(database, RECONCILE, payment_id, True)["classification"] == "incomplete_history"
    assert ledger(database, OWNER, "admin_adjust") == []
