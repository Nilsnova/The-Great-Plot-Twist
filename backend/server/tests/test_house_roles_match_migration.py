"""The house roles (docs/GAME-V3.md "Houses"): the catalogue, islands.json, the browser's ids and
the migration 20261112090000_house_roles.sql agree.

The migration adds the three (house, role) pairs to the check rule of 20261112060000_tech_hub.sql,
and replaces island_specialise() (20261112060000_tech_hub.sql) and wave_revive()
(20261112050000_captain_revive.sql) with the same functions plus the lines checked below, nothing
else. These checks read the SQL text only; the real-Postgres checks are in
island_sql/test_house_roles_sql.py.

Used by: pytest (cd backend && uv run pytest).
"""

import re
from pathlib import Path

from server.island.catalogue import HOUSE_ROLE_LEVEL, HOUSE_ROLES, RESEARCH_SPECS, load_island

ROOT = Path(__file__).resolve().parents[3]
MIGRATIONS = ROOT / "supabase" / "migrations"
ROLES = MIGRATIONS / "20261112090000_house_roles.sql"
TECH_HUB = MIGRATIONS / "20261112060000_tech_hub.sql"
REVIVE = MIGRATIONS / "20261112050000_captain_revive.sql"

ROLE_PAIRS = "       ('house', 'barracks'), ('house', 'tavern'), ('house', 'workshop')\n"
TAVERN = """  -- A Tavern on the island (a house of level 2 or more with the role tavern,
  -- docs/GAME-V3.md "Houses") takes 25% off, rounded down. The server cannot
  -- see where the captains stand, so the discount is for the whole island.
  if v_run.place = 'island' and exists (
    select 1 from public.islet_buildings
     where player_id = v_run.island_owner and building_type = 'house'
       and spec = 'tavern' and level >= 2
  ) then
    v_price := greatest(1, v_price * (100 - 25) / 100);
  end if;
"""
HOUSE_LEVEL = (
    '  -- A house role (docs/GAME-V3.md "Houses") needs no research,'
    " only a house of level 2 or more.\n"
    """  if p_branch = 'house' then
    if v_building.level < 2 then
      return jsonb_build_object('status', 'refused', 'reason', 'house_level');
    end if;
  elsif not exists ("""
)


def function(text: str, name: str) -> str:
    """The create statement of public.<name>() up to its body's end (the comment apart)."""
    match = re.search(rf"create or replace function public\.{name}\(.*?\n\$\$;", text, re.DOTALL)
    assert match, f"public.{name}() is missing"
    return match.group(0)


def grants(text: str, name: str) -> list[str]:
    return re.findall(rf"(?:revoke|grant)[^;]*function public\.{name}\([^;]*;", text)


def test_the_roles_match_the_browser_and_the_check_rule():
    browser = (ROOT / "frontend" / "src" / "campaign" / "houses.js").read_text()
    assert re.findall(r"^  (\w+): Object\.freeze\(\{name:", browser, re.M) == list(HOUSE_ROLES)
    assert f"export const ROLE_LEVEL = {HOUSE_ROLE_LEVEL};" in browser
    text = ROLES.read_text()
    rule = re.search(
        r"add constraint islet_buildings_spec_fits_kind check \((.*?)\n  \);", text, re.S
    )
    assert rule
    pairs = re.findall(r"\('(\w+)', '(\w+)'\)", rule.group(1))
    expected = [(kind, spec) for kind, specs in RESEARCH_SPECS.items() for spec in specs]
    expected += [("house", role) for role in HOUSE_ROLES]
    assert sorted(pairs) == sorted(expected)
    assert "drop constraint if exists islet_buildings_spec_fits_kind;" in text
    assert "constraint islet_buildings_spec_fits_kind" in TECH_HUB.read_text()


def test_island_specialise_changes_only_the_role_pairs_and_the_level_rule():
    before, after = (
        function(TECH_HUB.read_text(), "island_specialise"),
        function(ROLES.read_text(), "island_specialise"),
    )
    old_last = "       ('watchtower', 'spotter'), ('watchtower', 'signal_fire')\n"
    assert old_last in before
    expected = before.replace(old_last, old_last.rstrip("\n") + ",\n" + ROLE_PAIRS)
    expected = expected.replace("  if not exists (", HOUSE_LEVEL, 1)
    assert after == expected
    assert grants(ROLES.read_text(), "island_specialise") == grants(
        TECH_HUB.read_text(), "island_specialise"
    )
    assert f"v_building.level < {HOUSE_ROLE_LEVEL}" in after


def test_wave_revive_changes_only_the_tavern_block():
    before, after = (
        function(REVIVE.read_text(), "wave_revive"),
        function(ROLES.read_text(), "wave_revive"),
    )
    price = "  v_price := p_base + p_per_wave * v_run.wave;\n"
    assert after == before.replace(price, price + TAVERN)
    assert grants(ROLES.read_text(), "wave_revive") == grants(REVIVE.read_text(), "wave_revive")
    # The 25 is islands.json's revive.tavernPercent.
    assert f"(100 - {load_island().revive.tavern_percent})" in after


def test_the_migration_is_the_last_word_on_both_functions():
    later = [
        path.name
        for path in sorted(MIGRATIONS.glob("*.sql"))
        if path.name > ROLES.name
        and re.search(r"function public\.(island_specialise|wave_revive)\(", path.read_text())
    ]
    assert later == []


def test_the_workshop_charges_nothing_because_wall_repairs_are_free():
    # No migration charges coins for a wall's repair or rebuild (docs/TOWER-DEFENSE.md section 12).
    for path in sorted(MIGRATIONS.glob("*.sql")):
        text = path.read_text()
        assert "'wall_repair'" not in text and "'wall_rebuild'" not in text, path.name
