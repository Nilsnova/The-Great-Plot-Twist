"""Real arsenal read/legacy fences; session provider is explicitly injected in scratch SQL."""

from concurrent.futures import ThreadPoolExecutor
from time import monotonic, sleep
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.economy_test_authority import (  # noqa: E402
    authority_outage,
    configure_test_authority,
    install_test_authority,
)
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    as_owner,
    as_server,
    balance,
    keys,
    ready,
    rpc,
)
from server.tests.island_sql.test_shared_arsenal_sql import change  # noqa: E402


def setup(database, *, shared=True):
    owner, member, outsider, initial = ready(database, admitted=shared)
    as_owner(database)
    install_test_authority(database)
    for actor in (owner, member, outsider):
        configure_test_authority(database, actor, owner)
    return owner, member, outsider, initial


def test_shared_view_has_exact_money_copy_tenure_and_read_never_mutates(database):
    owner, member, _, initial = setup(database)
    first = change(database, member, initial)
    as_server(database)
    view = rpc(database, "island_shared_arsenal_read", member, owner)
    again = rpc(database, "island_shared_arsenal_read", member, owner)
    assert view == again
    assert view["status"] == "done" and view["total"] == 1 and view["stored"] == 0
    assert "coins" not in view
    assert view["economy"]["treasury"]["availableCoins"] == "140"
    assert int(view["arsenalRevision"]) > 0
    assert view["copies"][0]["holderGeneration"] == "1"
    assert view["mine"] == first["receipt"]["result"]["copyId"]
    assert view["carried"] == "pistols"


def test_free_copy_changes_advance_arsenal_revision_without_treasury_revision(database):
    owner, member, _, initial = setup(database)
    first = change(database, member, initial)
    before = rpc(database, "island_shared_arsenal_read", member, owner)
    copy = first["receipt"]["result"]["copyId"]
    change(database, member, initial, kind="return", uid="return001", copy=copy, generation=1)
    after = rpc(database, "island_shared_arsenal_read", member, owner)
    assert int(after["arsenalRevision"]) > int(before["arsenalRevision"])
    assert after["economy"]["revision"] == before["economy"]["revision"]
    assert after["mine"] is None and after["carried"] == "musket"


def test_shared_view_refuses_departed_actor_and_unbound_stock(database):
    owner, member, outsider, initial = setup(database)
    assert rpc(database, "island_shared_arsenal_read", outsider, owner)["reason"] == "not_member"
    as_owner(database)
    database.execute(
        "insert into public.arsenal_copies(island_owner,copy_no,weapon,source) "
        "values(%s,1,'pistols','converted')",
        (owner,),
    )
    assert (
        rpc(database, "island_shared_arsenal_read", member, owner)["reason"] == "path_unavailable"
    )


def test_shared_view_fails_closed_without_canonical_authority(database):
    owner, member, _, _ = setup(database)
    with authority_outage(database):
        as_server(database)
        assert rpc(database, "island_shared_arsenal_read", member, owner) == {
            "status": "refused",
            "reason": "path_unavailable",
        }


@pytest.mark.parametrize("kind", ["state", "buy", "take", "return"])
def test_old_arsenal_entrypoints_refuse_shared_before_wallet_or_copy_changes(database, kind):
    owner, member, _, initial = setup(database)
    wallet = balance(database, member)
    arguments = {
        "state": (member, owner),
        "buy": (member, owner, "pistols", "legacy001", 60, 0),
        "take": (member, owner, uuid4(), "legacy001"),
        "return": (member, owner, "legacy001"),
    }
    as_server(database)
    result = rpc(database, "arsenal_" + kind, *arguments[kind])
    assert result == {"status": "refused", "reason": "economy_context_required"}
    assert balance(database, member) == wallet
    assert rpc(database, "island_economy_context", owner)["economy"] == initial["currentEconomy"]


def test_legacy_request_refuses_shared_target_before_initialization_or_grant(database):
    owner, member, _, _ = setup(database)
    as_owner(database)
    database.execute("delete from public.wallet_transactions where player_id=%s", (member,))
    database.execute("update public.wallets set balance=0 where player_id=%s", (member,))
    result = rpc(
        database,
        "island_arsenal_legacy_request",
        member,
        owner,
        "state",
        "legacy001",
        None,
        None,
        100,
        0,
        0,
        "ABCDE",
    )
    assert result == {"status": "refused", "reason": "economy_context_required"}
    assert balance(database, member) == 0
    assert (
        database.execute(
            "select count(*) from public.wallet_transactions where player_id=%s", (member,)
        ).fetchone()[0]
        == 0
    )


