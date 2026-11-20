"""Private reset-treasury transitions and original obligations on disposable PostgreSQL.

The test wrapper stands in for a future encompassing domain transaction. It is not a
production reset route and the dummy asset proves transaction rollback only.
"""

from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    keys,
    money,
    ready,
    reconciles,
    reserve,
    rpc,
    settle,
    spend,
)
from server.tests.island_sql.test_islands_and_waves_sql import as_owner, as_server  # noqa: E402


@pytest.fixture
def prepared(database):
    owner, member, outsider, treasury = ready(database, 100)
    as_owner(database)
    database.execute(
        "insert into public.island_recovery_state(island_owner) values(%s) on conflict do nothing",
        (owner,),
    )
    database.execute("create table public.reset_test_assets(owner_id uuid primary key)")
    database.execute("insert into public.reset_test_assets values(%s)", (owner,))
    database.execute("""
      create function public.reset_test_transaction(actor uuid, account uuid, epoch uuid,
        uid text, fingerprint jsonb, starting numeric, fail_after boolean default false)
      returns jsonb language plpgsql security definer set search_path='' as $$
      declare v_owner uuid; claim jsonb; result jsonb;
      begin
        select island_owner into strict v_owner
          from public.island_economy_accounts where id=account;
        perform public.island_treasury_lock_scope(v_owner);
        perform 1 from public.island_economy_accounts where id=account for update;
        claim:=public.island_economy_claim_operation_locked(actor,account,epoch,uid,
          'lifecycle:reset',fingerprint);
        if claim->>'status'='refused' then return claim; end if;
        if claim->>'status'='claimed' then
          perform 1 from public.profiles where id=actor for no key update;
          perform 1 from public.personal_captain_profiles where player_id=actor for update;
          perform 1 from public.islands where player_id=v_owner for update;
          delete from public.reset_test_assets where owner_id=v_owner;
        end if;
        result:=public.island_economy_reset_treasury_locked((claim->>'operationId')::uuid,
          starting,'test-policy-v1','{"dummyAssets":1}'::jsonb);
        if fail_after then raise exception 'reset_test_failure'; end if;
        return result;
      exception when raise_exception then
        return jsonb_build_object('status','refused','reason',sqlerrm);
      end $$;
      revoke all on function public.reset_test_transaction(
        uuid,uuid,uuid,text,jsonb,numeric,boolean)
        from public,anon,authenticated;
      grant execute on function public.reset_test_transaction(
        uuid,uuid,uuid,text,jsonb,numeric,boolean)
        to service_role;
    """)
    yield owner, member, outsider, treasury
    database.rollback()
    as_owner(database)
    database.execute(
        "drop function if exists public.reset_test_transaction("
        "uuid,uuid,uuid,text,jsonb,numeric,boolean)"
    )
    database.execute("drop table if exists public.reset_test_assets")
    database.commit()


def reset(connection, actor, treasury, uid="reset001", *, starting=200, fail=False, payload=None):
    as_server(connection)
    return rpc(
        connection,
        "reset_test_transaction",
        actor,
        *keys(treasury),
        uid,
        Jsonb(payload or {"confirmation": "synthetic-owner-confirmation"}),
        starting,
        fail,
    )


def account_count(connection, owner):
    as_owner(connection)
    return connection.execute(
        "select count(*) from public.island_economy_accounts where island_owner=%s", (owner,)
    ).fetchone()[0]


def test_reset_with_open_bet_keeps_old_cash_and_settles_only_the_original_account(
    database, prepared
):
    owner, member, _, treasury = prepared
    held = reserve(database, member, treasury, 70)
    result = reset(database, owner, treasury)
    assert result["status"] == "done", result
    effect = result["receipt"]["result"]
    assert effect["retiredTreasury"] == {
        "balanceCoins": "100",
        "committedCoins": "70",
        "availableCoins": "30",
        "revision": "2",
    }
    assert money(result) == (200, 0, 200)
    assert spend(database, owner, treasury, 1)["reason"] == "path_unavailable"
    rpc(database, "game_leave", member, owner)
    settled = settle(database, held, 150)
    assert money(settled) == (180, 0, 180)
    replay = reset(database, owner, treasury)
    assert replay["receipt"] == result["receipt"]
    assert money(replay) == (200, 0, 200)
    reconciles(database, keys(treasury)[0])
    reconciles(database, effect["newAccountId"])


def test_later_reset_replay_cannot_republish_an_earlier_replacement(database, prepared):
    owner, _, _, treasury = prepared
    first = reset(database, owner, treasury)
    second = reset(database, owner, first, "reset002")
    replay = reset(database, owner, treasury, starting=999)
    assert replay["receipt"] == first["receipt"] and replay["currentEconomy"] is None
    assert money(second) == (200, 0, 200)
    assert account_count(database, owner) == 3


