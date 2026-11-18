"""Research and respec only between waves, a respec priced under the lock: the LATEST definitions of
island_research() and island_respec() (20261113010000_respec_and_wave_guards.sql) keep what the
earlier migrations gave them and add the wave test island_demolish() uses.

These are text checks of the migration files; the real behaviour is in
island_sql/test_respec_and_wave_guards_sql.py.
"""

import hashlib
import re
from pathlib import Path

MIGRATIONS = Path(__file__).resolve().parents[3] / "supabase" / "migrations"
GUARDS = MIGRATIONS / "20261113010000_respec_and_wave_guards.sql"
DEMOLISH = MIGRATIONS / "20261112080000_demolish.sql"
RESEARCH = MIGRATIONS / "20261112100000_research_tiers.sql"
TREE = MIGRATIONS / "20261112120000_captain_tree.sql"
RECOVERY_MUTATIONS = MIGRATIONS / "20261117050000_structure_recovery_mutations.sql"
PROGRESSION_GUARDS = MIGRATIONS / "20261118050501_island_progression_legacy_guards.sql"

WAVE_TEST = re.compile(
    r"from public\.wave_runs\s+where island_owner = (\w+) and finished_at is null\s+"
    r"and starts_at \+ make_interval\(secs => maximum_seconds\) >= now\(\)"
)


def latest_definition(name: str) -> tuple[str, str]:
    """The newest migration that makes the function, and its text from `function` to `$$;`."""
    pattern = re.compile(rf"create (?:or replace )?function public\.{name}\(.*?\n\$\$;", re.S)
    for path in sorted(MIGRATIONS.glob("*.sql"), reverse=True):
        found = pattern.search(path.read_text())
        if found:
            return path.name, found.group(0)
    raise AssertionError(name)


def test_the_latest_definitions_are_in_the_guards_migration():
    assert latest_definition("island_research")[0] == PROGRESSION_GUARDS.name
    assert latest_definition("island_respec_at_level")[0] == GUARDS.name


def test_both_use_the_wave_test_of_island_demolish():
    demolish = WAVE_TEST.search(DEMOLISH.read_text())
    assert demolish and demolish.group(1) == "p_island_owner"
    for name, owner in (
        ("island_research", "p_island_owner"),
        ("island_respec_at_level", "p_player_id"),
    ):
        # These checks pin the reviewed pre-recovery guard migration. T55 replaces research
        # later to add canonical v1 settlement while preserving this v0 boundary.
        body = re.search(
            rf"create or replace function public\.{name}\(.*?\n\$\$;", GUARDS.read_text(), re.S
        ).group(0)
        found = WAVE_TEST.search(body)
        assert found and found.group(1) == owner, name
        assert "'wave_running'" in body, name
        # After the island row is locked (the lock wave_start() takes), so no wave starts between.
        assert body.index("from public.islands") < found.start(), name


def test_research_keeps_everything_else_of_research_tiers():
    now = re.search(
        r"create or replace function public\.island_research\(.*?\n\$\$;",
        GUARDS.read_text(),
        re.S,
    ).group(0)
    before = RESEARCH.read_text()
    old = re.search(r"create function public\.island_research\(.*?\n\$\$;", before, re.S).group(0)
    stripped = re.sub(
        r"  -- No research step while a wave runs.*?'wave_running'\);\n  end if;\n",
        "",
        now,
        flags=re.S,
    )
    assert stripped.replace("create or replace function", "create function") == old


def test_recovery_research_replacement_keeps_the_legacy_guard_and_adds_v1_settlement():
    # The shared wrapper preserves this body as its private personal-mode alias.
    body = re.search(
        r"create or replace function public\.island_research\(.*?\n\$\$;",
        RECOVERY_MUTATIONS.read_text(),
        re.S,
    ).group(0)
    assert "structure_recovery_mutation_begin(p_island_owner)" in body
    assert "structure_recovery_mutation_finish(p_island_owner, v_recovery)" in body
    assert "if (v_recovery ->> 'recoveryVersion')::integer = 1 then" in body
    assert "v_recovery #>> '{settlement,status}' = 'reserved'" in body
    assert "elsif exists (" in body
    assert (
        "finished_at is null and starts_at + make_interval(secs => maximum_seconds) >= now()"
        in body
    )
    assert "'wave_running'" in body


def test_shared_research_wrapper_guards_before_delegating_to_the_preserved_alias():
    name, body = latest_definition("island_research")
    assert name == PROGRESSION_GUARDS.name
    assert (
        body.index("island_treasury_lock_scope(p_island_owner)")
        < body.index("from public.island_economy_state")
        < body.index("'economy_context_required'")
        < body.index("return public.island_research_legacy_personal(")
    )
    text = PROGRESSION_GUARDS.read_text()
    assert "to_regprocedure('public.'||v_item.name||'_legacy_personal('" in text
    assert "pg_get_functiondef(to_regprocedure('public.'||v_item.name||'('" in text
    assert "position(v_item.name||'_legacy_personal' in v_definition) > 0" in text
    assert (
        "revoke all on function public.%I(%s) from public, anon, authenticated, service_role"
        in text
    )


def test_respec_is_priced_per_level_under_the_island_lock():
    _, body = latest_definition("island_respec_at_level")
    assert "p_per_level   integer" in body and "p_price" not in body
    assert body.index("for update;", body.index("from public.islands")) < body.index(
        "p_per_level * v_island.captain_level"
    )


def test_the_old_respec_is_dropped_and_the_applied_migration_is_untouched():
    drop = "drop function if exists public.island_respec(uuid, text, integer);"
    text = GUARDS.read_text()
    assert text.index(drop) > text.index(
        "create or replace function public.island_respec_at_level("
    )
    # 20261112120000 is in production and never edited: the bytes stay as recorded there.
    assert hashlib.md5(TREE.read_bytes()).hexdigest() == "d0a8ef6c6e621c95e8e13b5cdb6522a3"  # noqa: S324


def test_only_the_server_may_run_them():
    text = GUARDS.read_text()
    for signature in (
        "public.island_respec_at_level(uuid, text, integer)",
        "public.island_research(uuid, uuid, text, text, integer, integer, integer, text, boolean)",
    ):
        assert (
            f"revoke all on function {signature}\n  from public, anon, authenticated, service_role;"
            in text
        )
        assert f"grant execute on function {signature}\n  to service_role;" in text
