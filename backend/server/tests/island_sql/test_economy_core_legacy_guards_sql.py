"""Atomic old-entry fences and genuine legacy outcomes on disposable PostgreSQL.

The full migration chain applies twice; committed races use this module's isolated cluster.
"""

import re
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island  # noqa: E402
from server.island.personal_captain import configuration  # noqa: E402
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, ready, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    add_players,
    as_owner,
    as_server,
    balance,
)
from server.tests.island_sql.test_personal_captain_sql import private  # noqa: E402
from server.tests.test_respec_wave_guards_match_migration import (  # noqa: E402
    CORE_GUARDS,
    historical_respec_definition,
)

RULES = configuration(load_island())
ALIASES = {
    "islet_build": "uuid,text,text,bigint,integer,integer,text",
    "island_captain": "uuid,text,integer[],integer",
    "island_learn_skill": "uuid,text,text,jsonb,integer",
    "island_pick_role": "uuid,text,integer",
    "island_respec_at_level": "uuid,text,integer",
    "island_open": "uuid,text,bigint",
    "island_fresh_start": "uuid,text,text,integer",
}


def code_for(player):
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    return "".join(alphabet[(player.int >> (5 * index)) % len(alphabet)] for index in range(5))


def bare_home(connection, player):
    as_owner(connection)
    connection.execute(
        "insert into public.islands(player_id,code) values(%s,%s)", (player, code_for(player))
    )


def initialize(connection, player, owner, treasury):
    as_server(connection)
    return rpc(
        connection, "personal_captain_initialize", player, owner, keys(treasury)[1], Jsonb(RULES)
    )


def legacy_member_home(connection):
    owner, actor, _, treasury = ready(connection)
    bare_home(connection, actor)
    connection.execute(
        "update public.islands set captain_level=4,captain_role='engineer',"
        "won_wave_best=8,captain_skills='{steady_aim}' where player_id=%s",
        (actor,),
    )
    return owner, actor, treasury


def managed_legacy_home(connection):
    owner, actor, treasury = legacy_member_home(connection)
    value = initialize(connection, actor, owner, treasury)
    assert value["captain"]["role"] == "engineer"
    return owner, actor, treasury


def build_home(connection, actor, uid="legacyhome01"):
    as_server(connection)
    return rpc(connection, "islet_build", actor, "wall_1", "wall", 10, 0, 0, uid)


def kit(connection, actor, amount=200):
    as_server(connection)
    return rpc(
        connection,
        "grant_entry_kit",
        actor,
        "ending_trapped",
        "none",
        False,
        "stranger",
        "saltreach_harbor",
        amount,
        1,
        "0" * 64,
    )


@pytest.mark.parametrize("admission", ["active", "paused"])
def test_old_own_islet_build_cannot_charge_or_add_assets_on_an_admitted_target(database, admission):
    owner, _, _, treasury = ready(database)
    as_owner(database)
    database.execute(
        "update public.island_economy_state set admission_state=%s where island_owner=%s",
        (admission, owner),
    )
    before = balance(database, owner)
    assert build_home(database, owner) == {
        "status": "refused",
        "reason": "economy_context_required",
    }
    assert balance(database, owner) == before
    assert database.execute(
        "select count(*) from public.islet_buildings where player_id=%s", (owner,)
    ).fetchone() == (0,)
    assert database.execute(
        "select balance_coins from public.island_economy_accounts where id=%s", (keys(treasury)[0],)
    ).fetchone() == (200,)


def test_managed_engineer_cannot_use_own_legacy_home_build_as_an_unbound_discount_path(database):
    _, actor, _ = managed_legacy_home(database)
    assert build_home(database, actor)["reason"] == "captain_context_required"
    assert balance(database, actor) == 0