def test_failed_outer_reset_rolls_back_root_assets_retirement_pointer_and_grant(database, prepared):
    owner, _, _, treasury = prepared
    result = reset(database, owner, treasury, fail=True)
    assert result == {"status": "refused", "reason": "reset_test_failure"}
    assert account_count(database, owner) == 1
    assert database.execute("select count(*) from public.reset_test_assets").fetchone() == (1,)
    assert database.execute(
        "select count(*) from public.island_economy_reset_receipts"
    ).fetchone() == (0,)
    assert database.execute(
        "select count(*) from public.island_economy_operations "
        "where actor_id=%s and action_uid='reset001'",
        (owner,),
    ).fetchone() == (0,)
    assert reset(database, owner, treasury)["status"] == "done"


@pytest.mark.parametrize("window", ["countdown", "expired", "recovery"])
def test_unsealed_reservation_prevents_reset_without_an_orphan_claim(database, prepared, window):
    owner, _, _, treasury = prepared
    as_owner(database)
    if window == "recovery":
        database.execute(
            "update public.island_recovery_state set current_wave_id=%s,"
            "reserved_at=clock_timestamp(),starts_at=clock_timestamp()+interval '1 minute',"
            "expires_at=clock_timestamp()+interval '2 minutes' where island_owner=%s",
            (uuid4(), owner),
        )
    else:
        database.execute(
            """insert into public.wave_runs(started_by,island_owner,action_uid,place,
          wave,seed,starts_at,minimum_seconds,maximum_seconds,weather_kind,weather_ships,weather_fog)
          values(%s,%s,'resetwave','island',1,1,
            clock_timestamp()+%s*interval '1 minute',1,60,'calm',1,1)""",
            (owner, owner, -600 if window == "expired" else 1),
        )
    assert reset(database, owner, treasury)["reason"] == "wave_running"
    assert account_count(database, owner) == 1


def test_nonowner_and_changed_or_crossdomain_intents_never_get_an_extra_grant(database, prepared):
    owner, member, _, treasury = prepared
    assert reset(database, member, treasury)["reason"] == "not_owner"
    current = reset(database, owner, treasury)
    assert current["status"] == "done"
    assert (
        reset(database, owner, treasury, payload={"confirmation": "changed"})["reason"]
        == "action_conflict"
    )
    assert spend(database, owner, current, 1, uid="reset001")["reason"] == "action_conflict"
    assert account_count(database, owner) == 2


def test_private_helper_and_history_are_not_service_or_browser_write_capabilities(
    database, prepared
):
    owner, _, _, treasury = prepared
    result = reset(database, owner, treasury)
    as_owner(database)
    for role in ("anon", "authenticated", "service_role"):
        assert database.execute(
            "select has_function_privilege(%s,"
            "'public.island_economy_reset_treasury_locked(uuid,numeric,text,jsonb)','execute')",
            (role,),
        ).fetchone() == (False,)
    with (
        pytest.raises(psycopg.errors.RaiseException, match="reset_history_immutable"),
        database.transaction(),
    ):
        database.execute(
            "delete from public.island_economy_reset_receipts where id=%s",
            (result["receipt"]["receiptId"],),
        )


@pytest.mark.parametrize("capital", [0, 10**40])
def test_grant_is_exact_once_including_zero_and_large_configured_capital(
    database, prepared, capital
):
    owner, _, _, treasury = prepared
    result = reset(database, owner, treasury, starting=capital)
    assert money(result) == (capital, 0, capital)
    assert result["receipt"]["result"]["startingCoins"] == str(capital)
    as_owner(database)
    uid = database.execute(
        "select action_uid from public.island_treasury_transactions where id=%s",
        (result["receipt"]["result"]["grantReceiptId"],),
    ).fetchone()[0]
    assert uid == "sys_" + keys(result)[1].replace("-", "") + "_run_start"
    assert reset(database, owner, treasury, starting=999)["receipt"] == result["receipt"]
    reconciles(database, keys(result)[0])


def test_unclosed_shared_accounting_blocks_reset_even_without_an_unfinished_wave_row(
    database, prepared
):
    owner, _, _, treasury = prepared
    as_owner(database)
    database.execute(
        """insert into public.island_wave_accounting(wave_id,island_owner,account_id,
      run_epoch,wave_protocol,played_wave,seed,started_by,starts_at,maximum_seconds,roster,
      reward_basis,request_fingerprint)
      values(%s,%s,%s,%s,2,1,1,%s,clock_timestamp(),60,'[]','{}','{}')""",
        (uuid4(), owner, *keys(treasury), owner),
    )
    assert reset(database, owner, treasury)["reason"] == "wave_running"
    assert account_count(database, owner) == 1


