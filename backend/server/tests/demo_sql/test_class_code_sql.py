"""Real SQL checks for the class code migration (20261109020000_class_code.sql).

Opt-in, on a disposable local PostgreSQL that the case_sql fixture builds (all migrations, applied
twice). Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/demo_sql

The row-level security checks act as the role authenticated with a login token, the way PostgREST
and Realtime run a browser's query: a GitHub player (is_anonymous false), an anonymous guest who
never presented the class code, and an admitted guest. No test reads a database URL or uses the
network.
"""

import json
from uuid import UUID, uuid4

import pytest

HOST = UUID(int=911)
PLAYER = UUID(int=912)  # a GitHub or Google player
GUEST = UUID(int=913)  # an anonymous user who never presented the code
ADMITTED = UUID(int=914)  # an anonymous user the server admitted

# Every browser policy of the game, by table: the ones this migration rewrites.
POLICIES = {
    ("public", "captain_name_rerolls"): ["Players can read their own name re-roll"],
    ("public", "crew_seats"): ["Players can read the seats of their crews"],
    ("public", "crews"): ["Players can read the crews they sit in"],
    ("public", "duels"): ["Players can read the duels they take part in"],
    ("public", "entry_profiles"): ["Players can read their own entry profile"],
    ("public", "exchange_events"): ["Players can read their own exchange events"],
    ("public", "exchange_positions"): ["Players can read their own exchange positions"],
    ("public", "islet_buildings"): ["Players can read their own islet buildings"],
    ("public", "islets"): ["Players can read their own islet"],
    ("public", "prediction_pools"): ["Players can read all prediction pools"],
    ("public", "prediction_stakes"): ["Players can read their own prediction stakes"],
    ("public", "profiles"): ["Players can read all profiles"],
    ("public", "saves"): ["Players can read their own save"],
    ("public", "wallet_reasons"): ["Players can read all wallet reasons"],
    ("public", "wallet_transactions"): ["Players can read their own transactions"],
    ("public", "wallets"): ["Players can read their own wallet"],
    ("realtime", "messages"): [
        "Live: crew members can hear their crew room",
        "Live: players can move in a place room",
        "Live: players can say where they are",
        "Live: players can see who is online",
        "Live: players can watch a place room",
    ],
}


def call(database, sql, *arguments):
    return database.execute(sql, arguments).fetchone()[0]


def as_server(database):
    database.execute("set local role service_role")


def as_owner(database):
    database.execute("reset role")


def add_players(database, *players):
    for player in players:
        database.execute(
            "insert into auth.users (id) values (%s) on conflict do nothing", (player,)
        )


def as_browser(database, player, *, anonymous):
    """The role authenticated with the login token of `player`. None leaves the claim out."""
    claims = {"sub": str(player), "role": "authenticated"}
    if anonymous is not None:
        claims["is_anonymous"] = anonymous
    database.execute("set local role authenticated")
    database.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps(claims),))


def code_set(database, code, uid=None, host=HOST):
    return call(
        database, "select public.demo_class_code_set(%s, %s, %s)", host, uid or uuid4(), code
    )


def admit(database, player):
    return call(database, "select public.demo_guest_admit(%s)", player)


def seed(database):
    """Three players and one admitted guest, each with their own rows from the sign-up trigger."""
    add_players(database, HOST, PLAYER, GUEST, ADMITTED)
    as_server(database)
    assert admit(database, ADMITTED) == {"status": "admitted"}
    as_owner(database)


def visible(database, table, player, *, anonymous):
    as_browser(database, player, anonymous=anonymous)
    count = call(database, f"select count(*) from public.{table}")
    as_owner(database)
    return count


# --- the code ---


def test_the_code_row_is_empty_after_two_runs(database):
    rows = database.execute(
        "select name, code, set_by, set_at from public.demo_class_code"
    ).fetchall()

    assert rows == [("class_demo", None, None, None)]
    as_server(database)
    assert call(database, "select public.demo_class_code_read()") == {
        "code": None,
        "setAt": None,
        "guests": 0,
    }


