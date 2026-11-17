"""Observe real wall-run SQL contention, namespace bounds and restored transaction authority."""

import json
import queue
import threading
import time
from contextlib import contextmanager

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_owner,
    as_server,
    balance,
    call,
    ledger,
)
from server.tests.island_sql.test_wall_chain_build_sql import (  # noqa: E402
    EPOCH,
    ITEMS,
    OTHER,
    OWNER,
    PAYER,
    UID,
    build,
    ready,
    receipt,
    rows,
)


def intent_for(items):
    return {
        "placements": [
            {"spot": x["spot"], "x": x["x_half"] / 2, "z": x["z_half"] / 2} for x in items
        ],
        "quotedTotal": sum(x["price"] for x in items),
        "islandEpoch": str(EPOCH),
    }


@contextmanager
def committed_game(scratch_server):
    """Only pressure cases commit stand-ins; always remove their three auth identities."""
    uri = scratch_server.get_uri()
    try:
        with psycopg.connect(uri) as db:
            ready(db, member=True)
        yield uri
    finally:
        with psycopg.connect(uri, autocommit=True) as clean:
            clean.execute("set statement_timeout='5s'")
            clean.execute("delete from auth.users where id=any(%s)", ([OWNER, PAYER, OTHER],))


def blocked_race(uri, jobs, *, wallet=False):
    """Hold the real row, observe each backend blocked, release, and surface worker failures."""
    results = queue.Queue()
    pids, failures = {}, {}
    started = [threading.Event() for _ in jobs]

    def worker(index, arguments):
        try:
            with psycopg.connect(uri) as db:
                as_server(db)
                db.execute("set local statement_timeout='10s'")
                pids[index] = call(db, "select pg_backend_pid()")
                started[index].set()
                answer = build(db, seen=[], **arguments)
            results.put(answer)  # the context has committed before the result is observed
        except Exception as error:
            failures[index] = error
            started[index].set()

    threads = [threading.Thread(target=worker, args=(i, args)) for i, args in enumerate(jobs)]
    try:
        with psycopg.connect(uri) as blocker:
            lock = (
                "select 1 from public.wallets where player_id=%s for update"
                if wallet
                else "select 1 from public.islands where player_id=%s for update"
            )
            blocker.execute(lock, (OWNER,))
            try:
                for thread in threads:
                    thread.start()
                assert all(event.wait(5) for event in started), "A worker never started."
                assert not failures, failures
                with psycopg.connect(uri, autocommit=True) as probe:
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        waiting = call(
                            probe,
                            "select count(*) from pg_stat_activity "
                            "where pid=any(%s) and wait_event_type='Lock'",
                            list(pids.values()),
                        )
                        if waiting == len(jobs):
                            break
                        time.sleep(0.01)
                    else:
                        pytest.fail("Both real transaction backends must wait on the held row.")
            finally:
                blocker.rollback()  # release on an assertion failure as well as on success
    finally:
        for thread in threads:
            if thread.ident is not None:
                thread.join(timeout=10)
        if any(thread.is_alive() for thread in threads):
            with psycopg.connect(uri, autocommit=True) as cancel:
                for pid in pids.values():
                    call(cancel, "select pg_cancel_backend(%s)", pid)
            for thread in threads:
                if thread.ident is not None:
                    thread.join(timeout=3)
        assert not any(thread.is_alive() for thread in threads), "A worker leaked a connection."
    assert not failures, failures
    return [results.get_nowait() for _ in jobs]


def stored_run(db):
    return db.execute(
        "select plot,ref,recovery_instance_id from public.islet_buildings "
        "where player_id=%s order by plot",
        (OWNER,),
    ).fetchall()


def test_simultaneous_same_uid_waits_then_commits_one_run(scratch_server):
    with committed_game(scratch_server) as uri:
        replies = blocked_race(uri, [{"uid": UID}, {"uid": UID}], wallet=True)
        assert all(x["status"] == "done" for x in replies)
        assert sorted(x["receipt"]["repeat"] for x in replies) == [False, True]
        with psycopg.connect(uri) as check:
            assert balance(check, OWNER) == 80 and len(rows(check)) == 2
            assert len(ledger(check, OWNER, "building_purchase")) == 2
            assert len(stored_run(check)) == 2
            assert (
                call(
                    check,
                    "select count(*) from public.island_wall_build_receipts where payer=%s",
                    OWNER,
                )
                == 1
            )
            assert (
                call(
                    check,
                    "select count(*) from public.building_payments where island_owner=%s",
                    OWNER,
                )
                == 2
            )


