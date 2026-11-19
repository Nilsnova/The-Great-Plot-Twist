"""Actual lifecycle composition on disposable SQL, without a fixture authority provider.

Local identities and recovery policy are test setup. Admission and Captain import
use the provided real functions once; canonical authority comes from its migration.
"""

from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island  # noqa: E402
from server.island.personal_captain import configuration  # noqa: E402
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.followups_sql.test_delete_versions import add_crew, crew_state  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    keys,
    ready,
    reserve,
    rpc,
    settle,
)
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_owner,
    as_server,
    balance,
    open_island,
    start,
)
from server.tests.shared_wagers_sql.test_shared_wager_transactions_sql import (  # noqa: E402
    make_due,
    open_wager,
    settlement,
)


@pytest.fixture
def prepared(database):
    return prepare(database)


def prepare(database):
    owner, member, outsider, treasury = ready(database, 100)
    as_owner(database)
    database.execute(
        "insert into public.island_recovery_state(island_owner,recovery_version,wave_protocol) "
        "values(%s,1,2) on conflict(island_owner) do update set recovery_version=1,wave_protocol=2",
        (owner,),
    )
    database.execute(
        "update public.islands set wave_best=30,next_wave=31,wreck_paid=500 where player_id=%s",
        (owner,),
    )
    code = database.execute(
        "select code from public.islands where player_id=%s", (owner,)
    ).fetchone()[0]
    as_server(database)
    for actor in (owner, member):
        result = rpc(
            database,
            "personal_captain_initialize",
            actor,
            owner,
            keys(treasury)[1],
            Jsonb(configuration(load_island())),
        )
        assert result.get("status") != "refused", result
    as_owner(database)
    assert database.execute(
        "select count(*) from public.island_treasury_transactions "
        "where account_id=%s and reason='starting_coins'",
        (keys(treasury)[0],),
    ).fetchone() == (1,)
    return owner, member, outsider, treasury, code


def reset(db, owner, treasury, code, uid="reset-lifecycle-001", starting=200, actor=None):
    as_server(db)
    return rpc(
        db,
        "island_lifecycle_reset",
        actor or owner,
        owner,
        keys(treasury)[1],
        uid,
        code,
        starting,
        "catalogue-starting-coins-v1",
    )


def delete(db, actor, confirmed=False):
    as_server(db)
    return rpc(db, "island_lifecycle_delete_player", actor, confirmed)


def test_reset_preserves_personal_progress_wallet_members_and_only_grants_once(database, prepared):
    owner, member, _, treasury, code = prepared
    as_server(database)
    personal = rpc(database, "personal_captain_read", owner)
    wallets = [balance(database, actor) for actor in (owner, member)]
    first = reset(database, owner, treasury, code)
    assert first["status"] == "done", first
    assert first["repeat"] is False and first["currentEconomy"] is None
    assert first["receipt"]["result"]["effects"]["wavesClosed"] == 0
    assert first["receipt"]["origin"]["accountId"] == keys(treasury)[0]
    assert rpc(database, "personal_captain_read", owner) == personal
    assert [balance(database, actor) for actor in (owner, member)] == wallets
    assert reset(database, owner, treasury, code, starting=999)["receipt"] == first["receipt"]
    as_owner(database)
    assert database.execute(
        "select count(*) from public.island_economy_accounts where island_owner=%s", (owner,)
    ).fetchone() == (2,)
    assert database.execute(
        "select count(*) from public.island_members "
        "where island_owner=%s and player_id=%s and left_at is null",
        (owner, member),
    ).fetchone() == (1,)


def test_member_and_wrong_code_reset_fail_before_any_new_root(database, prepared):
    owner, member, _, treasury, code = prepared
    assert reset(database, owner, treasury, code, actor=member)["reason"] == "not_owner"
    assert reset(database, owner, treasury, "ZZZZZ")["reason"] == "wrong_code"
    as_owner(database)
    assert database.execute(
        "select count(*) from public.island_economy_operations "
        "where actor_id=%s and domain_action='lifecycle:reset'",
        (owner,),
    ).fetchone() == (0,)


