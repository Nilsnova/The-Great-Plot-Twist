"""Tests that the Python code of the home islet and its SQL migration say the same thing.

The arguments of islet_build(), the pairs of plot and building, the longest ref, the biggest price
and the reasons the function can refuse with are written down twice: in the Python code
(backend/server/game/, routes/islet.py, wallet.py, content/buildings.json) and in
supabase/migrations/20261106070000_home_islet.sql. If someone changes only one of the two, a test
here fails. It is the same idea as test_wallet_matches_migration.py, which does this for the
wallet and the Island Exchange.

These tests read the SQL file as plain text. They need no database. The behaviour of the function
(the races, the rollbacks, who may run it) is checked on a scratch Postgres and written into the
manual test plan, steps H1 to H15, in supabase/README.md.

Used by: pytest (cd backend && uv run pytest).
"""

import re
from pathlib import Path

import pytest

from server.game.building_catalogue import Cost, load_buildings
from server.game.islet_service import REF_PREFIX, REFUSAL_REASONS
from server.game.islet_store import build_arguments
from server.routes.islet import ACTION_UID_MAX_LENGTH
from server.wallet import MAX_DELTA, MAX_REF_LENGTH, WALLET_REASONS

# The repo root is one level above backend/ (backend/server/tests/this_file.py).
REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATIONS = sorted((REPO_ROOT / "supabase" / "migrations").glob("*.sql"))
FOUNDATION = REPO_ROOT / "supabase" / "migrations" / "20261106000000_foundation.sql"
HOME_ISLET = REPO_ROOT / "supabase" / "migrations" / "20261106070000_home_islet.sql"

# The same two scans as in test_wallet_matches_migration.py: ANY insert into the list of wallet
# reasons, and any statement that changes or removes a reason. Words in comments count too.
ANY_REASON_INSERT = re.compile(r"insert\s+into\s+(?:public\.)?wallet_reasons\b", re.IGNORECASE)
REASON_CHANGE = re.compile(
    r"\b(?:update|delete\s+from|truncate)\s+(?:table\s+)?(?:public\.)?wallet_reasons\b",
    re.IGNORECASE,
)

ISLETS_COLUMNS = ("player_id", "timber", "created_at", "updated_at")
BUILDINGS_COLUMNS = (
    "player_id",
    "plot",
    "building_type",
    "level",
    "coins_paid",
    "timber_paid",
    "ref",
    "built_at",
)


def migration_text() -> str:
    return HOME_ISLET.read_text()


def find_in_migration(pattern: str) -> re.Match:
    """The first place in the home islet migration that matches `pattern`. Fails clearly."""
    match = re.search(pattern, migration_text(), re.DOTALL)
    assert match, f"Could not find this in {HOME_ISLET.name}: {pattern}. Did its layout change?"
    return match


def function_text() -> str:
    """The text of islet_build(), from its first line to the closing dollar signs."""
    return find_in_migration(r"create or replace function public\.islet_build\(.*?\n\$\$;").group(0)


def declared_parameters() -> list[str]:
    """The parameter names of islet_build(), in order."""
    text = find_in_migration(
        r"create or replace function public\.islet_build\((.*?)\)\s+returns"
    ).group(1)
    return [parameter.split()[0] for parameter in text.split(",")]


def sent_arguments() -> dict:
    return build_arguments(
        "player-1", "plot_2", "workshop", Cost(coins=300, timber=10), 20, "islet:click-0001"
    )


# --- the function and the arguments the server sends ---


def test_islet_build_takes_exactly_the_arguments_the_server_sends():
    assert declared_parameters() == list(sent_arguments())


def test_islet_build_has_no_default_for_any_argument():
    # A call that leaves out the ref, a price or the starter pack does not exist in the database.
    parameters = find_in_migration(
        r"create or replace function public\.islet_build\((.*?)\)\s+returns"
    ).group(1)

    assert "default" not in parameters


def test_the_migration_sorts_after_the_foundation():
    assert MIGRATIONS.index(HOME_ISLET) > MIGRATIONS.index(FOUNDATION)


def test_the_migration_adds_no_wallet_reason_and_building_purchase_is_a_spend_reason():
    text = migration_text()

    assert ANY_REASON_INSERT.search(text) is None
    assert REASON_CHANGE.search(text) is None
    assert ("building_purchase", "spend") in WALLET_REASONS


def test_islet_build_charges_with_the_reason_building_purchase():
    assert "'building_purchase'" in function_text()


def test_islet_build_holds_no_price_of_its_own():
    # Every number has one home: buildings.json. The database only compares against the numbers
    # it is given (300 coins, 10 timber and a starter pack of 20 today).
    assert re.search(r"\b(300|20|10)\b", function_text()) is None


