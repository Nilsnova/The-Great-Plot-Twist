"""Free-revival SQL must consume the actual canonical source, never fabricated combat proofs."""

from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    as_owner,
    as_server,
    keys,
    ready,
    rpc,
)
from server.tests.island_sql.test_tower_defense_sql import start  # noqa: E402

CONTEXT = "public.shared_session_revival_context_locked(uuid,uuid,uuid,uuid,numeric)"
COMPLETE = ("public.island_shared_captain_revive(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,"
            "uuid,numeric)")


def test_missing_actual_canonical_source_cannot_claim_a_root_or_touch_money(database):
    owner, actor, _, initial = ready(database, coins=0)
    account, epoch = keys(initial)
    as_owner(database)
    # Remove an actual source only inside this scratch transaction if already integrated.
    if database.execute("select to_regprocedure(%s)", (CONTEXT,)).fetchone()[0]:
        database.execute(
            "alter function " + CONTEXT + " rename to unavailable_revival_context_fixture"
        )
    before = database.execute(
        "select count(*) from public.island_treasury_transactions"
    ).fetchone()[0]
    as_server(database)
    answer = rpc(database, "island_shared_captain_revive", actor, owner, account, epoch,
                 "free-revival-01", uuid4(), uuid4(), uuid4(), uuid4(), uuid4(), 0)
    assert answer == {"status": "refused", "reason": "path_unavailable"}
    as_owner(database)
    assert database.execute(
        "select count(*) from public.island_economy_operations "
        "where actor_id=%s and action_uid='free-revival-01'", (actor,),
    ).fetchone()[0] == 0
    assert database.execute(
        "select count(*) from public.island_treasury_transactions"
    ).fetchone()[0] == before


def test_only_completion_and_owned_history_are_service_capabilities(database):
    private = (
        "public.shared_revival_hold_start_locked(uuid,uuid,uuid,uuid,uuid,numeric,text,bigint,"
        "timestamp with time zone)",
        "public.shared_revival_hold_cancel_locked(uuid,uuid,uuid,numeric,text,bigint,"
        "timestamp with time zone)",
        "public.shared_revival_hold_context_locked(uuid,uuid,uuid,uuid,uuid,uuid,numeric,"
        "timestamp with time zone)",
    )
    history = "public.island_shared_revival_replay(uuid,uuid,uuid,uuid,text,jsonb)"
    for signature in (*private, COMPLETE, history):
        actual = database.execute(
            "select has_function_privilege('anon',%s,'execute'), "
            "has_function_privilege('authenticated',%s,'execute'), "
            "has_function_privilege('service_role',%s,'execute')",
            (signature, signature, signature),
        ).fetchone()
        assert actual == (False, False, signature in (COMPLETE, history))
    for table in ("island_shared_revival_holds", "island_shared_revival_receipts"):
        assert database.execute(
            "select relrowsecurity from pg_class where oid=%s::regclass", ("public." + table,),
        ).fetchone() == (True,)
        for role in ("anon", "authenticated", "service_role"):
            assert database.execute(
                "select has_table_privilege(%s,%s,'SELECT'),has_table_privilege(%s,%s,'INSERT'),"
                "has_table_privilege(%s,%s,'UPDATE'),has_table_privilege(%s,%s,'DELETE')",
                (role, "public." + table) * 4,
            ).fetchone() == (False, False, False, False)


def test_foreign_wave_selector_cannot_acquire_an_unrelated_wave_row_lock(scratch_server):
    with psycopg.connect(scratch_server.get_uri()) as setup:
        owner, actor, _, initial = ready(setup, coins=0)
        foreign, _, _, _ = ready(setup, admitted=False)
        wave = start(setup, foreign, "foreign-bell-01", owner=foreign)["waveId"]
        account, epoch = keys(initial)
        setup.commit()
    with psycopg.connect(scratch_server.get_uri()) as blocker:
        as_owner(blocker)
        blocker.execute("select 1 from public.wave_runs where id=%s for update", (wave,))
        with psycopg.connect(scratch_server.get_uri()) as request:
            request.execute("set lock_timeout='250ms'")
            as_server(request)
            answer = rpc(request, "island_shared_captain_revive", actor, owner, account, epoch,
                         "foreign-revive-01", wave, uuid4(), uuid4(), uuid4(), uuid4(), 1)
            assert answer == {"status": "refused", "reason": "wave_over"}
            as_owner(request)
            assert request.execute(
                "select count(*) from public.island_economy_operations where actor_id=%s "
                "and action_uid='foreign-revive-01'", (actor,),
            ).fetchone()[0] == 0


def test_foreign_account_selector_is_rejected_without_locking_that_accounts_row(scratch_server):
    with psycopg.connect(scratch_server.get_uri()) as setup:
        owner, actor, _, _ = ready(setup, coins=0)
        _, _, _, foreign = ready(setup)
        account, epoch = keys(foreign)
        setup.commit()
    with psycopg.connect(scratch_server.get_uri()) as blocker:
        as_owner(blocker)
        blocker.execute(
            "select 1 from public.island_economy_accounts where id=%s for update", (account,),
        )
        with psycopg.connect(scratch_server.get_uri()) as request:
            request.execute("set lock_timeout='250ms'")
            as_server(request)
            answer = rpc(request, "island_shared_captain_revive", actor, owner, account, epoch,
                         "foreign-account-01", uuid4(), uuid4(), uuid4(), uuid4(), uuid4(), 1)
            assert answer == {"status": "refused", "reason": "account_missing"}
