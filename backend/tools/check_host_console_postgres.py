"""G14 scratch database checks. Never reads settings, .env, credentials or a remote database.

Run in backend/: uv run --frozen --with pgserver --with 'psycopg[binary]' \
python -m tools.check_host_console_postgres
Test-only packages; not project dependencies. A new disposable local cluster is always used.
"""

import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pgserver
import psycopg

from server.market.game_day import game_day_start
from server.market.positions import FEE_BASIS_POINTS, closing_amounts, fee_for
from server.market.store_calls import close_arguments, open_arguments

MIGRATIONS = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
HOST = uuid4()
OTHER = uuid4()


def scalar(connection, sql, params=()):
    return connection.execute(sql, params).fetchone()[0]


def crew(connection, *, owner=HOST, status="forming", other_seat=False):
    crew_id = uuid4()
    connection.execute(
        "insert into public.crews(id,created_by,mode,status) values(%s,%s,'crew',%s)",
        (crew_id, owner, status),
    )
    connection.execute(
        "insert into public.crew_seats(crew_id,seat_no,player_id,kit) values(%s,1,%s,'witness')",
        (crew_id, owner),
    )
    if other_seat:
        connection.execute(
            "insert into public.crew_seats(crew_id,seat_no,player_id,kit) "
            "values(%s,2,%s,'stranger')",
            (crew_id, OTHER),
        )
    return crew_id


def close(connection, crew_id, action=None):
    return scalar(
        connection,
        "select public.host_close_test_crew(%s,%s,%s)",
        (HOST, crew_id, action or uuid4()),
    )


def check_permissions(connection):
    functions = [
        "host_console_overview()",
        "host_console_crews(uuid)",
        "host_close_test_crew(uuid,uuid,uuid)",
        "host_record_keepalive()",
    ]
    for function in functions:
        qualified = "public." + function
        assert not scalar(
            connection, "select prosecdef from pg_proc where oid=%s::regprocedure", (qualified,)
        )
        config = scalar(
            connection, "select proconfig from pg_proc where oid=%s::regprocedure", (qualified,)
        )
        assert 'search_path=""' in config
        for role in ("anon", "authenticated"):
            assert not scalar(
                connection, "select has_function_privilege(%s,%s,'execute')", (role, qualified)
            )
        assert scalar(
            connection, "select has_function_privilege('service_role',%s,'execute')", (qualified,)
        )
    for table in ("host_console_actions", "host_console_health"):
        assert scalar(
            connection,
            "select relrowsecurity from pg_class where oid=%s::regclass",
            ("public." + table,),
        )
        for role in ("anon", "authenticated"):
            assert not scalar(
                connection, "select has_table_privilege(%s,%s,'select')", (role, "public." + table)
            )
            connection.execute(f"set role {role}")
            try:
                connection.execute("select public.host_console_overview()")
            except psycopg.errors.InsufficientPrivilege:
                pass
            else:
                raise AssertionError("Browser role could call a host RPC")
            finally:
                connection.execute("reset role")


def check_aggregates(connection):
    empty = scalar(connection, "select public.host_console_overview()")
    assert empty["players"] == 0 and empty["walletToday"] == []
    for player_id in (HOST, OTHER):
        connection.execute("insert into auth.users(id) values(%s)", (player_id,))
    for amount, reason, when in [
        (10, "kit_grant", "now()"),
        (-3, "clue_purchase", "now()"),
        (90, "kit_grant", "now()-interval '2 days'"),
    ]:
        connection.execute(
            "insert into public.wallet_transactions(player_id,delta,reason,ref,balance_after,"
            f"created_at) values(%s,%s,%s,%s,0,{when})",
            (HOST, amount, reason, str(uuid4())),
        )
    result = scalar(connection, "select public.host_console_overview()")
    assert result["players"] == 2
    movements = {row["reason"]: row for row in result["walletToday"]}
    assert movements["kit_grant"] == {
        "reason": "kit_grant",
        "count": 1,
        "earned": 10,
        "spent": 0,
        "net": 10,
    }
    assert movements["clue_purchase"]["spent"] == 3
    objects = result["schemaObjects"]
    assert all(present for name, present in objects.items() if name != "festival_actions")
    assert objects["festival_actions"] is any(MIGRATIONS.glob("20261106160000_*.sql"))
    connection.execute("select public.host_record_keepalive()")
    result = scalar(connection, "select public.host_console_overview()")
    assert result["lastKeepaliveAt"] is not None


