"""Fresh Realtime authorization under real PostgreSQL RLS, never a hosted channel.

Use CASE_PG_SCRATCH=1 and test-only pgserver/psycopg. The complete migration chain
is applied twice on local Unix-socket PostgreSQL; no configured database is read.
"""

import json
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    as_owner,
    as_server,
    ready,
    rpc,
)


def room(database, owner):
    as_owner(database)
    code = database.execute(
        "select code from public.islands where player_id=%s", (owner,)
    ).fetchone()[0]
    return f"live:place:isle_{code.lower()}:1"


def allowed(database, actor, topic, operation, *, anonymous=False, extension="broadcast"):
    """Exercise the actual policies, with a row selected by its fresh message ID."""
    database.execute("savepoint channel_check")
    as_owner(database)
    message_id = uuid4()
    if operation == "select":
        database.execute(
            "insert into realtime.messages(id,topic,extension,private) values(%s,%s,%s,true)",
            (message_id, topic, extension),
        )
    claims = {"role": "authenticated"}
    if actor is not None:
        claims["sub"] = str(actor)
    if anonymous is not None:
        claims["is_anonymous"] = anonymous
    database.execute("set local role authenticated")
    database.execute("select set_config('request.jwt.claims',%s,true)", (json.dumps(claims),))
    database.execute("select set_config('realtime.topic',%s,true)", (topic,))
    try:
        if operation == "select":
            result = database.execute(
                "select count(*) from realtime.messages where id=%s", (message_id,)
            ).fetchone()[0] == 1
        else:
            database.execute(
                "insert into realtime.messages(id,topic,extension,private) values(%s,%s,%s,true)",
                (message_id, topic, extension),
            )
            result = True
    except psycopg.errors.InsufficientPrivilege:
        result = False
    database.execute("rollback to savepoint channel_check")
    return result


@pytest.mark.parametrize("operation", ["select", "insert"])
def test_shared_owner_and_exact_active_member_only(database, operation):
    owner, member, outsider, _ = ready(database)
    topic = room(database, owner)
    assert allowed(database, owner, topic, operation)
    assert allowed(database, member, topic, operation)
    assert not allowed(database, outsider, topic, operation)

    as_server(database)
    assert rpc(database, "game_leave", member, owner)["status"] == "left"
    assert not allowed(database, member, topic, operation)
    assert allowed(database, owner, topic, operation)


@pytest.mark.parametrize("operation", ["select", "insert"])
def test_legacy_admission_changes_the_next_authorization_and_paused_stays_private(
    database, operation
):
    owner, member, outsider, _ = ready(database, admitted=False)
    topic = room(database, owner)
    assert allowed(database, outsider, topic, operation)
    as_server(database)
    admitted = rpc(database, "island_treasury_admit", owner, owner, "admit0001", 100)
    assert admitted["status"] == "done"
    as_owner(database)
    database.execute(
        "update public.island_economy_state set admission_state='paused' where island_owner=%s",
        (owner,),
    )
    database.execute("update public.islands set flags=0 where player_id=%s", (owner,))
    assert not allowed(database, outsider, topic, operation)
    assert allowed(database, owner, topic, operation)
    assert allowed(database, member, topic, operation)


@pytest.mark.parametrize("operation", ["select", "insert"])
def test_membership_on_another_island_never_authorizes_this_one(database, operation):
    owner, _, outsider, _ = ready(database)
    other, _, _, _ = ready(database, admitted=False)
    as_server(database)
    assert rpc(database, "game_join", outsider, other, 10)["status"] == "joined"
    assert not allowed(database, outsider, room(database, owner), operation)


@pytest.mark.parametrize("operation", ["select", "insert"])
@pytest.mark.parametrize("anonymous", [True, None])
def test_existing_guest_admission_gate_still_applies_to_shared_members(
    database, operation, anonymous
):
    owner, member, outsider, _ = ready(database)
    topic = room(database, owner)
    assert not allowed(database, owner, topic, operation, anonymous=anonymous)
    assert not allowed(database, member, topic, operation, anonymous=anonymous)
    as_server(database)
    assert rpc(database, "demo_guest_admit", member)["status"] == "admitted"
    assert rpc(database, "demo_guest_admit", outsider)["status"] == "admitted"
    assert allowed(database, member, topic, operation, anonymous=anonymous)
    assert not allowed(database, outsider, topic, operation, anonymous=anonymous)