def test_a_new_code_replaces_the_old_one_and_a_repeat_changes_nothing(database):
    add_players(database, HOST)
    as_server(database)
    uid = uuid4()

    first = code_set(database, "K7QXM", uid)
    assert first["status"] == "set" and first["code"] == "K7QXM" and first["repeat"] is False
    assert first["setAt"] is not None
    repeat = code_set(database, "PRACT", uid)
    assert repeat == {**first, "repeat": True}

    second = code_set(database, "ZZ234")
    assert second["code"] == "ZZ234" and second["repeat"] is False
    assert call(database, "select public.demo_class_code_read()")["code"] == "ZZ234"
    audit = database.execute(
        "select code from public.demo_class_code_actions where host_id = %s",
        (HOST,),
    ).fetchall()
    assert sorted(code for (code,) in audit) == ["K7QXM", "ZZ234"]


@pytest.mark.parametrize(
    "code",
    [
        None,
        "",
        "k7qxm",
        "K7QX",
        "K7QXMM",
        "K7QX0",
        "K7QXO",
        "K7QX1",
        "K7QXI",
        "K7QXL",
        "HARBOR-K7QXM",
        "K7 QX",
    ],
)
def test_a_code_outside_the_format_is_refused(database, code):
    import psycopg

    add_players(database, HOST)
    as_server(database)
    database.execute("savepoint refused")
    with pytest.raises(psycopg.errors.RaiseException, match="bad_class_code"):
        code_set(database, code)
    database.execute("rollback to savepoint refused")
    assert call(database, "select public.demo_class_code_read()")["code"] is None
    assert call(database, "select count(*) from public.demo_class_code_actions") == 0


def test_a_guest_is_admitted_once_and_a_new_code_keeps_them(database):
    add_players(database, HOST, GUEST)
    as_server(database)
    code_set(database, "K7QXM")

    assert admit(database, GUEST) == {"status": "admitted"}
    first = call(database, "select admitted_at from public.demo_guests where player_id = %s", GUEST)
    assert admit(database, GUEST) == {"status": "already"}
    code_set(database, "ZZ234")

    assert (
        call(database, "select admitted_at from public.demo_guests where player_id = %s", GUEST)
        == first
    )
    assert call(database, "select public.demo_class_code_read()")["guests"] == 1


def test_an_unknown_user_is_missing_and_nothing_is_stored(database):
    as_server(database)

    assert admit(database, uuid4()) == {"status": "missing"}
    assert call(database, "select count(*) from public.demo_guests") == 0


def test_deleting_a_guest_removes_their_admission_and_the_host_keeps_the_code(database):
    add_players(database, HOST, GUEST)
    as_server(database)
    code_set(database, "K7QXM")
    admit(database, GUEST)
    as_owner(database)

    assert call(database, "select public.delete_player(%s)", GUEST) == {"status": "deleted"}
    assert call(database, "select public.delete_player(%s)", HOST) == {"status": "deleted"}

    assert call(database, "select count(*) from public.demo_guests") == 0
    assert call(database, "select count(*) from public.demo_class_code_actions") == 0
    row = database.execute("select code, set_by from public.demo_class_code").fetchone()
    assert row == ("K7QXM", None)


def test_browser_roles_cannot_touch_the_code_or_the_guests(database):
    import psycopg

    add_players(database, PLAYER)
    for role in ("anon", "authenticated"):
        for statement in (
            "select * from public.demo_class_code",
            "select * from public.demo_class_code_actions",
            "select * from public.demo_guests",
            f"insert into public.demo_guests (player_id) values ('{PLAYER}')",
            "select public.demo_class_code_read()",
            f"select public.demo_guest_admit('{PLAYER}')",
            f"select public.demo_class_code_set('{PLAYER}', '{uuid4()}', 'K7QXM')",
        ):
            database.execute("savepoint denied")
            database.execute(f"set local role {role}")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                database.execute(statement)
            database.execute("rollback to savepoint denied")


def test_the_policy_helpers_are_for_authenticated_only(database):
    rows = database.execute(
        "select p.proname, p.prosecdef, p.proconfig, "
        "has_function_privilege('authenticated', p.oid, 'execute'), "
        "has_function_privilege('anon', p.oid, 'execute'), "
        "has_function_privilege('service_role', p.oid, 'execute'), "
        "obj_description(p.oid, 'pg_proc') is not null "
        "from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
        "where n.nspname = 'public' and p.proname in ('jwt_is_anonymous', 'is_admitted_guest', "
        "'demo_class_code_set', 'demo_class_code_read', 'demo_guest_admit') order by 1"
    ).fetchall()

    assert rows == [
        ("demo_class_code_read", False, ['search_path=""'], False, False, True, True),
        ("demo_class_code_set", False, ['search_path=""'], False, False, True, True),
        ("demo_guest_admit", False, ['search_path=""'], False, False, True, True),
        ("is_admitted_guest", True, ['search_path=""'], True, False, False, True),
        ("jwt_is_anonymous", False, ['search_path=""'], True, False, False, True),
    ]


