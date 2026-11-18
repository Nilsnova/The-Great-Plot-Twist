"""Levels 4 and 5 (docs/GAME-V3.md section 4.1): the catalogue, islands.json and the migration
20261112070000_tower_tiers.sql agree on five building levels.

The migration widens the two level check rules to 1..5 and replaces island_upgrade() and
pp_upgrade() with the functions of 20261111030000_tower_defense.sql, word for word except the
length check of p_prices. These checks read the SQL text only; the real-Postgres checks are in
island_sql/test_tower_tiers_sql.py.

Used by: pytest (cd backend && uv run pytest).
"""

import re
from pathlib import Path

from server.island.catalogue import MAX_LEVEL, load_island

MIGRATIONS = Path(__file__).resolve().parents[3] / "supabase" / "migrations"
TIERS = MIGRATIONS / "20261112070000_tower_tiers.sql"
TOWER_DEFENSE = MIGRATIONS / "20261111030000_tower_defense.sql"
RECOVERY_MUTATIONS = MIGRATIONS / "20261117050000_structure_recovery_mutations.sql"
SHARED_CONSTRUCTION = MIGRATIONS / "20261118050401_island_economy_construction_legacy_guards.sql"


def function(text: str, name: str) -> str:
    """The create statement of public.<name>() through its comment, from `text`."""
    match = re.search(
        rf"create or replace function public\.{name}\(.*?Only service_role may run it\.';",
        text,
        re.DOTALL,
    )
    assert match, f"public.{name}() is missing"
    return match.group(0)


def test_the_catalogue_allows_five_levels_and_the_tower_kinds_have_them():
    assert MAX_LEVEL == 5
    levels = {kind.kind: kind.max_level for kind in load_island().kinds}
    assert levels == {
        "wall": 5,
        "cannon": 5,
        "mortar": 5,
        "harpoon": 5,
        "swivel": 5,  # D055
        "watchtower": 5,
        "house": 3,
    }


def test_the_migration_widens_both_level_rules_to_five():
    text = TIERS.read_text()
    for table in ("islet_buildings", "pirate_point_buildings"):
        assert f"alter table public.{table} drop constraint if exists {table}_level_range;" in text
        assert re.search(
            rf"add constraint {table}_level_range check \(level between 1 and {MAX_LEVEL}\);", text
        )
    # The old rules really had these names (so the drop finds them).
    assert "constraint pirate_point_buildings_level_range" in TOWER_DEFENSE.read_text()
    home = (MIGRATIONS / "20261106070000_home_islet.sql").read_text()
    assert "constraint islet_buildings_level_range" in home


def test_the_upgrade_functions_change_only_the_length_of_the_price_list():
    new, old = TIERS.read_text(), TOWER_DEFENSE.read_text()
    for name in ("island_upgrade", "pp_upgrade"):
        before, after = function(old, name), function(new, name)
        assert "not between 1 and 3" in before
        assert after == before.replace("not between 1 and 3", f"not between 1 and {MAX_LEVEL}")


def test_the_migration_is_the_last_word_on_the_upgrade_functions():
    # Demolish adds payment/refund accounting; T55 adds reservation settlement and repair guards.
    # Historical function-body comparisons above stay pinned to the original migrations.
    later = {
        path.name: re.findall(r"function public\.(island_upgrade|pp_upgrade)\(", path.read_text())
        for path in sorted(MIGRATIONS.glob("*.sql"))
        if path.name > TIERS.name
    }
    assert {name: found for name, found in later.items() if found} == {
        "20261112080000_demolish.sql": ["island_upgrade"] * 4,
        RECOVERY_MUTATIONS.name: ["island_upgrade"] * 3,
        SHARED_CONSTRUCTION.name: ["island_upgrade"] * 4,
    }
    latest = re.search(
        r"create or replace function public\.island_upgrade\(.*?\n\$\$;",
        RECOVERY_MUTATIONS.read_text(),
        re.DOTALL,
    ).group(0)
    assert "structure_recovery_mutation_begin(p_island_owner)" in latest
    assert "'reason', 'wave_running'" in latest
    assert "'reason', 'needs_repair'" in latest
    assert (
        "p_prices is null or coalesce(array_length(p_prices, 1), 0) not between 1 and 5" in latest
    )
    wrapper = re.search(
        r"create or replace function public\.island_upgrade\(.*?\n\$\$;",
        SHARED_CONSTRUCTION.read_text(),
        re.DOTALL,
    ).group(0)
    assert wrapper.index("island_treasury_lock_scope") < wrapper.index("island_economy_state")
    assert wrapper.index("island_economy_state") < wrapper.index("island_upgrade_legacy_personal")