@pytest.mark.parametrize("operation", ["select", "insert"])
def test_known_legacy_islands_and_other_place_rooms_keep_existing_access(database, operation):
    owner, _, outsider, _ = ready(database, admitted=False)
    for topic in (room(database, owner), "live:place:class_harbor:1", "live:place:pirate_point:99"):
        assert allowed(database, outsider, topic, operation)
        assert not allowed(database, outsider, topic, operation, anonymous=True)
    as_server(database)
    rpc(database, "demo_guest_admit", outsider)
    assert allowed(database, outsider, room(database, owner), operation, anonymous=True)


@pytest.mark.parametrize("operation", ["select", "insert"])
def test_unknown_malformed_islands_and_room_aliases_are_denied(database, operation):
    owner, _, outsider, _ = ready(database)
    valid = room(database, owner)
    for topic in (
        "live:place:isle_22222:1",
        "live:place:isle_bad:1",
        "live:place:isle_aaaaa_extra:1",
        "live:place:isle_00000:1",
        "live:place:isle_:1",
        "live:place:isle:1",
        valid.upper(),
        valid[:-1] + "0",
        valid[:-1] + "01",
        valid[:-1] + "100",
        valid + ":extra",
    ):
        assert not allowed(database, outsider, topic, operation), topic
    assert allowed(database, owner, valid[:-1] + "99", operation)
    assert not allowed(database, outsider, valid[:-1] + "99", operation)
    assert not allowed(database, None, valid, operation)
    assert not allowed(database, owner, valid, operation, extension="presence")


def test_private_helper_has_only_caller_identity_and_minimal_grants(database):
    row = database.execute(
        "select p.prosecdef,p.provolatile,p.proconfig,pg_get_function_identity_arguments(p.oid),"
        "has_function_privilege('authenticated',p.oid,'execute'),"
        "has_function_privilege('anon',p.oid,'execute'),"
        "has_function_privilege('service_role',p.oid,'execute'),"
        "pg_get_userbyid(p.proowner) not in ('authenticated','anon','service_role') "
        "from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
        "where n.nspname='island_realtime_private'"
    ).fetchall()
    assert row == [(True, "s", ['search_path=""'], "p_topic text", True, False, False, True)]
    for role in ("anon", "authenticated", "service_role"):
        assert database.execute(
            "select has_schema_privilege(%s,'island_realtime_private','usage'),"
            "has_schema_privilege(%s,'island_realtime_private','create')",
            (role, role),
        ).fetchone() == (role == "authenticated", False)
    for table in ("islands", "island_members", "island_economy_state"):
        assert not database.execute(
            "select has_table_privilege('authenticated',%s,'select')", (f"public.{table}",)
        ).fetchone()[0]


def test_no_broad_policy_can_or_around_either_place_rule(database):
    rows = database.execute(
        "select policyname,cmd,roles::text[],permissive,coalesce(qual,with_check) "
        "from pg_policies where schemaname='realtime' and tablename='messages' order by 1"
    ).fetchall()
    assert [row[0] for row in rows] == [
        "Live: crew members can hear their crew room",
        "Live: players can move in a place room",
        "Live: players can say where they are",
        "Live: players can see who is online",
        "Live: players can watch a place room",
    ]
    for name, command, roles, permissive, condition in rows:
        assert roles == ["authenticated"] and permissive == "PERMISSIVE"
        assert "jwt_is_anonymous()" in condition and "is_admitted_guest()" in condition
        if "place room" in name:
            assert command in ("SELECT", "INSERT")
            assert "island_realtime_private.may_access_place_topic" in condition
            assert "broadcast" in condition
