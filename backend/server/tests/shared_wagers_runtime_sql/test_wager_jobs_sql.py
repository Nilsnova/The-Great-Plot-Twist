"""Durable work/authorization pages on PostgreSQL; authority is explicitly injected."""

import pytest

psycopg = pytest.importorskip("psycopg")
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    as_owner,
    keys,
    reconciles,
    rpc,
)
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


def test_pages_allow_many_same_event_bets_and_refuse_other_account_cursors(database):
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
