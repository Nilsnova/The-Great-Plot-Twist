"""Research and respec only between waves, a respec priced under the lock: the LATEST definitions of
island_research() and island_respec() (20261113010000_respec_and_wave_guards.sql) keep what the
earlier migrations gave them and add the wave test island_demolish() uses.

These are text checks of the migration files; the real behaviour is in
island_sql/test_respec_and_wave_guards_sql.py.
"""

import re
from pathlib import Path

MIGRATIONS = Path(__file__).resolve().parents[3] / "supabase" / "migrations"
GUARDS = MIGRATIONS / "20261113010000_respec_and_wave_guards.sql"
DEMOLISH = MIGRATIONS / "20261112080000_demolish.sql"
RESEARCH = MIGRATIONS / "20261112100000_research_tiers.sql"
TREE = MIGRATIONS / "20261112120000_captain_tree.sql"

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
    assert latest_definition("island_research")[0] == GUARDS.name
    assert latest_definition("island_respec")[0] == GUARDS.name


def test_both_use_the_wave_test_of_island_demolish():
    demolish = WAVE_TEST.search(DEMOLISH.read_text())
    assert demolish and demolish.group(1) == "p_island_owner"
    for name, owner in (("island_research", "p_island_owner"), ("island_respec", "p_player_id")):
        _, body = latest_definition(name)
        found = WAVE_TEST.search(body)
        assert found and found.group(1) == owner, name
        assert "'wave_running'" in body, name
        # After the island row is locked (the lock wave_start() takes), so no wave starts between.
        assert body.index("from public.islands") < found.start(), name


def test_research_keeps_everything_else_of_research_tiers():
    _, now = latest_definition("island_research")
    before = RESEARCH.read_text()
    old = re.search(r"create function public\.island_research\(.*?\n\$\$;", before, re.S).group(0)
    stripped = re.sub(
        r"  -- No research step while a wave runs.*?'wave_running'\);\n  end if;\n",
        "",
        now,
        flags=re.S,
    )
    assert stripped.replace("create or replace function", "create function") == old


def test_respec_is_priced_per_level_under_the_island_lock():
    _, body = latest_definition("island_respec")
    assert "p_per_level   integer" in body and "p_price" not in body
    assert body.index("for update;", body.index("from public.islands")) < body.index(
        "p_per_level * v_island.captain_level"
    )
    # The old signature's argument name goes first, and the captain-tree migration may be replayed.
    assert (
        "drop function if exists public.island_respec(uuid, text, integer);" in GUARDS.read_text()
    )
    assert "drop function if exists public.island_respec(uuid, text, integer);" in TREE.read_text()


def test_only_the_server_may_run_them():
    text = GUARDS.read_text()
    for signature in (
        "public.island_respec(uuid, text, integer)",
        "public.island_research(uuid, uuid, text, text, integer, integer, integer, text, boolean)",
    ):
        assert (
            f"revoke all on function {signature}\n  from public, anon, authenticated, service_role;"
            in text
        )
        assert f"grant execute on function {signature}\n  to service_role;" in text
