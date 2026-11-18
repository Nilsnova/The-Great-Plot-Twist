"""Durable work/authorization pages on PostgreSQL; authority is explicitly injected."""

import asyncio
from decimal import Decimal
from types import SimpleNamespace

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg import sql  # noqa: E402
from psycopg.types.json import Jsonb  # noqa: E402

from server.island.wager_jobs import settle_due_jobs  # noqa: E402
from server.market.calendars import ALWAYS_OPEN  # noqa: E402
from server.market.readings import Reading  # noqa: E402
from server.market.states import CompanyState  # noqa: E402
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    as_owner,
    keys,
    reconciles,
    rpc,
)
from server.tests.market_helpers import island_company  # noqa: E402
from server.tests.shared_wagers_sql.test_shared_wager_transactions_sql import (  # noqa: E402
    fixture_authority as fixture_authority,
)
from server.tests.shared_wagers_sql.test_shared_wager_transactions_sql import (  # noqa: E402
    make_due,
    open_wager,
    ready,
    settlement,
)


def due(connection, opened):
    make_due(connection, opened)
    connection.execute("update public.island_wager_jobs set next_attempt_at=clock_timestamp() "
                       "where wager_id=%s", (opened["wager"]["id"],))


def test_product_and_due_job_commit_together_without_a_browser(database):
    owner, actor, _, initial = ready(database)
    opened = open_wager(database, actor, owner, initial)
    as_owner(database)
    assert database.execute("select attempts,completed_at from public.island_wager_jobs "
                            "where wager_id=%s", (opened["wager"]["id"],)).fetchone() == (0, None)
    due(database, opened)
    rpc(database, "game_leave", actor, owner)
    assert rpc(database, "island_wager_jobs_due", 40)["jobs"] == [{
        "wagerId": opened["wager"]["id"], "product": "market_call", "eventId": "harbor-trust"
    }]


def test_retry_is_durable_and_completed_source_can_never_reenter_queue(database):
    owner, actor, _, initial = ready(database)
    opened = open_wager(database, actor, owner, initial)
    due(database, opened)
    assert rpc(database, "island_wager_job_retry", opened["wager"]["id"], "result_pending") == {
        "status": "done"
    }
    assert rpc(database, "island_wager_jobs_due", 40)["jobs"] == []
    assert settlement(database, opened)["status"] == "done"
    rpc(database, "island_wager_job_retry", opened["wager"]["id"], "worker_error")
    assert database.execute(
        "select completed_at is not null,last_error from public.island_wager_jobs "
        "where wager_id=%s", (opened["wager"]["id"],)
    ).fetchone() == (True, None)
    reconciles(database, keys(initial)[0])


def test_pages_allow_many_same_event_bets_and_refuse_outsiders(database):
    owner, actor, outsider, initial = ready(database, 100)
    for number in range(55):
        open_wager(database, actor, owner, initial, 1, f"market{number:03d}")
    page = rpc(database, "island_wager_page", actor, owner, keys(initial)[1], "market_call", None)
    assert len(page["items"]) == 50 and page["nextCursor"] is not None
    rest = rpc(database, "island_wager_page", actor, owner, keys(initial)[1], "market_call",
               page["nextCursor"])
    assert len(rest["items"]) == 5 and rest["nextCursor"] is None
    assert rpc(database, "island_wager_page", outsider, owner, keys(initial)[1],
               "market_call", None) == {"status": "refused", "reason": "not_member"}


def test_job_failure_rolls_back_the_root_product_and_hold(database):
    owner, actor, _, initial = ready(database)
    as_owner(database)
    database.execute("""
      create function public.test_queue_failure() returns trigger language plpgsql as $$
      begin raise exception 'test_queue_failure'; end; $$;
      create trigger test_queue_failure before insert on public.island_wager_jobs
      for each row execute function public.test_queue_failure();
    """)
    with pytest.raises(psycopg.errors.RaiseException, match="test_queue_failure"):
        with database.transaction():
            open_wager(database, actor, owner, initial)
    assert database.execute("select count(*) from public.island_wagers").fetchone() == (0,)
    assert database.execute(
        "select count(*) from public.island_economy_operations "
        "where actor_id=%s and action_uid='wager001'", (actor,)
    ).fetchone() == (0,)
    reconciles(database, keys(initial)[0])