def test_combined_legacy_request_preserves_real_legacy_purchase(database):
    owner, member, _, _ = setup(database, shared=False)
    rpc(database, "island_open", member, "FGHJK", 100)
    as_owner(database)
    database.execute("update public.islands set won_wave_best=10 where player_id=%s", (member,))
    as_server(database)
    result = rpc(
        database,
        "island_arsenal_legacy_request",
        member,
        owner,
        "buy",
        "legacy001",
        "pistols",
        None,
        100,
        60,
        2,
        "ABCDE",
    )
    assert result["status"] == "done" and result["balance"] == 40
    assert result["arsenal"]["mine"] is not None


def test_wire_request_replays_original_retired_context_without_current_authority(database):
    owner, member, _, initial = setup(database)
    first = rpc(
        database,
        "island_shared_arsenal_request",
        member,
        owner,
        keys(initial)[1],
        "replay001",
        "buy",
        "pistols",
        None,
        None,
        60,
        0,
    )
    as_owner(database)
    database.execute(
        "update public.island_members set left_at=clock_timestamp() "
        "where island_owner=%s and player_id=%s",
        (owner, member),
    )
    database.execute(
        "update public.island_economy_accounts set state='retired', "
        "retired_at=clock_timestamp() where id=%s",
        (keys(initial)[0],),
    )
    with authority_outage(database):
        replay = rpc(
            database,
            "island_shared_arsenal_request",
            member,
            owner,
            keys(initial)[1],
            "replay001",
            "buy",
            "pistols",
            None,
            None,
            None,
            None,
        )
        assert replay["repeat"] and replay["receipt"] == first["receipt"]
        assert replay["currentEconomy"] is None


def test_actor_shared_island_is_not_initialized_to_view_a_legacy_target(database):
    owner, member, _, _ = setup(database, shared=False)
    rpc(database, "island_open", member, "FGHJK", 100)
    rpc(database, "island_treasury_admit", member, member, "admit0001", 100)
    as_owner(database)
    database.execute("delete from public.wallet_transactions where player_id=%s", (member,))
    database.execute("update public.wallets set balance=0 where player_id=%s", (member,))
    result = rpc(
        database,
        "island_arsenal_legacy_request",
        member,
        owner,
        "state",
        None,
        None,
        None,
        100,
        0,
        0,
        "ABCDE",
    )
    assert result["status"] in ("done", "ok")
    assert balance(database, member) == 0


def test_conversion_batch_freezes_candidates_before_waiting_for_scope_guards(
    database, scratch_server
):
    first, _, _, _ = ready(database, admitted=False)
    later, _, _, _ = ready(database, admitted=False)
    as_owner(database)
    database.execute(
        "update public.islands set weapons_owned=array['musket','pistols'] where player_id=%s",
        (first,),
    )
    database.commit()

    with (
        psycopg.connect(scratch_server.get_uri()) as first_guard,
        psycopg.connect(scratch_server.get_uri()) as later_guard,
        psycopg.connect(scratch_server.get_uri()) as batch,
        ThreadPoolExecutor(max_workers=1) as executor,
    ):
        rpc(first_guard, "island_treasury_lock_scope", first)
        batch.execute("set statement_timeout='5s'")
        as_server(batch)
        pid = batch.execute("select pg_backend_pid()").fetchone()[0]
        pending = executor.submit(rpc, batch, "arsenal_convert_personal_weapons")
        try:
            deadline = monotonic() + 3
            while not database.execute(
                "select exists(select 1 from pg_locks "
                "where pid=%s and locktype='advisory' and not granted)",
                (pid,),
            ).fetchone()[0]:
                assert not pending.done(), "The batch must wait on its captured first owner."
                assert monotonic() < deadline, "The batch did not reach its scope guard."
                sleep(0.01)

            # Eligibility changes after the captured candidate set. Admission owns
            # the new candidate's class-zero guard while the first batch resumes.
            database.execute(
                "update public.islands set weapons_owned=array['musket','pistols'] "
                "where player_id=%s",
                (later,),
            )
            database.commit()
            rpc(later_guard, "island_treasury_lock_scope", later)
            first_guard.commit()
            assert pending.result(timeout=6) == 1
            batch.commit()
            admitted = rpc(later_guard, "island_treasury_admit", later, later, "admit0001", 100)
            assert admitted["status"] == "done"
            later_guard.commit()
        finally:
            first_guard.rollback()
            later_guard.rollback()
    assert database.execute(
        "select weapons_owned from public.islands where player_id=%s", (later,)
    ).fetchone()[0] == ["musket", "pistols"]