def test_new_tables_have_rls_no_policy_and_comments(database):
    tables = database.execute(
        "select c.relname, c.relrowsecurity, obj_description(c.oid, 'pg_class') is not null "
        "from pg_class c join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname = 'public' and c.relname in "
        "('demo_class_code', 'demo_class_code_actions', 'demo_guests') order by 1"
    ).fetchall()
    assert tables == [
        ("demo_class_code", True, True),
        ("demo_class_code_actions", True, True),
        ("demo_guests", True, True),
    ]
    assert call(database, "select count(*) from pg_policies where tablename like 'demo_%%'") == 0
    uncommented = call(
        database,
        "select count(*) from information_schema.columns c where c.table_schema = 'public' "
        "and c.table_name in ('demo_class_code', 'demo_class_code_actions', 'demo_guests') "
        "and col_description(format('public.%%I', c.table_name)::regclass, c.ordinal_position) "
        "is null",
    )
    assert uncommented == 0


# --- the browser policies ---


def test_every_browser_policy_names_the_guest_check_and_keeps_its_name(database):
    rows = database.execute(
        "select schemaname, tablename, policyname, roles::text[], "
        "coalesce(qual, '') || coalesce(with_check, '') "
        "from pg_policies where schemaname in ('public', 'realtime') order by 1, 2, 3"
    ).fetchall()

    found: dict[tuple[str, str], list[str]] = {}
    for schema, table, name, roles, condition in rows:
        found.setdefault((schema, table), []).append(name)
        assert roles == ["authenticated"], name
        assert "jwt_is_anonymous()" in condition, name
        assert "is_admitted_guest()" in condition, name
    assert found == POLICIES
    assert sum(len(names) for names in found.values()) == 21


@pytest.mark.parametrize(
    "table", ["profiles", "saves", "wallets", "wallet_reasons", "entry_profiles"]
)
def test_an_anonymous_user_without_the_code_reads_nothing(database, table):
    seed(database)
    as_server(database)
    database.execute(
        "insert into public.entry_profiles (player_id, ending, decision, read_log, kit, "
        "start_place, kit_coins, move_count, story_sha256) select id, 'ending_demo', 'none', "
        "false, 'stranger', 'saltreach_harbor', 10, 1, repeat('a', 64) "
        "from unnest(array[%s, %s, %s]::uuid[]) as id",
        (PLAYER, GUEST, ADMITTED),
    )
    as_owner(database)

    assert visible(database, table, GUEST, anonymous=True) == 0
    # A token without the claim is treated as anonymous: a doubt never opens a door.
    assert visible(database, table, GUEST, anonymous=None) == 0


def test_an_admitted_guest_and_a_normal_player_read_as_before(database):
    seed(database)
    total_profiles = call(database, "select count(*) from public.profiles")
    total_reasons = call(database, "select count(*) from public.wallet_reasons")

    for player, anonymous in ((ADMITTED, True), (PLAYER, False)):
        assert visible(database, "profiles", player, anonymous=anonymous) == total_profiles
        assert visible(database, "wallet_reasons", player, anonymous=anonymous) == total_reasons
        # Own rows only, as before: one save and one wallet each.
        assert visible(database, "saves", player, anonymous=anonymous) == 1
        assert visible(database, "wallets", player, anonymous=anonymous) == 1
    # A normal player with an admission row would still be a normal player (it changes nothing).
    assert visible(database, "saves", PLAYER, anonymous=False) == 1


def test_a_normal_player_whose_token_is_anonymous_false_never_needs_an_admission(database):
    seed(database)

    assert (
        call(database, "select count(*) from public.demo_guests where player_id = %s", PLAYER) == 0
    )
    assert visible(database, "profiles", PLAYER, anonymous=False) > 0