def test_the_ledger_ref_is_the_prefix_and_the_action_uid():
    assert REF_PREFIX == "islet:"
    assert sent_arguments()["p_ref"] == "islet:click-0001"


def test_the_refusals_the_function_returns_are_the_reasons_the_server_knows():
    returned = re.findall(r"'reason',\s*'([a-z_]+)'", function_text())

    assert set(returned) == set(REFUSAL_REASONS)


def test_a_repeated_ref_is_raised_with_the_unique_violation_code_the_server_maps():
    # AlreadyApplied (supabase_admin.py) answers 409 already_applied for code 23505.
    assert "raise exception 'already_applied' using errcode = '23505'" in function_text()


@pytest.mark.parametrize(
    "key", ["'status'", "'done'", "'refused'", "'balance'", "'timber'", "'level'", "'standing'"]
)
def test_the_function_answers_with_the_keys_the_server_reads(key):
    assert key in function_text()


def test_a_refusal_for_too_little_timber_says_how_much_timber_is_held():
    assert "'timberHeld'" in function_text()


# --- the tables ---


def test_the_allowed_plot_and_building_pairs_are_the_buildable_spots_of_buildings_json():
    # The cabin stands from the start and has no row. Every other spot can hold a row some day,
    # also the windmill and the greenhouse, which cannot be built yet.
    check = find_in_migration(
        r"islet_buildings_plot_fits_building(.*?)islet_buildings_level_range"
    ).group(1)
    pairs_in_sql = set(re.findall(r"\('([a-z0-9_]+)',\s*'([a-z0-9_]+)'\)", check))

    pairs_in_file = {
        (spot.plot, spot.building_type)
        for spot in load_buildings().spots
        if not spot.stands_from_start
    }
    assert pairs_in_sql == pairs_in_file
    assert len(pairs_in_sql) == 4


def test_the_highest_price_in_the_database_is_the_wallet_limit():
    highest = find_in_migration(
        r"islet_buildings_coins_paid_range\s+check \(coins_paid between 1 and (\d+)\)"
    )

    assert int(highest.group(1)) == MAX_DELTA


def test_a_building_ref_can_be_as_long_as_a_wallet_ref():
    longest = find_in_migration(
        r"islet_buildings_ref_max_length\s+check \(char_length\(ref\) <= (\d+)\)"
    )

    assert int(longest.group(1)) == MAX_REF_LENGTH


def test_the_action_uid_limit_fits_into_the_ref_with_its_prefix():
    assert len(REF_PREFIX) + ACTION_UID_MAX_LENGTH <= MAX_REF_LENGTH


def test_a_ref_cannot_be_blank():
    find_in_migration(r"islet_buildings_ref_not_blank\s+check \(char_length\(btrim\(ref\)\) > 0\)")


def test_timber_and_the_timber_paid_cannot_go_below_zero():
    find_in_migration(r"islets_timber_not_negative\s+check \(timber >= 0\)")
    find_in_migration(r"islet_buildings_timber_paid_not_negative\s+check \(timber_paid >= 0\)")


def test_the_level_is_from_one_to_three_and_the_function_builds_level_one():
    find_in_migration(r"islet_buildings_level_range\s+check \(level between 1 and 3\)")
    assert re.search(r"values\s*\(p_player_id, p_plot, p_building_type, 1, ", function_text())


def test_one_building_per_plot_is_the_primary_key_and_a_ref_is_used_once():
    find_in_migration(r"primary key \(player_id, plot\)")
    find_in_migration(
        r"create unique index if not exists islet_buildings_one_row_per_ref\s+"
        r"on public\.islet_buildings \(player_id, ref\)\s*;"
    )


def test_deleting_a_player_removes_the_islet_and_its_buildings():
    find_in_migration(
        r"player_id\s+uuid primary key references public\.profiles \(id\) on delete cascade"
    )
    find_in_migration(r"references public\.islets \(player_id\) on delete cascade")


def test_the_islet_stamps_its_update_time_with_the_helper_of_the_foundation():
    find_in_migration(
        r"create or replace trigger islets_touch_updated_at\s+"
        r"before insert or update on public\.islets\s+"
        r"for each row execute function public\.touch_updated_at\(\)"
    )


# --- who may do what ---


def test_both_tables_have_row_level_security_and_only_read_policies():
    text = migration_text()

    assert re.search(r"alter table public\.islets\s+enable row level security;", text)
    assert re.search(r"alter table public\.islet_buildings\s+enable row level security;", text)
    actions = re.findall(r'create policy "[^"]*"\s+on public\.\w+ for (\w+)', text)
    assert actions == ["select", "select"]