def test_member_delete_preserves_continuing_island_and_fences_identity(database, prepared):
    owner, member, _, treasury, _ = prepared
    assert delete(database, member) == {"status": "deleted"}
    assert rpc(database, "island_lifecycle_actor_status", member) == {"status": "deleted"}
    assert delete(database, member) == {"status": "not_found"}
    as_owner(database)
    assert database.execute(
        "select count(*) from auth.users where id=%s", (member,)
    ).fetchone() == (0,)
    assert database.execute(
        "select current_account_id::text from public.island_economy_state where island_owner=%s",
        (owner,),
    ).fetchone() == (keys(treasury)[0],)


def test_owner_delete_needs_separate_confirmation_and_creates_no_replacement(database, prepared):
    owner, member, _, treasury, _ = prepared
    assert delete(database, owner) == {
        "status": "refused",
        "reason": "owned_island_confirmation_required",
    }
    assert delete(database, owner, True) == {"status": "deleted"}
    as_owner(database)
    assert database.execute(
        "select count(*) from auth.users where id=%s", (member,)
    ).fetchone() == (1,)
    assert database.execute(
        "select count(*) from public.islands where player_id=%s", (owner,)
    ).fetchone() == (0,)
    assert database.execute(
        "select state, island_owner from public.island_economy_accounts where id=%s",
        (keys(treasury)[0],),
    ).fetchone() == ("retired", owner)
    assert database.execute(
        "select count(*) from public.island_economy_accounts where island_owner=%s", (owner,)
    ).fetchone() == (1,)


def test_original_hold_settles_after_reset_and_owner_delete_without_new_run_credit(
    database, prepared
):
    owner, member, _, treasury, code = prepared
    as_server(database)
    held = reserve(database, member, treasury, 30)
    assert delete(database, member) == {"status": "deleted"}
    replacement = reset(database, owner, treasury, code)["receipt"]["result"]
    assert delete(database, owner, True) == {"status": "deleted"}
    as_server(database)
    settled = settle(database, held, 50)
    assert settled["receipt"]["accountId"] == keys(treasury)[0]
    as_owner(database)
    assert database.execute(
        "select balance_coins,committed_coins from public.island_economy_accounts where id=%s",
        (replacement["newAccountId"],),
    ).fetchone() == (200, 0)


def test_original_legacy_delete_refuses_shared_related_player(database, prepared):
    _, member, outsider, _, _ = prepared
    as_server(database)
    assert rpc(database, "delete_player", member)["status"] == "refused"
    assert rpc(database, "delete_player", outsider) == {"status": "deleted"}
    assert rpc(database, "island_lifecycle_actor_status", outsider) == {"status": "deleted"}
    as_owner(database)
    assert database.execute(
        "select count(*) from public.island_deleted_player_dispositions where player_id=%s",
        (outsider,),
    ).fetchone() == (0,)


def test_original_reset_receipt_replays_after_later_reset_and_rejects_changed_intent(
    database, prepared
):
    owner, _, _, treasury, code = prepared
    first = reset(database, owner, treasury, code)
    replacement = first["receipt"]["result"]
    next_origin = {
        "currentEconomy": {
            "accountId": replacement["newAccountId"],
            "runEpoch": replacement["newRunEpoch"],
        }
    }
    second = reset(database, owner, next_origin, code, uid="reset-lifecycle-002")
    assert second["status"] == "done", second
    replay = reset(database, owner, treasury, code, starting=999)
    assert replay["receipt"] == first["receipt"] and replay["currentEconomy"] is None
    assert replay["repeat"] is True
    assert reset(database, owner, treasury, "ZZZZZ")["reason"] == "action_conflict"
    assert (
        reset(database, owner, treasury, code, uid="new-old-epoch-uid")["reason"]
        == "epoch_mismatch"
    )
    as_owner(database)
    assert database.execute(
        "select count(*) from public.island_economy_accounts where island_owner=%s", (owner,)
    ).fetchone() == (3,)