def test_two_payers_competing_for_the_same_initial_layout_never_partially_commit(scratch_server):
    other_items = [{**x, "spot": f"wall_{15 + n}"} for n, x in enumerate(ITEMS)]
    jobs = [
        {"actor": OWNER, "uid": "pressure-owner-001"},
        {
            "actor": PAYER,
            "uid": "pressure-member-001",
            "items": other_items,
            "intent": intent_for(other_items),
        },
    ]
    with committed_game(scratch_server) as uri:
        replies = blocked_race(uri, jobs)
        assert sorted(x["status"] for x in replies) == ["done", "refused"]
        assert next(x for x in replies if x["status"] == "refused")["reason"] == "busy"
        with psycopg.connect(uri) as check:
            assert balance(check, OWNER) + balance(check, PAYER) == 180
            assert {x[0] for x in stored_run(check)} in (
                {"wall_13", "wall_14"},
                {"wall_15", "wall_16"},
            )
            assert len(rows(check)) == 2
            assert (
                call(
                    check,
                    "select count(*) from public.island_wall_build_receipts where island_owner=%s",
                    OWNER,
                )
                == 1
            )
            assert (
                call(
                    check,
                    "select count(*) from public.wallet_transactions "
                    "where player_id=any(%s) and reason='building_purchase'",
                    [OWNER, PAYER],
                )
                == 2
            )


def test_maximum_uid_last_piece_and_full_batch_keep_distinct_refs(database):
    ready(database)
    as_owner(database)
    call(
        database,
        "select public.apply_wallet_transaction(%s,1000,'admin_adjust','pressure-budget')",
        OWNER,
    )
    as_server(database)
    items = [
        {
            "spot": f"wall_{97 + n}",
            "x_half": -28 + 4 * (n % 8),
            "z_half": -24 + 4 * (n // 8),
            "price": 10,
        }
        for n in range(32)
    ]
    before = balance(database, OWNER)
    answer = build(database, uid="x" * 64, items=items, intent=intent_for(items), seen=[])
    assert answer["status"] == "done" and balance(database, OWNER) == before - 320
    records = stored_run(database)
    assert len(records) == len({x[1] for x in records}) == len({x[2] for x in records}) == 32
    assert next(x[1] for x in records if x[0] == "wall_128") == "island:" + "x" * 64 + ":wall_128"
    assert all(len(x[1]) <= 120 for x in records)
    assert (
        call(database, "select count(*) from public.building_payments where island_owner=%s", OWNER)
        == 32
    )


@pytest.mark.parametrize("boundary", ["uid", "batch"])
def test_beyond_uid_or_batch_bound_never_spends(database, boundary):
    ready(database)
    items = (
        [{"spot": f"wall_{13 + n}", "x_half": 0, "z_half": n, "price": 10} for n in range(33)]
        if boundary == "batch"
        else ITEMS
    )
    with (
        pytest.raises(psycopg.errors.RaiseException, match="bad_wall_build"),
        database.transaction(),
    ):
        build(
            database,
            uid="x" * 65 if boundary == "uid" else UID,
            items=items,
            intent=intent_for(items),
            seen=[],
        )
    assert balance(database, OWNER) == 100 and rows(database) == []
    assert ledger(database, OWNER, "building_purchase") == []


def test_authorized_other_island_cannot_reuse_a_paid_uid(database):
    ready(database, member=True)
    build(database, actor=PAYER)
    assert receipt(database, actor=PAYER, owner=PAYER) == {
        "status": "refused",
        "reason": "action_uid_conflict",
    }
    assert balance(database, PAYER) == 80
    assert (
        call(database, "select count(*) from public.islet_buildings where player_id=%s", PAYER) == 0
    )


@pytest.mark.parametrize("fail", [False, True])
def test_prior_authority_is_restored_after_success_or_second_piece_failure(database, fail):
    ready(database)
    prior = json.dumps(
        {
            "owner": str(OTHER),
            "payer": str(OTHER),
            "actionUid": "previous-context-001",
            "plots": ["wall_128"],
        }
    )
    call(database, "select set_config('app.positioned_wall_build',%s,true)", prior)
    if fail:
        as_owner(database)
        database.execute(
            "create function pg_temp.pressure_fail() returns trigger language plpgsql as $$ "
            "begin if new.plot='wall_14' then raise check_violation "
            "using message='pressure_second_piece'; end if; return new; end $$"
        )
        database.execute(
            "create trigger pressure_failure before insert on public.islet_buildings "
            "for each row execute function pg_temp.pressure_fail()"
        )
        as_server(database)
        with pytest.raises(psycopg.errors.CheckViolation, match="pressure_second_piece"):
            with database.transaction():
                build(database)
        assert balance(database, OWNER) == 100 and rows(database) == []
        assert ledger(database, OWNER, "building_purchase") == []
        assert receipt(database)["status"] == "missing"
    else:
        assert build(database)["status"] == "done"
    assert call(database, "select current_setting('app.positioned_wall_build',true)") == prior