def test_the_migration_takes_every_right_away_before_it_grants():
    revoke = find_in_migration(
        r"revoke all on table public\.islets, public\.islet_buildings\s+"
        r"from public, anon, authenticated, service_role;"
    )
    first_grant_at = migration_text().index("grant select on table")

    assert revoke.start() < first_grant_at


def test_a_player_can_only_read_and_the_server_can_only_do_what_islet_build_needs():
    text = migration_text()

    assert re.search(
        r"grant select on table public\.islets, public\.islet_buildings\s+to authenticated;", text
    )
    assert re.search(
        r"grant select, insert, update on table public\.islets\s+to service_role;", text
    )
    assert re.search(
        r"grant select, insert on table public\.islet_buildings\s+to service_role;", text
    )


def test_nobody_who_is_not_signed_in_is_granted_anything():
    grants = re.findall(r"\bgrant\b[^;]*;", migration_text())

    assert grants
    assert [grant for grant in grants if re.search(r"\bto\b[^;]*\banon\b", grant)] == []


def test_islet_build_is_for_the_server_only_and_not_security_definer():
    text = migration_text()
    start = r"function public\.islet_build\(.*?\)\s+"

    assert re.search(rf"revoke all on {start}from public, anon, authenticated;", text, re.DOTALL)
    assert re.search(rf"grant execute on {start}to service_role;", text, re.DOTALL)
    assert "security definer" not in text.lower().replace("not security definer", "")
    assert "set search_path = ''" in function_text()


def test_islet_build_locks_the_wallet_before_it_charges_through_apply_wallet_transaction():
    body = function_text()

    wallet_lock = body.index("from public.wallets where player_id = p_player_id for update")
    islet_row = body.index("insert into public.islets")
    islet_lock = re.search(
        r"from public\.islets\s+where player_id = p_player_id\s+for update", body
    ).start()
    charge = body.index("public.apply_wallet_transaction(p_player_id, -p_coins,")

    # The wallet is locked first, like market_trade() does, so a trade and a build of the same
    # player never wait for each other in a circle.
    assert wallet_lock < islet_row < islet_lock < charge


def test_islet_build_does_not_move_coins_in_any_other_way():
    body = function_text()

    assert "update public.wallets" not in body
    assert "insert into public.wallet_transactions" not in body
    assert body.count("apply_wallet_transaction") == 1


def test_the_starter_pack_is_handed_out_once_and_never_again():
    # "do nothing" on a conflict leaves the islet row of a player who has built before as it is.
    # A rule that wrote the starter pack over the timber here would hand it out again on every
    # build, and the timber would never run out.
    assert re.search(
        r"insert into public\.islets \(player_id, timber\)\s+"
        r"values \(p_player_id, p_starter_timber\)\s+"
        r"on conflict \(player_id\) do nothing;",
        function_text(),
    )


def test_islet_build_runs_its_checks_in_the_documented_order():
    # The order is the contract (specs/L2-home-islet.md section 5.3): lock the wallet, answer a
    # repeat, make the islet row, refuse an occupied plot, refuse too little timber, and only then
    # take the coins. The exact text of each step is pinned too, so a comparison that is off by
    # one (<= instead of <) fails here and not only on a real database.
    body = function_text()
    steps = [
        ("the wallet lock", "from public.wallets where player_id = p_player_id for update"),
        ("the repeated ref", "raise exception 'already_applied'"),
        ("the islet row with the starter pack", "insert into public.islets"),
        ("the occupied plot", "'plot_occupied'"),
        ("the timber check", "if v_timber < p_timber then"),
        ("the charge", "public.apply_wallet_transaction("),
    ]
    for name, text in steps:
        assert text in body, f"islet_build() no longer holds {name}: {text!r}. Layout changed?"

    positions = sorted((body.index(text), name) for name, text in steps)

    assert [name for _, name in positions] == [name for name, _ in steps]


# --- the comments the house style asks for ---


@pytest.mark.parametrize("table", ["islets", "islet_buildings"])
def test_both_tables_have_a_comment(table):
    assert f"comment on table public.{table} is" in migration_text()


@pytest.mark.parametrize(
    "line",
    [f"comment on column public.islets.{name} is" for name in ISLETS_COLUMNS]
    + [f"comment on column public.islet_buildings.{name} is" for name in BUILDINGS_COLUMNS],
)
def test_every_column_has_a_comment(line):
    assert line in migration_text()


@pytest.mark.parametrize(
    "line",
    [
        'comment on policy "Players can read their own islet" on public.islets is',
        'comment on policy "Players can read their own islet buildings" '
        "on public.islet_buildings is",
        "comment on function public.islet_build"
        "(uuid, text, text, bigint, integer, integer, text) is",
    ],
)
def test_both_policies_and_the_function_have_a_comment(line):
    assert line in migration_text()