def test_paused_owner_can_delete_without_unpausing_or_resetting(database, prepared):
    owner, _, _, treasury, code = prepared
    as_owner(database)
    database.execute(
        "update public.island_economy_state set admission_state='paused' where island_owner=%s",
        (owner,),
    )
    assert reset(database, owner, treasury, code)["reason"] == "path_unavailable"
    assert delete(database, owner, True) == {"status": "deleted"}


def test_failed_physical_auth_delete_rolls_back_disposition_and_owned_retirement(
    database, prepared
):
    owner, _, _, treasury, _ = prepared
    as_owner(database)
    database.execute("""
      create function public.lifecycle_test_fail_auth_delete() returns trigger
      language plpgsql as $$ begin raise exception 'lifecycle_test_failure'; end $$;
      create trigger lifecycle_test_fail_auth_delete before delete on auth.users
        for each row execute function public.lifecycle_test_fail_auth_delete();
    """)
    with pytest.raises(psycopg.errors.RaiseException, match="lifecycle_test_failure"):
        with database.transaction():
            delete(database, owner, True)
    as_owner(database)
    assert database.execute("select count(*) from auth.users where id=%s", (owner,)).fetchone() == (
        1,
    )
    assert database.execute(
        "select count(*) from public.island_deleted_player_dispositions where player_id=%s",
        (owner,),
    ).fetchone() == (0,)
    assert database.execute(
        "select state from public.island_economy_accounts where id=%s", (keys(treasury)[0],)
    ).fetchone() == ("active",)
    assert database.execute(
        "select current_account_id::text from public.island_economy_state where island_owner=%s",
        (owner,),
    ).fetchone() == (keys(treasury)[0],)


def test_failed_reset_receipt_rolls_back_assets_root_grant_and_new_account(database, prepared):
    owner, _, _, treasury, code = prepared
    as_owner(database)
    database.execute("""
      create function public.lifecycle_test_fail_reset_receipt() returns trigger
      language plpgsql as $$ begin raise exception 'lifecycle_test_failure'; end $$;
      create trigger lifecycle_test_fail_reset_receipt
        before insert on public.island_economy_reset_receipts
        for each row execute function public.lifecycle_test_fail_reset_receipt();
    """)
    with pytest.raises(psycopg.errors.RaiseException, match="lifecycle_test_failure"):
        with database.transaction():
            reset(database, owner, treasury, code)
    as_owner(database)
    assert database.execute(
        "select wave_best,wreck_paid from public.islands where player_id=%s", (owner,)
    ).fetchone() == (30, 500)
    assert database.execute(
        "select count(*) from public.island_economy_accounts where island_owner=%s", (owner,)
    ).fetchone() == (1,)
    assert database.execute(
        "select count(*) from public.island_economy_operations where actor_id=%s "
        "and domain_action='lifecycle:reset'",
        (owner,),
    ).fetchone() == (0,)


@pytest.mark.parametrize("legacy", [False, True])
def test_current_delete_composition_hands_over_legacy_crew_exactly_once(database, prepared, legacy):
    owner, member, outsider, _, _ = prepared
    actor, survivor = (outsider, member) if legacy else (member, outsider)
    as_owner(database)
    crew = add_crew(database, actor, [(1, actor), (3, owner), (2, survivor)])
    as_server(database)
    result = rpc(database, "delete_player", actor) if legacy else delete(database, actor)
    assert result == {"status": "deleted"}
    assert crew_state(database, crew) == (survivor, 8)
    assert rpc(database, "island_lifecycle_delete_player", actor, False) == {"status": "not_found"}
    assert crew_state(database, crew) == (survivor, 8)
    assert database.execute(
        "select seat_no from public.crew_seats where crew_id=%s order by seat_no", (crew,)
    ).fetchall() == [(2,), (3,)]


