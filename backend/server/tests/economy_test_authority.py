"""Seed real canonical authority facts for disposable domain-unit PostgreSQL tests.

These owner-written rows are test setup, not accepted bell/controller lifecycle or
provider-authenticated acceptance. The actual authority RPC is never replaced.
"""

import json
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from psycopg import sql

FIXTURE_SQL = Path(__file__).with_name("economy_authority_fixture.sql")
_PROVIDER = "public.island_economy_authority(uuid,uuid)"


def authority_definition(connection: Any) -> tuple:
    """Capture the actual provider body, owner, ACL and comment for mutation checks."""
    return connection.execute(
        "select pg_get_functiondef(p.oid),p.proowner,p.proacl,obj_description(p.oid,'pg_proc') "
        "from pg_proc p where p.oid=to_regprocedure(%s)", (_PROVIDER,)
    ).fetchone()


def install_test_authority(connection: Any) -> None:
    """Compatibility name: require the canonical provider; install no substitute."""
    definition = authority_definition(connection)
    if definition is None or "canonical membership/reservation/leader" not in (definition[3] or ""):
        raise AssertionError("canonical economy authority migration is required")


def configure_test_authority(
    connection: Any,
    actor_id: UUID | str,
    island_owner: UUID | str,
    *,
    reservation_id: UUID | str | None = None,
    session_leader_id: UUID | str | None = None,
    actor_assignment_wave_id: UUID | str | None = None,
) -> None:
    """Set actual provider facts explicitly, without granting game membership.

    This bypasses lifecycle production only for isolated domain tests. Native
    lifecycle acceptance must create these facts through the real producer RPCs.
    """
    connection.execute("reset role")
    install_test_authority(connection)
    state = connection.execute(
        "select current_account_id,run_epoch from public.island_economy_state "
        "where island_owner=%s", (island_owner,)
    ).fetchone()
    if state is None:
        assert reservation_id is session_leader_id is actor_assignment_wave_id is None
        return  # Legacy setup has no shared authority context.
    account, epoch = state
    # Accounting is immutable. Close only the mutable wave-run fact when a test
    # moves back to the idle phase; do not edit/delete frozen accounting rows.
    connection.execute(
        "update public.wave_runs r set finished_at=clock_timestamp(),survived=false,"
        "ships_sunk=0,loot=0 "
        "from public.island_wave_accounting a where a.wave_id=r.id "
        "and a.island_owner=%s and a.run_epoch=%s and r.finished_at is null "
        "and (%s::uuid is null or r.id<>%s::uuid)",
        (island_owner, epoch, reservation_id, reservation_id),
    )
    if reservation_id is not None:
        connection.execute(
            "insert into public.wave_runs(id,started_by,action_uid,place,island_owner,wave,"
            "seed,starts_at,minimum_seconds,maximum_seconds,weather_kind,"
            "weather_ships,weather_fog) "
            "values(%s,%s,%s,'island',%s,1,42,statement_timestamp(),0,600,'calm',1,0) "
            "on conflict(id) do nothing",
            (reservation_id, island_owner, uuid4().hex, island_owner),
        )
        connection.execute(
            "insert into public.island_wave_accounting(wave_id,island_owner,account_id,run_epoch,"
            "wave_protocol,played_wave,seed,started_by,starts_at,maximum_seconds,roster,"
            "reward_basis,request_fingerprint) "
            "select id,island_owner,%s,%s,2,wave,seed,started_by,starts_at,maximum_seconds,"
            "'[]'::jsonb,'{}'::jsonb,'{}'::jsonb from public.wave_runs where id=%s "
            "on conflict(wave_id) do nothing", (account, epoch, reservation_id),
        )
    connection.execute(
        "update public.shared_session_settings set leader_id=%s where island_owner=%s",
        (session_leader_id, island_owner),
    )
    if session_leader_id is not None:
        connection.execute(
            "insert into public.shared_session_controls(player_id,island_owner,run_epoch,"
            "session_id,connection_generation,last_seen,active_since,connected_until) "
            "values(%s,%s,%s,%s,1,statement_timestamp(),statement_timestamp(),"
            "statement_timestamp()+interval '60 seconds') on conflict(player_id) do update set "
            "island_owner=excluded.island_owner,run_epoch=excluded.run_epoch,"
            "last_seen=excluded.last_seen,active_since=excluded.active_since,"
            "connected_until=excluded.connected_until,grace_until=null,released_at=null",
            (session_leader_id, island_owner, epoch, uuid4()),
        )
    if actor_assignment_wave_id is not None:
        # Minimal real personal row is enough for the read-only provider. Rules
        # initialization/freezing are separately tested by Captain/lifecycle suites.
        connection.execute(
            "insert into public.personal_captain_profiles(player_id,level,won_wave_best,"
            "earned_points,rules,assignment_wave_id) values(%s,1,0,0,'{}'::jsonb,%s) "
            "on conflict(player_id) do update set assignment_wave_id=excluded.assignment_wave_id",
            (actor_id, actor_assignment_wave_id),
        )
    else:
        connection.execute(
            "update public.personal_captain_profiles set assignment_wave_id=null,"
            "assignment_engineer_commitment_id=null where player_id=%s", (actor_id,)
        )