def check_closes(connection):
    target = crew(connection)
    action = uuid4()
    assert close(connection, target, action)["status"] == "closed"
    assert close(connection, target, action)["status"] == "closed"
    assert close(connection, target)["reason"] == "not_forming"
    assert scalar(connection, "select version from public.crews where id=%s", (target,)) == 2
    seats = scalar(connection, "select count(*) from public.crew_seats where crew_id=%s", (target,))
    assert seats == 1
    assert scalar(connection, "select count(*) from public.host_console_actions") == 1
    for target, reason in [
        (crew(connection, owner=OTHER), "not_test_crew"),
        (crew(connection, status="active"), "not_forming"),
        (crew(connection, other_seat=True), "not_test_crew"),
        (uuid4(), "not_test_crew"),
    ]:
        assert close(connection, target)["reason"] == reason
    another = crew(connection)
    assert close(connection, another, action)["reason"] == "action_conflict"
    state = scalar(connection, "select status from public.crews where id=%s", (another,))
    assert state == "forming"
    assert scalar(connection, "select count(*) from public.wallet_transactions") == 3


def check_positions(connection):
    connection.execute(
        "select public.apply_wallet_transaction(%s,1000,'admin_adjust','host-test')", (HOST,)
    )
    arguments = open_arguments(
        str(HOST),
        "harbor-trust",
        "rising",
        "replay",
        Decimal(100),
        100,
        fee_for(100, FEE_BASIS_POINTS),
        FEE_BASIS_POINTS,
        "market:open:host-position",
        game_day_start(datetime.now(UTC)),
    )
    placeholders = ",".join("%s" for _ in arguments)
    opened = scalar(
        connection,
        f"select public.exchange_open_position({placeholders})",
        tuple(arguments.values()),
    )
    assert opened["status"] == "done"
    result = scalar(connection, "select public.host_console_overview()")
    assert result["openPositions"] == 1 and result["schemaObjects"]["exchange_positions"]
    closing = closing_amounts("rising", 100, Decimal(100), Decimal(100), FEE_BASIS_POINTS)
    arguments = close_arguments(
        str(HOST),
        opened["positionId"],
        "replay",
        Decimal(100),
        closing,
        FEE_BASIS_POINTS,
        "market:close:host-position",
    )
    placeholders = ",".join("%s" for _ in arguments)
    closed = scalar(
        connection,
        f"select public.exchange_close_position({placeholders})",
        tuple(arguments.values()),
    )
    assert closed["status"] == "done"
    assert scalar(connection, "select public.host_console_overview()")["openPositions"] == 0


def check_concurrency(connection, uri):
    targets = [crew(connection), crew(connection)]
    action = uuid4()

    def call(target):
        with psycopg.connect(uri, autocommit=True) as other:
            other.execute("set role service_role")
            return close(other, target, action)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(call, targets))
    assert sorted(r["status"] for r in results) == ["closed", "refused"]
    target = crew(connection)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(call, [target, target]))
    # Reusing the action for another crew cannot close it.
    assert all(r["reason"] == "action_conflict" for r in results)
    action = uuid4()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(call, [target, target]))
    assert all(r["status"] == "closed" for r in results)
    assert scalar(connection, "select version from public.crews where id=%s", (target,)) == 2


def main():
    server = pgserver.get_server(tempfile.mkdtemp(prefix="g14-pg-"), cleanup_mode="delete")
    try:
        uri = server.get_uri()
        with psycopg.connect(uri, autocommit=True) as connection:
            assert connection.info.host.startswith("/"), "Only a disposable Unix socket is allowed"
            stub = Path(__file__).parents[1] / "server/tests/group3_sql/stub.sql"
            connection.execute(stub.read_text())
            for migration in sorted(MIGRATIONS.glob("*.sql")):
                connection.execute(migration.read_text())
            migration = MIGRATIONS / "20261106170000_host_console.sql"
            connection.execute(migration.read_text())
            check_permissions(connection)
            check_aggregates(connection)
            connection.execute("set role service_role")
            check_closes(connection)
            check_concurrency(connection, uri)
            for _ in range(55):
                crew(connection)
            recent = scalar(connection, "select public.host_console_crews(%s)", (HOST,))
            assert len(recent["crews"]) == 50 and recent["total"] > 50
            assert "player_id" not in str(recent) and "kit" not in str(recent)
            connection.execute("reset role")
            check_positions(connection)
            # Missing optional market schema is explicit, not a made-up zero.
            connection.execute("drop table public.exchange_positions cascade")
            result = scalar(connection, "select public.host_console_overview()")
            assert result["openPositions"] is None
            assert result["schemaObjects"]["exchange_positions"] is False
        print(
            "PASS: scratch PostgreSQL: all migrations, reapply, invoker grants/RLS, "
            "UTC aggregates, durable keepalive, safe closes, concurrent retries, "
            "bounded sanitized crews, missing schema"
        )
    finally:
        server.cleanup()


if __name__ == "__main__":
    main()
