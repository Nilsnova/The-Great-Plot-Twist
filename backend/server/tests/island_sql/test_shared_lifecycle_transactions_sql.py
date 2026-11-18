"""Actual lifecycle composition on disposable SQL, without a fixture authority provider.

Local identities and recovery policy are test setup. Admission and Captain import
use the provided real functions once; canonical authority comes from its migration.
"""

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island  # noqa: E402
from server.island.personal_captain import configuration  # noqa: E402
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
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