@pytest.mark.parametrize("action", ["captain", "learn_skill", "pick_role", "respec_at_level"])
def test_global_managed_captain_buttons_refuse_even_on_a_legacy_money_home(database, action):
    _, actor, _ = managed_legacy_home(database)
    private(database, "personal_captain_bind_engineer_locked", actor)
    before = private(database, "personal_captain_snapshot_locked", actor)
    as_server(database)
    rpc(database, "apply_wallet_transaction", actor, 1000, "admin_adjust", "fixturefunds")
    arguments = {
        "captain": (actor, "captainold01", [0, 20, 40, 80, 160], 5),
        "learn_skill": (actor, "hot_shot", "learnold001", Jsonb(RULES["tree"]), 2),
        "pick_role": (actor, "medic", 3),
        "respec_at_level": (actor, "respecold01", 100),
    }
    assert rpc(database, "island_" + action, *arguments[action]) == {
        "status": "refused",
        "reason": "captain_context_required",
    }
    assert balance(database, actor) == 1000
    assert private(database, "personal_captain_snapshot_locked", actor) == before
    assert database.execute(
        "select captain_role,captain_skills,captain_level from public.islands where player_id=%s",
        (actor,),
    ).fetchone() == (
        "engineer",
        ["steady_aim"],
        4,
    )


def test_managed_existing_legacy_open_is_read_only_without_a_private_starting_grant(database):
    _, actor, _ = managed_legacy_home(database)
    as_server(database)
    result = rpc(database, "island_open", actor, "NEWCD", 200)
    assert result == {
        "status": "open",
        "code": code_for(actor),
        "waveBest": 0,
        "flags": 0,
        "created": False,
        "paid": 0,
    }
    assert balance(database, actor) == 0
    assert database.execute(
        "select count(*) from public.wallet_transactions where player_id=%s", (actor,)
    ).fetchone() == (0,)


def test_managed_absent_home_open_does_not_create_or_grant(database):
    owner, actor, _, treasury = ready(database)
    initialize(database, actor, owner, treasury)
    as_server(database)
    assert rpc(database, "island_open", actor, code_for(actor), 200)["reason"] == (
        "captain_context_required"
    )
    assert database.execute(
        "select count(*) from public.islands where player_id=%s", (actor,)
    ).fetchone() == (0,)
    assert balance(database, actor) == 0


def test_shared_open_never_issues_a_private_grant_even_to_an_untouched_wallet(database):
    actor = uuid4()
    add_players(database, actor)
    bare_home(database, actor)
    as_server(database)
    rpc(database, "island_treasury_admit", actor, actor, "admitold01", 200)
    assert rpc(database, "island_open", actor, code_for(actor), 200)["reason"] == (
        "economy_context_required"
    )
    assert balance(database, actor) == 0


def test_managed_legacy_reset_preserves_canonical_progress_commitment_and_assets(database):
    _, actor, _ = managed_legacy_home(database)
    private(database, "personal_captain_bind_engineer_locked", actor)
    before = private(database, "personal_captain_snapshot_locked", actor)
    as_server(database)
    assert rpc(database, "island_fresh_start", actor, "resetold01", code_for(actor), 200) == {
        "status": "refused",
        "reason": "captain_context_required",
    }
    assert private(database, "personal_captain_snapshot_locked", actor) == before
    assert balance(database, actor) == 0


def test_kit_grant_and_first_ending_replay_preserve_an_already_managed_captain(database):
    _, actor, _ = managed_legacy_home(database)
    private(database, "personal_captain_bind_engineer_locked", actor)
    before = private(database, "personal_captain_snapshot_locked", actor)
    assert kit(database, actor)["paid"] == 200
    assert kit(database, actor, amount=999)["paid"] == 0
    assert balance(database, actor) == 200
    assert private(database, "personal_captain_snapshot_locked", actor) == before


def test_removed_unchecked_respec_is_not_resurrected(database):
    assert database.execute(
        "select to_regprocedure('public.island_respec(uuid,text,integer)')"
    ).fetchone() == (None,)


