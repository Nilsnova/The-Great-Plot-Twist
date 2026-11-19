"""Existing join/leave compose with persisted sessions and shared stock atomically.

Admission, authority, controllers and arsenal transactions are production hooks.
Local Auth identities are seeded fixtures, not provider-issued sessions.
"""

from uuid import UUID, uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, ready, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import as_owner, as_server  # noqa: E402
from server.tests.island_sql.test_shared_arsenal_sql import change  # noqa: E402
from server.tests.island_sql.test_shared_lifecycle_transactions_sql import prepare  # noqa: E402
from server.tests.island_sql.test_shared_session_control_sql import attach  # noqa: E402


def topic(database, owner):
    as_owner(database)
    return database.execute(
        "select topic_nonce,topic_generation from public.shared_session_settings "
        "where island_owner=%s", (owner,)
    ).fetchone()


def leave(database, actor, owner):
    as_server(database)
    return rpc(database, "game_leave", actor, owner)


def join(database, actor, owner):
    as_server(database)
    return rpc(database, "game_join", actor, owner, 10)


def buy(database, actor, treasury):
    as_server(database)
    result = change(database, actor, treasury)
    assert result["status"] == "done", result
    return result["receipt"]["result"]["copyId"]


@pytest.mark.parametrize("controller", [False, True])
def test_actual_leave_returns_idle_stock_without_requiring_controller(database, controller):
    owner, actor, _, treasury, _ = prepare(database)
    copy = buy(database, actor, treasury)
    if controller:
        assert attach(database, actor, owner, treasury, uuid4())["status"] == "done"
    before = topic(database, owner)
    assert leave(database, actor, owner) == {"status": "left", "repeat": False}
    after = topic(database, owner)
    assert after[0] != before[0] and after[1] == before[1] + 1
    assert database.execute(
        "select holder,holder_generation,pending_return_wave_id from public.arsenal_copies "
        "where id=%s", (copy,)
    ).fetchone() == (None, 2, None)
    if controller:
        assert database.execute(
            "select island_owner,run_epoch,released_at is not null from "
            "public.shared_session_controls where player_id=%s", (actor,)
        ).fetchone() == (None, None, True)
    assert leave(database, actor, owner) == {"status": "left", "repeat": True}
    assert topic(database, owner) == after


def test_join_rejoin_rotates_once_but_redundant_active_join_does_not(database):
    owner, actor, outsider, _, _ = prepare(database)
    original = topic(database, owner)
    assert join(database, actor, owner)["repeat"] is True
    assert topic(database, owner) == original
    assert join(database, outsider, owner)["repeat"] is False
    added = topic(database, owner)
    assert added[1] == original[1] + 1
    assert leave(database, actor, owner)["repeat"] is False
    left = topic(database, owner)
    assert join(database, actor, owner)["repeat"] is False
    rejoined = topic(database, owner)
    assert rejoined[0] != left[0] and rejoined[1] == left[1] + 1
    assert join(database, actor, owner)["repeat"] is True
    assert topic(database, owner) == rejoined


def test_refused_host_leave_preserves_controller_and_topic(database):
    owner, _, _, treasury, _ = prepare(database)
    session = uuid4()
    before_session = attach(database, owner, owner, treasury, session)
    assert before_session["status"] == "done"
    before = topic(database, owner)
    assert leave(database, owner, owner) == {"status": "refused", "reason": "host_cannot_leave"}
    assert topic(database, owner) == before
    assert database.execute(
        "select island_owner,session_id,released_at from public.shared_session_controls "
        "where player_id=%s", (owner,)
    ).fetchone() == (owner, session, None)


def test_leaving_one_membership_preserves_controller_on_another_island(database):
    target, actor, _, treasury, _ = prepare(database)
    copy = buy(database, actor, treasury)
    other, _, _, other_treasury = ready(database)
    assert join(database, actor, other)["status"] == "joined"
    session = uuid4()
    assert attach(database, actor, other, other_treasury, session)["status"] == "done"
    other_topic = topic(database, other)
    assert leave(database, actor, target)["status"] == "left"
    as_owner(database)
    assert database.execute(
        "select island_owner,run_epoch,session_id,released_at from "
        "public.shared_session_controls where player_id=%s", (actor,)
    ).fetchone() == (other, UUID(keys(other_treasury)[1]), session, None)
    assert topic(database, other) == other_topic
    assert database.execute(
        "select holder,holder_generation from public.arsenal_copies where id=%s", (copy,)
    ).fetchone() == (None, 2)


def test_copy_disposition_failure_rolls_back_membership_controller_and_topic(database):
    owner, actor, _, treasury, _ = prepare(database)
    buy(database, actor, treasury)
    session = uuid4()
    assert attach(database, actor, owner, treasury, session)["status"] == "done"
    before = topic(database, owner)
    database.execute("""
      create function public.membership_test_fail_return() returns trigger language plpgsql as $$
      begin raise exception 'membership_test_failure'; end; $$;
      create trigger membership_test_fail_return before update of holder on public.arsenal_copies
        for each row execute function public.membership_test_fail_return();
    """)
    with pytest.raises(psycopg.errors.RaiseException, match="membership_test_failure"):
        with database.transaction():
            leave(database, actor, owner)
    assert topic(database, owner) == before
    assert database.execute(
        "select left_at from public.island_members where island_owner=%s and player_id=%s",
        (owner, actor),
    ).fetchone() == (None,)
    assert database.execute(
        "select island_owner,released_at from public.shared_session_controls where player_id=%s",
        (actor,),
    ).fetchone() == (owner, None)


def test_deleted_actor_cannot_join_or_leave_through_legacy_service_entry(database):
    owner, _, actor, _ = ready(database, admitted=False)
    as_owner(database)
    database.execute("delete from auth.users where id=%s", (actor,))
    assert join(database, actor, owner)["status"] == "refused"
    assert leave(database, actor, owner)["status"] == "refused"


def test_original_membership_aliases_are_private_and_public_signatures_preserved(database):
    for name, arguments in (("join", "uuid,uuid,integer"), ("leave", "uuid,uuid")):
        alias = f"public.island_lifecycle_legacy_game_{name}({arguments})"
        signature = f"public.game_{name}({arguments})"
        assert database.execute("select to_regprocedure(%s) is not null", (alias,)).fetchone() == (
            True,
        )
        for role in ("anon", "authenticated", "service_role"):
            assert database.execute(
                "select has_function_privilege(%s,%s,'execute')", (role, alias)
            ).fetchone() == (False,)
            assert database.execute(
                "select has_function_privilege(%s,%s,'execute')", (role, signature)
            ).fetchone() == (role == "service_role",)