def legacy_recovery(database, owner, actor):
    open_island(database, owner, "K7Q2N")
    wave = start(database, owner, "legacy-history01", owner=owner)["waveId"]
    as_owner(database)
    epoch = database.execute(
        "select reset_epoch from public.island_recovery_state where island_owner=%s", (owner,)
    ).fetchone()[0]
    # These are legacy replay facts, deliberately without shared accounting.
    # The detached FK's former cascade must be reproduced only for this domain.
    database.execute(
        "insert into public.recovery_wave_states(wave_id,island_owner,reset_epoch,"
        "recovery_version,wave_protocol,initial_snapshot) values(%s,%s,%s,1,2,'{}')",
        (wave, owner, epoch),
    )
    database.execute(
        "insert into public.recovery_health_checkpoints(wave_id,actor_id,checkpoint_uid,"
        "reset_epoch,through_tick,input_head_seq,last_repair_seq,basis_repair_seq,hp_vector) "
        "values(%s,%s,'checkpoint01',%s,0,0,0,'{}','{}')",
        (wave, actor, epoch),
    )
    return wave


def test_deleted_member_purges_only_authored_legacy_checkpoint(database, prepared):
    _, member, outsider, _, _ = prepared
    wave = legacy_recovery(database, outsider, member)
    assert delete(database, member) == {"status": "deleted"}
    as_owner(database)
    assert database.execute(
        "select count(*) from public.recovery_health_checkpoints where wave_id=%s", (wave,)
    ).fetchone() == (0,)
    assert database.execute(
        "select island_owner from public.recovery_wave_states where wave_id=%s", (wave,)
    ).fetchone() == (outsider,)
    assert database.execute(
        "select started_by from public.wave_runs where id=%s", (wave,)
    ).fetchone() == (outsider,)


def test_pure_legacy_owner_delete_purges_unlinked_recovery_history(database, prepared):
    _, _, outsider, _, _ = prepared
    wave = legacy_recovery(database, outsider, outsider)
    as_server(database)
    assert rpc(database, "delete_player", outsider) == {"status": "deleted"}
    as_owner(database)
    for table, column in (
        ("wave_runs", "id"),
        ("recovery_wave_states", "wave_id"),
        ("recovery_health_checkpoints", "wave_id"),
    ):
        assert database.execute(
            f"select count(*) from public.{table} where {column}=%s", (wave,)
        ).fetchone() == (0,)
    assert database.execute(
        "select count(*) from public.island_deleted_player_dispositions where player_id=%s",
        (outsider,),
    ).fetchone() == (0,)


def test_only_checked_lifecycle_entries_are_service_executable(database):
    functions = database.execute(
        "select p.oid::regprocedure::text,p.proname,p.prosecdef,p.proconfig "
        "from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
        "where n.nspname='public' and p.proname like 'island_lifecycle_%'"
    ).fetchall()
    assert len(functions) >= 10
    for signature, name, definer, config in functions:
        assert definer is not name.startswith("island_lifecycle_legacy_game_")
        assert config == ['search_path=""']
        for role in ("anon", "authenticated", "service_role"):
            allowed = role == "service_role" and name in {
                "island_lifecycle_actor_status",
                "island_lifecycle_reset",
                "island_lifecycle_delete_player",
            }
            assert database.execute(
                "select has_function_privilege(%s,%s,'execute')", (role, signature)
            ).fetchone() == (allowed,), (role, signature)


