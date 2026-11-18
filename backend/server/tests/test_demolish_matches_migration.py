"""Tearing a building down (docs/GAME-V3.md section 4.2): 20261112080000_demolish.sql replaces
island_build() and island_upgrade() with ONE addition each, the building_payments row that ties
a payment to one building, and adds the refund reason that wallet.py knows.

These checks read the SQL text only; the real-Postgres checks are in
island_sql/test_demolish_sql.py.

Used by: pytest (cd backend && uv run pytest).
"""

import re
from pathlib import Path

from server.island.catalogue import load_island
from server.island.rules import PROTECTED, price_table
from server.wallet import EARN, WALLET_REASONS

MIGRATIONS = Path(__file__).resolve().parents[3] / "supabase" / "migrations"
DEMOLISH = MIGRATIONS / "20261112080000_demolish.sql"
TOWER_DEFENSE = MIGRATIONS / "20261111030000_tower_defense.sql"
TIERS = MIGRATIONS / "20261112070000_tower_tiers.sql"
MORE_TOWER_SPOTS = MIGRATIONS / "20261117010000_more_tower_spots.sql"
RECOVERY_MUTATIONS = MIGRATIONS / "20261117050000_structure_recovery_mutations.sql"
SHARED_CONSTRUCTION = MIGRATIONS / "20261118050401_island_economy_construction_legacy_guards.sql"

REFUND_NOTE = (
    "  -- 20261112080000_demolish.sql: who paid for this {}, for a refund when it is torn down.\n"
)
BUILD_ADDITION = (
    REFUND_NOTE.format("building")
    + """  insert into public.building_payments
    (island_owner, plot, building_ref, level, payer, coins, ref)
  values
    (p_island_owner, p_plot, v_ref, 1, p_player_id, p_price, v_ref);
"""
)
UPGRADE_ADDITION = (
    REFUND_NOTE.format("level")
    + """  insert into public.building_payments
    (island_owner, plot, building_ref, level, payer, coins, ref)
  values
    (p_island_owner, p_plot, v_building.ref, v_building.level, p_player_id, v_price, v_ref);
"""
)
D060_PLOT_RULE = "'^(wall_([1-9]|1[0-2])|cannon_([1-9]|1[01])|tower_1|house_[12])$'"


def body(text: str, name: str) -> str:
    """The create statement of public.<name>() through the end of its body ($$;)."""
    match = re.search(rf"create or replace function public\.{name}\(.*?\n\$\$;\n", text, re.DOTALL)
    assert match, f"public.{name}() is missing"
    return match.group(0)


def test_island_build_gains_only_its_payment_row():
    before, after = (
        body(TOWER_DEFENSE.read_text(), "island_build"),
        body(DEMOLISH.read_text(), "island_build"),
    )
    anchor = "    (p_island_owner, p_plot, p_building_type, 1, p_price, 0, v_ref);\n"
    assert before.count(anchor) == 1
    assert after == before.replace(anchor, anchor + BUILD_ADDITION)


def test_island_upgrade_gains_only_its_payment_row():
    before, after = (
        body(TIERS.read_text(), "island_upgrade"),
        body(DEMOLISH.read_text(), "island_upgrade"),
    )
    anchor = "  returning * into v_building;\n"
    assert before.count(anchor) == 1
    assert after == before.replace(anchor, anchor + UPGRADE_ADDITION)


def test_no_later_migration_changes_the_build_or_upgrade_functions_again():
    later = [
        path.name
        for path in sorted(MIGRATIONS.glob("*.sql"))
        if path.name > DEMOLISH.name
        and re.search(
            r"function public\.(island_build|island_upgrade|island_demolish)\(", path.read_text()
        )
    ]
    # D060 widens the demolish spots; T55 then adds recovery settlement/identity handling while
    # preserving the payment/refund rows and all supported plots. Shared-mode wrappers then
    # retain those originals as private aliases while excluding admitted shared islands.
    assert later == [MORE_TOWER_SPOTS.name, RECOVERY_MUTATIONS.name, SHARED_CONSTRUCTION.name]


def test_recovery_replacements_preserve_build_upgrade_payments_and_demolish_refunds():
    build = body(RECOVERY_MUTATIONS.read_text(), "island_build")
    upgrade = body(RECOVERY_MUTATIONS.read_text(), "island_upgrade")
    demolish = body(RECOVERY_MUTATIONS.read_text(), "island_demolish")

    assert BUILD_ADDITION in build
    assert UPGRADE_ADDITION in upgrade
    assert f"p_plot !~ {D060_PLOT_RULE}" in demolish
    assert "public.island_refund_split(" in demolish
    assert "'building_refund'" in demolish
    assert "update public.building_payments" in demolish
    assert "insert into public.building_demolitions" in demolish
    assert "structure_recovery_mutation_begin(p_island_owner)" in demolish
    assert "structure_recovery_mutation_finish(p_island_owner, v_recovery)" in demolish


def test_the_extra_tower_spots_widen_only_the_plot_test_of_the_tear_down():
    old_test = "'^(wall_([1-9]|1[0-2])|cannon_[1-7]|tower_1|house_[12])$'"
    new_test = "'^(wall_([1-9]|1[0-2])|cannon_([1-9]|1[01])|tower_1|house_[12])$'"
    for name in ("island_demolish", "island_demolish_quote"):
        before = body(DEMOLISH.read_text(), name)
        after = body(MORE_TOWER_SPOTS.read_text(), name)
        assert before.count(old_test) == 1
        assert after == before.replace(old_test, new_test)


def test_the_refund_reason_is_an_earning_in_both_places():
    assert ("building_refund", EARN) in WALLET_REASONS
    assert "('building_refund', 'earn'," in DEMOLISH.read_text()


def test_every_new_function_is_the_servers_only():
    text = DEMOLISH.read_text()
    for name in (
        "island_build",
        "island_upgrade",
        "island_refund_split",
        "island_demolish_quote",
        "island_demolish",
    ):
        assert re.search(
            rf"revoke all on function public\.{name}\([^)]*\)\s+"
            r"from public, anon, authenticated, service_role;",
            text,
        ), name
        assert re.search(
            rf"grant execute on function public\.{name}\([^)]*\)\s+to service_role;", text
        ), name
        statement = body(text, name)
        assert "security invoker" in statement and "set search_path = ''" in statement, name
    for table in ("building_payments", "building_demolitions"):
        assert f"alter table public.{table} enable row level security;" in text
        assert (
            f"revoke all on table public.{table} from public, anon, authenticated, service_role;"
            in text
        )
        assert not re.search(rf"create policy [^;]* on public\.{table}", text)


def test_the_database_tears_down_only_the_island_build_spots():
    """The plot rule of the SQL matches the island's spots of islands.json exactly."""
    catalogue = load_island()
    rule = re.search(r"p_plot !~ '(\^\(.*?\)\$)'", DEMOLISH.read_text()).group(1)
    spots = {spot.id for spot in catalogue.spots}
    assert {plot for plot in spots if re.fullmatch(rule, plot)} == spots
    for other in (
        *PROTECTED,
        "plot_2",
        "plot_3",
        "plot_4",
        "islet_signal_station",
        "pp_tower_1",
        "wall_13",
    ):
        assert not re.fullmatch(rule, other), other


def test_the_server_sends_every_kinds_price_list():
    table = price_table(load_island())
    assert table["cannon"] == [30, 60, 120, 240, 480]
    assert table["house"] == [50, 100, 200]
    assert set(table) == {"wall", "cannon", "mortar", "harpoon", "swivel", "watchtower", "house"}
    assert table["harpoon"] == [40, 80, 160, 320, 640]