def realtime_insert(database, player, topic, extension, *, anonymous):
    """True if the player may send (insert) into the room `topic`, as Realtime asks."""
    import psycopg

    database.execute("savepoint live")
    as_browser(database, player, anonymous=anonymous)
    database.execute("select set_config('realtime.topic', %s, true)", (topic,))
    try:
        database.execute(
            "insert into realtime.messages (topic, extension, payload, private) "
            "values (%s, %s, '{}'::jsonb, true)",
            (topic, extension),
        )
        allowed = True
    except psycopg.errors.InsufficientPrivilege:
        allowed = False
    database.execute("rollback to savepoint live")
    return allowed


def realtime_select(database, player, topic, extension, *, anonymous):
    """True if the player may receive in the room `topic`: a stored row is visible to them."""
    database.execute("savepoint live")
    as_owner(database)
    database.execute(
        "insert into realtime.messages (topic, extension, payload, private) "
        "values (%s, %s, '{}'::jsonb, true)",
        (topic, extension),
    )
    as_browser(database, player, anonymous=anonymous)
    database.execute("select set_config('realtime.topic', %s, true)", (topic,))
    count = call(database, "select count(*) from realtime.messages")
    database.execute("rollback to savepoint live")
    return count > 0


@pytest.mark.parametrize(
    ("topic", "extension"),
    [
        ("live:world", "presence"),
        ("live:place:class_harbor:1", "broadcast"),
        ("live:place:saltreach_harbor:2", "broadcast"),
    ],
)
def test_realtime_rooms_admit_only_admitted_guests_among_anonymous_users(
    database, topic, extension
):
    seed(database)

    assert realtime_insert(database, GUEST, topic, extension, anonymous=True) is False
    assert realtime_select(database, GUEST, topic, extension, anonymous=True) is False
    assert realtime_insert(database, GUEST, topic, extension, anonymous=None) is False
    for player, anonymous in ((ADMITTED, True), (PLAYER, False)):
        assert realtime_insert(database, player, topic, extension, anonymous=anonymous) is True
        assert realtime_select(database, player, topic, extension, anonymous=anonymous) is True
    # The room rules themselves are unchanged: the wrong kind of traffic stays refused.
    other = "broadcast" if extension == "presence" else "presence"
    assert realtime_insert(database, PLAYER, topic, other, anonymous=False) is False


def test_the_crew_room_needs_a_seat_and_for_a_guest_also_the_code(database):
    seed(database)
    as_owner(database)
    crew = uuid4()
    database.execute(
        "insert into public.crews (id, created_by, mode, status) "
        "values (%s, %s, 'crew', 'forming')",
        (crew, PLAYER),
    )
    for seat, player in enumerate((PLAYER, GUEST, ADMITTED), 1):
        database.execute(
            "insert into public.crew_seats (crew_id, seat_no, player_id, kit) "
            "values (%s, %s, %s, %s)",
            (crew, seat, player, ("witness", "informant", "true_keeper")[seat - 1]),
        )
    topic = f"live:crew:{crew}"

    assert realtime_select(database, GUEST, topic, "broadcast", anonymous=True) is False
    assert visible(database, "crew_seats", GUEST, anonymous=True) == 0
    assert visible(database, "crews", GUEST, anonymous=True) == 0
    assert realtime_select(database, ADMITTED, topic, "broadcast", anonymous=True) is True
    assert realtime_select(database, PLAYER, topic, "broadcast", anonymous=False) is True
    assert visible(database, "crew_seats", PLAYER, anonymous=False) == 3
    assert visible(database, "crews", ADMITTED, anonymous=True) == 1
    # Still nobody sends into a crew room from a browser.
    assert realtime_insert(database, PLAYER, topic, "broadcast", anonymous=False) is False
    # And a seat in another crew does not help.
    outsider = UUID(int=915)
    add_players(database, outsider)
    assert realtime_select(database, outsider, topic, "broadcast", anonymous=False) is False


def test_no_wallet_reason_or_ledger_row_comes_with_the_class_code(database):
    before = call(database, "select count(*) from public.wallet_reasons")
    add_players(database, HOST, GUEST)
    as_server(database)
    code_set(database, "K7QXM")
    admit(database, GUEST)

    assert call(database, "select count(*) from public.wallet_transactions") == 0
    assert call(database, "select count(*) from public.wallet_reasons") == before