def test_real_market_wager_settles_once_on_original_account_after_reset_and_auth_deletion(
    database, prepared
):
    owner, member, _, treasury, code = prepared
    as_server(database)
    opened = open_wager(database, member, owner, treasury, stake=30, uid="lifecyclewager01")
    assert opened["status"] == "done", opened
    replacement = reset(database, owner, treasury, code)["receipt"]["result"]
    assert delete(database, member) == {"status": "deleted"}
    assert delete(database, owner, True) == {"status": "deleted"}
    # TEST ONLY: advance this immutable wager's fixture timestamps. Product rules
    # and real settlement remain intact; this is not a provider/clock acceptance.
    make_due(database, opened)
    as_server(database)
    settled = settlement(database, opened, price="101")
    assert settled["status"] == "done", settled
    assert settled["receipt"]["actorId"] is None  # autonomous system settlement
    assert settled["wager"]["actorId"] == str(member)
    assert settled["receipt"]["origin"]["accountId"] == keys(treasury)[0]
    assert settled["receipt"]["origin"]["runEpoch"] == keys(treasury)[1]
    assert settled["settlement"]["outcome"] == "won"
    assert settled["currentEconomy"] is None
    assert settlement(database, opened, price="99")["receipt"] == settled["receipt"]
    as_owner(database)
    assert database.execute(
        "select balance_coins,committed_coins,state from public.island_economy_accounts "
        "where id=%s",
        (keys(treasury)[0],),
    ).fetchone() == (130, 0, "retired")
    assert database.execute(
        "select balance_coins,committed_coins from public.island_economy_accounts where id=%s",
        (replacement["newAccountId"],),
    ).fetchone() == (200, 0)


@pytest.mark.parametrize("phase", ["countdown", "active", "expired_unsealed", "accounting_only"])
def test_new_reset_refuses_unsealed_phase_without_claim_or_asset_effects(database, prepared, phase):
    owner, _, _, treasury, code = prepared
    as_owner(database)
    wave = uuid4()
    # TEST ONLY phase-boundary fixtures. These are intentionally not native bell
    # acceptance evidence; even a stale/unclassified reservation must fail closed.
    if phase != "accounting_only":
        start = "30 seconds" if phase == "countdown" else "-30 seconds"
        expiry = "-1 second" if phase == "expired_unsealed" else "900 seconds"
        database.execute(
            "update public.island_recovery_state set current_wave_id=%s,"
            "reserved_at=clock_timestamp()-interval '60 seconds',"
            "starts_at=clock_timestamp()+%s::interval,"
            "expires_at=clock_timestamp()+%s::interval where island_owner=%s",
            (wave, start, expiry, owner),
        )
    database.execute(
        "insert into public.island_wave_accounting(wave_id,island_owner,account_id,run_epoch,"
        "wave_protocol,played_wave,seed,started_by,starts_at,maximum_seconds,roster,reward_basis,"
        "request_fingerprint) values(%s,%s,%s,%s,2,31,42,%s,clock_timestamp(),900,'[]','{}','{}')",
        (wave, owner, *keys(treasury), owner),
    )
    assert reset(database, owner, treasury, code) == {"status": "refused", "reason": "wave_running"}
    as_owner(database)
    assert database.execute(
        "select wave_best,wreck_paid from public.islands where player_id=%s", (owner,)
    ).fetchone() == (30, 500)
    assert database.execute(
        "select count(*) from public.island_economy_accounts where island_owner=%s", (owner,)
    ).fetchone() == (1,)
    assert database.execute(
        "select count(*) from public.island_economy_operations where actor_id=%s "
        "and domain_action='lifecycle:reset'", (owner,)
    ).fetchone() == (0,)
    assert database.execute(
        "select count(*) from public.island_wave_closures where wave_id=%s", (wave,)
    ).fetchone() == (0,)


def test_original_reset_replay_precedes_replacement_reservation_phase(database, prepared):
    owner, _, _, treasury, code = prepared
    original = reset(database, owner, treasury, code)
    as_owner(database)
    database.execute(
        "update public.island_recovery_state set current_wave_id=%s,"
        "reserved_at=clock_timestamp(),starts_at=clock_timestamp()+interval '30 seconds',"
        "expires_at=clock_timestamp()+interval '900 seconds' where island_owner=%s",
        (uuid4(), owner),
    )
    replay = reset(database, owner, treasury, code)
    assert replay["repeat"] is True and replay["receipt"] == original["receipt"]
    assert replay["currentEconomy"] is None
