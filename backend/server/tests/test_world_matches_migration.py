"""Static Phase 3 contracts for world state and its atomic solve hook.

Used by: the ordinary backend gate. W1 to W9 separately execute the migration chain,
the account cascade and two concurrent accusations on private local PostgreSQL.
"""

import re
from pathlib import Path

import pytest

from server.flags import default_flags
from server.game.case_data import load_case
from server.settings import load_settings

MIGRATIONS = Path(__file__).resolve().parents[3] / "supabase/migrations"
MIGRATION = MIGRATIONS / "20261106120000_relighting.sql"
SQL = MIGRATION.read_text()
TABLES = ("world_state", "world_solves", "wall_of_lights")
SIGNATURE = "uuid, boolean, uuid[]"


def hook_body():
    match = re.search(
        r"create or replace function public\.case_after_solve\(.*?\bas \$\$(.*?)\n\$\$;",
        SQL,
        re.S,
    )
    assert match is not None
    return match.group(1)


def test_phase3_uses_the_reserved_stamp_and_only_three_world_tables():
    assert MIGRATION.name == "20261106120000_relighting.sql"
    assert set(re.findall(r"create table if not exists public\.(\w+)", SQL)) == set(TABLES)
    assert "relit_at      timestamptz" in SQL


@pytest.mark.parametrize("table", TABLES)
def test_world_tables_have_rls_no_player_policies_and_minimal_server_grants(table):
    assert f"alter table public.{table} enable row level security;" in SQL
    assert (
        f"revoke all on table public.{table} from public, anon, authenticated, service_role;" in SQL
    )
    rights = "select, update" if table == "world_state" else "select, insert"
    assert re.findall(rf"grant ([a-z, ]+) on table public\.{table} to (\w+);", SQL) == [
        (rights, "service_role")
    ]
    assert not re.search(rf"create policy .*? on public\.{table}\b", SQL, re.S)


def test_replacement_hook_keeps_its_exact_signature_and_server_only_caller_rights():
    declared = re.search(r"create or replace function public\.case_after_solve\((.*?)\)", SQL)
    assert declared is not None
    assert declared.group(1) == "p_crew_id uuid, p_relight_open boolean, p_contributors uuid[]"
    assert (
        f"revoke all on function public.case_after_solve({SIGNATURE}) "
        "from public, anon, authenticated;"
    ) in SQL
    assert f"grant execute on function public.case_after_solve({SIGNATURE}) to service_role;" in SQL
    assert "set search_path = ''" in SQL
    assert "security definer" not in SQL.lower()
    assert f"comment on function public.case_after_solve({SIGNATURE}) is" in SQL


def test_closed_setting_returns_before_world_lock_and_any_world_write():
    body = hook_body()
    refusal = body.index("if not coalesce(p_relight_open, false) then")
    locked = body.index("return jsonb_build_object('world', 'locked')")
    lock = body.index("from public.world_state where id = 1 for update")
    write = body.index("insert into public.world_solves")
    assert refusal < locked < lock < write
    assert body.index("'world', 'already_recorded'") < write


def test_relighting_is_one_conditional_update_and_later_solves_preserve_the_first_time():
    body = hook_body()
    assert len(re.findall(r"\bset stage = 'relit'", body)) == 1
    assert "where id = 1 and stage = 'dark'" in body
    assert "v_first := found" in body
    later = body.split("if not v_first then", 1)[1].split("end if;", 1)[0]
    assert "relit_at =" not in later
    assert "first_crew_id =" not in later


def test_extra_light_cap_matches_the_checked_case_data():
    data = load_case()
    limit = data.raw["relighting"]["later_crews"]["extra_light_spots"]
    assert f"extra_lights = least(extra_lights + 1, {limit})" in SQL
    assert f"extra_lights between 0 and {limit}" in SQL


def test_wall_uses_only_contributors_and_preserves_their_first_entry():
    assert "from unnest(coalesce(p_contributors, '{}')) as contributor" in hook_body()
    assert "on conflict (player_id) do nothing" in hook_body()
    assert "player_id uuid primary key references public.profiles (id) on delete cascade" in SQL


def test_sql_never_reads_settings_or_switches_the_default_case_flag():
    assert not re.search(r"\b(?:current_setting|set_config)\s*\(", SQL, re.I)
    assert not re.search(r"\b(?:app_env|feature_flags)\b", SQL, re.I)
    assert load_settings({}).relight_open is False
    assert default_flags()["case"] is False


def test_world_migration_does_not_add_wallet_reasons_or_raise_unique_for_replays():
    assert not re.search(
        r"(?:insert\s+into|update|delete\s+from|truncate)\s+(?:public\.)?wallet_reasons", SQL
    )
    assert "raise unique_violation" not in SQL.lower()
    assert "public.case_finish(" not in hook_body()