class DatabaseAdmin:
    """Test-only bridge to real local SQL, replacing HTTP transport rather than money rules."""

    def __init__(self, connection):
        self.connection = connection

    async def call_function(self, name, parameters):
        arguments = [Jsonb(value) if isinstance(value, dict) else value
                     for value in parameters.values()]
        terms = [sql.SQL("{} => %s").format(sql.Identifier(key)) for key in parameters]
        statement = sql.SQL("select public.{}({})").format(
            sql.Identifier(name), sql.SQL(",").join(terms),
        )
        return self.connection.execute(statement, arguments).fetchone()[0]


class StaticMarket:
    """Injected source evidence; financial/authorization/queue behavior remains real SQL."""

    def __init__(self, connection):
        self.connection = connection
        self.price = Decimal("101")
        self.reads = 0

    def state(self, asset):
        moment = self.connection.execute("select clock_timestamp()").fetchone()[0]
        return CompanyState(island_company(id=asset), Reading(self.price, moment, moment, "live"),
                            ALWAYS_OPEN, "open", None, False, True)

    async def snapshot(self, admin, *, trading_enabled):
        self.reads += 1
        return SimpleNamespace(find=self.state)


def test_worker_settles_original_source_without_member_browser_or_current_admission(database):
    owner, actor, _, initial = ready(database, 100)
    opened = open_wager(database, actor, owner, initial)
    due(database, opened)
    rpc(database, "game_leave", actor, owner)
    as_owner(database)
    # This models retired-source settlement, not acceptance of the separately owned reset API.
    database.execute("update public.island_economy_accounts set state='retired',"
                     "retired_at=clock_timestamp() where id=%s", (keys(initial)[0],))
    worker = asyncio.run(settle_due_jobs(DatabaseAdmin(database), StaticMarket(database), None))
    assert worker == {"considered": 1, "settled": 1, "retried": 0}
    assert database.execute(
        "select balance_coins,committed_coins from public.island_economy_accounts "
        "where id=%s", (keys(initial)[0],)
    ).fetchone() == (150, 0)
    assert rpc(database, "island_wager_jobs_due", 40)["jobs"] == []
    reconciles(database, keys(initial)[0])


def test_worker_batch_size_does_not_drop_or_cap_many_same_event_stakes(database):
    owner, actor, _, initial = ready(database, 100)
    for number in range(55):
        opened = open_wager(database, actor, owner, initial, 1, f"market{number:03d}")
        due(database, opened)
    market = StaticMarket(database)
    first = asyncio.run(settle_due_jobs(DatabaseAdmin(database), market, None))
    second = asyncio.run(settle_due_jobs(DatabaseAdmin(database), market, None))
    assert first == {"considered": 40, "settled": 40, "retried": 0}
    assert second == {"considered": 15, "settled": 15, "retried": 0}
    assert market.reads == 2
    assert rpc(database, "island_wager_jobs_due", 40)["jobs"] == []
    reconciles(database, keys(initial)[0])


def test_worker_source_failure_leaves_a_durable_retry_without_releasing_principal(database):
    owner, actor, _, initial = ready(database, 100)
    opened = open_wager(database, actor, owner, initial)
    due(database, opened)
    worker = asyncio.run(settle_due_jobs(DatabaseAdmin(database), None, None))
    assert worker == {"considered": 1, "settled": 0, "retried": 1}
    assert database.execute("select attempts,last_error,completed_at from public.island_wager_jobs "
                            "where wager_id=%s", (opened["wager"]["id"],)).fetchone() == (
        1, "result_pending", None
    )
    reconciles(database, keys(initial)[0])