@contextmanager
def authority_outage(connection: Any, *, enabled: bool = True) -> Iterator[None]:
    """Simulate actual provider absence only inside a forced-rollback savepoint."""
    if not enabled:
        yield
        return
    connection.execute("reset role")
    original = authority_definition(connection)
    assert original is not None
    try:
        with connection.transaction(force_rollback=True):
            connection.execute("drop function public.island_economy_authority(uuid,uuid)")
            yield
    finally:
        assert authority_definition(connection) == original


def malformed_authority_domain(connection: Any, name: str, payload: Any) -> Any:
    """Clone actual SQL consumer/domain in pg_temp with only its result source injected.

    This is parser/domain-unit fault injection, not a canonical-provider test.
    Real root/financial/asset helpers still execute, preserving rollback assertions.
    The returned dispatcher redirects only this domain; public provider stays intact.
    """
    connection.execute("reset role")
    original = authority_definition(connection)
    consumer = {
        "island_shared_arsenal_mutate": "island_shared_arsenal_authority",
        "island_shared_boat_start": "island_boat_require_play_locked",
    }.get(name, name)
    literal = sql.Literal("select " + sql.Literal(json.dumps(payload)).as_string(connection)
                          + "::jsonb").as_string(connection)

    def clone(function: str, *, inject: bool) -> None:
        rows = connection.execute(
            "select pg_get_functiondef(p.oid),p.oid::regprocedure::text "
            "from pg_proc p join pg_namespace n "
            "on n.oid=p.pronamespace where n.nspname='public' and p.proname=%s", (function,)
        ).fetchall()
        assert len(rows) == 1
        source = rows[0][0].replace("FUNCTION public." + function + "(",
                                    "FUNCTION pg_temp." + function + "(", 1)
        if inject:
            needle = "'select public.island_economy_authority($1,$2)'"
            assert source.count(needle) == 1
            source = source.replace(needle, literal)
        else:
            assert "public." + consumer + "(" in source
            source = source.replace("public." + consumer + "(", "pg_temp." + consumer + "(")
        connection.execute(source)
        signature = rows[0][1].replace("public.", "").replace(
            function + "(", "pg_temp." + function + "(", 1
        )
        connection.execute(sql.SQL("revoke all on function {} from public").format(
            sql.SQL(signature)))
        if function == name:
            connection.execute(sql.SQL("grant execute on function {} to service_role").format(
                sql.SQL(signature)))


    clone(consumer, inject=True)
    if consumer != name:
        clone(name, inject=False)
    assert authority_definition(connection) == original

    def invoke(target: Any, function: str, *arguments: Any) -> Any:
        namespace = "pg_temp" if function == name else "public"
        query = sql.SQL("select {}.{}({})").format(
            sql.Identifier(namespace), sql.Identifier(function),
            sql.SQL(",").join(sql.Placeholder() for _ in arguments),
        )
        result = target.execute(query, arguments).fetchone()[0]
        assert authority_definition(target) == original
        return result

    return invoke