def test_treasury_half_preserves_personal_state_and_does_not_claim_production_asset_cleanup(
    database, prepared
):
    owner, _, _, treasury = prepared
    commitment, other_wave = uuid4(), uuid4()
    as_owner(database)
    database.execute(
        """insert into public.personal_captain_profiles(player_id,level,won_wave_best,
      earned_points,role,rules,assignment_wave_id) values(%s,3,9,4,'engineer','{}',%s)""",
        (owner, other_wave),
    )
    database.execute(
        "insert into public.personal_engineer_commitments(id,player_id) values(%s,%s)",
        (commitment, owner),
    )
    database.execute(
        "update public.personal_captain_profiles set pending_engineer_commitment_id=%s "
        "where player_id=%s",
        (commitment, owner),
    )
    database.execute(
        "update public.islands set captain_level=3,crew_gunner=2 where player_id=%s", (owner,)
    )
    before = database.execute(
        "select to_jsonb(p) from public.personal_captain_profiles p where player_id=%s", (owner,)
    ).fetchone()[0]
    assert reset(database, owner, treasury)["status"] == "done"
    as_owner(database)
    assert (
        database.execute(
            "select to_jsonb(p) from public.personal_captain_profiles p where player_id=%s",
            (owner,),
        ).fetchone()[0]
        == before
    )
    assert database.execute(
        "select captain_level,crew_gunner from public.islands where player_id=%s", (owner,)
    ).fetchone() == (3, 2)


def test_saved_reservation_settles_after_its_initiating_profile_is_deleted(database, prepared):
    owner, member, _, treasury = prepared
    held = reserve(database, member, treasury, 70)
    current = reset(database, owner, treasury)
    as_owner(database)
    as_server(database)
    assert rpc(database, "island_lifecycle_delete_player", member, False) == {"status": "deleted"}
    as_owner(database)
    assert database.execute("select id from auth.users where id=%s", (member,)).fetchone() is None
    as_server(database)
    assert money(settle(database, held, 150)) == (180, 0, 180)
    assert money(reset(database, owner, treasury)) == money(current)


@pytest.mark.parametrize("capital", [-1, Decimal("0.5"), Decimal("NaN"), None])
def test_invalid_server_grant_rolls_back_the_claim_and_encompassing_effect(
    database, prepared, capital
):
    owner, _, _, treasury = prepared
    assert reset(database, owner, treasury, starting=capital)["reason"] == "invalid_change"
    assert account_count(database, owner) == 1
    assert database.execute("select count(*) from public.reset_test_assets").fetchone() == (1,)
    assert reset(database, owner, treasury)["status"] == "done"


@pytest.mark.parametrize("reply", ["'{}'::jsonb", "jsonb_build_object('status','done')"])
def test_malformed_financial_result_cannot_leave_a_retirement_or_new_run(database, prepared, reply):
    owner, _, _, treasury = prepared
    as_owner(database)
    database.execute(
        """create or replace function public.island_treasury_record_locked(
      p_account_id uuid,p_actor_id uuid,p_action_uid text,p_kind text,p_reason text,
      p_reference text,p_fingerprint jsonb,p_balance_delta numeric,p_committed_delta numeric,
      p_source_reservation_id uuid default null) returns jsonb language sql as $$
    select """
        + reply
        + "; $$"
    )
    assert reset(database, owner, treasury)["reason"] == "reset_grant_conflict"
    assert account_count(database, owner) == 1
    assert database.execute("select count(*) from public.reset_test_assets").fetchone() == (1,)


@pytest.mark.parametrize("uids", [["reset001", "reset002"], ["reset001", "reset001"]])
def test_concurrent_resets_create_one_replacement_and_one_grant(
    database, prepared, scratch_server, uids
):
    owner, _, _, treasury = prepared
    database.commit()
    barrier = Barrier(2)

    def attempt(uid):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            barrier.wait(timeout=10)
            result = reset(connection, owner, treasury, uid)
            connection.commit()
            return result

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(attempt, uids))
    expected = ["done", "done"] if uids[0] == uids[1] else ["done", "refused"]
    assert sorted(result["status"] for result in results) == expected
    assert account_count(database, owner) == 2


def test_reset_racing_original_settlement_never_moves_old_returns_to_the_new_run(
    database, prepared, scratch_server
):
    owner, member, _, treasury = prepared
    held = reserve(database, member, treasury, 70)
    database.commit()
    barrier = Barrier(2)

    def attempt(action):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            as_server(connection)
            barrier.wait(timeout=10)
            result = (
                reset(connection, owner, treasury)
                if action == "reset"
                else settle(connection, held, 150)
            )
            connection.commit()
            return result

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(attempt, ["reset", "settle"]))
    assert all(result["status"] == "done" for result in results)
    assert money(reset(database, owner, treasury)) == (200, 0, 200)
    as_owner(database)
    assert database.execute(
        "select balance_coins,committed_coins,state from public.island_economy_accounts "
        "where id=%s",
        (keys(treasury)[0],),
    ).fetchone() == (180, 0, "retired")