def test_respec_private_alias_keeps_the_complete_reviewed_body_after_reapplication(database):
    signature = "public.island_respec_at_level_core_legacy_personal(uuid,text,integer)"
    reviewed = re.search(r"as \$\$(.*?)\$\$;", historical_respec_definition(), re.S).group(1)
    as_owner(database)
    before = database.execute(
        "select prosrc from pg_proc where oid=to_regprocedure(%s)", (signature,)
    ).fetchone()[0]
    assert before == reviewed
    database.execute(CORE_GUARDS.read_text())
    database.execute(CORE_GUARDS.read_text())
    assert database.execute(
        "select prosrc from pg_proc where oid=to_regprocedure(%s)", (signature,)
    ).fetchone() == (before,)
    assert database.execute(
        "select has_function_privilege(role,%s,'execute') from "
        "unnest(array['anon','authenticated','service_role']) as roles(role)",
        (signature,),
    ).fetchall() == [(False,), (False,), (False,)]


def test_required_construction_kit_alias_is_private_without_a_core_kit_wrapper(database):
    arguments = "uuid,text,text,boolean,text,text,bigint,integer,text"
    alias = f"public.grant_entry_kit_legacy_personal({arguments})"
    assert database.execute("select to_regprocedure(%s) is not null", (alias,)).fetchone() == (
        True,
    )
    assert database.execute(
        "select has_function_privilege('service_role',%s,'execute')", (alias,)
    ).fetchone() == (False,)
    assert database.execute(
        "select to_regprocedure(%s)", (f"public.grant_entry_kit_core_legacy_personal({arguments})",)
    ).fetchone() == (None,)


def test_paid_legacy_captain_history_remains_stored_after_an_unsupported_managed_retry(database):
    owner, actor, treasury = legacy_member_home(database)
    as_server(database)
    rpc(database, "apply_wallet_transaction", actor, 1000, "admin_adjust", "fixturefunds")
    args = (actor, "oldreceipt01", [0, 20, 40, 80, 160], 5)
    assert rpc(database, "island_captain", *args)["status"] == "done"
    initialize(database, actor, owner, treasury)
    assert rpc(database, "island_captain", *args)["reason"] == "captain_context_required"
    assert balance(database, actor) == 840
    assert database.execute(
        "select delta,ref from public.wallet_transactions "
        "where player_id=%s and reason='captain_upgrade'",
        (actor,),
    ).fetchall() == [(-160, "captain:oldreceipt01")]


def test_historical_reset_receipt_survives_adoption_and_refused_legacy_retry(database):
    owner, actor, treasury = legacy_member_home(database)
    as_server(database)
    args = (actor, "oldreset001", code_for(actor), 200)
    original = rpc(database, "island_fresh_start", *args)
    assert original["status"] == "done"
    initialize(database, actor, owner, treasury)
    assert rpc(database, "island_fresh_start", *args)["reason"] == "captain_context_required"
    assert database.execute(
        "select counts from public.island_resets where island_owner=%s "
        "and action_uid='oldreset001'",
        (actor,),
    ).fetchone() == (original["counts"],)
    assert balance(database, actor) == 200


@pytest.mark.parametrize("name,arguments", ALIASES.items())
def test_preserved_bodies_are_private_and_wrappers_are_service_only(database, name, arguments):
    alias = f"public.{name}_core_legacy_personal({arguments})"
    public = f"public.{name}({arguments})"
    assert database.execute("select to_regprocedure(%s) is not null", (alias,)).fetchone() == (
        True,
    )
    assert database.execute(
        "select has_function_privilege('service_role',%s,'execute')", (alias,)
    ).fetchone() == (False,)
    assert database.execute(
        "select has_function_privilege('authenticated',%s,'execute')", (public,)
    ).fetchone() == (False,)
    assert database.execute(
        "select has_function_privilege('service_role',%s,'execute')", (public,)
    ).fetchone() == (True,)
