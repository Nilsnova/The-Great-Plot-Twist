"""Personal edits share paid-action root identities and roll back refused claims.

Uses disposable PostgreSQL; no live Captain adoption or island route is enabled.
"""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest

psycopg = pytest.importorskip("psycopg")
from server.tests.island_sql.test_economy_operations_sql import (  # noqa: E402
    apply_intent,
    operation_count,
)
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import as_owner, as_server, keys, rpc  # noqa: E402
from server.tests.island_sql.test_personal_captain_sql import (  # noqa: E402
    attach,
    edit,
    initialized,
    private,
    view,
)


def account_money(connection, account):
    return connection.execute(
        "select balance_coins,committed_coins from public.island_economy_accounts where id=%s",
        (keys(account)[0],),
    ).fetchone()


@pytest.mark.parametrize("personal_first", [True, False])
def test_real_personal_and_paid_actions_cannot_reuse_one_root(database, personal_first):
    player, _, _, account, _ = initialized(database)
    if personal_first:
        first = edit(database, player, "respec", uid="cross001")
        second = apply_intent(database, player, account, "cross001", "construction:build",
                              {"spot": "wall_1"}, price=10)
    else:
        first = apply_intent(database, player, account, "cross001", "construction:build",
                             {"spot": "wall_1"}, price=10)
        second = edit(database, player, "respec", uid="cross001")
    assert first["status"] == "done"
    assert second == {"status": "refused", "reason": "action_conflict"}
    as_owner(database)
    assert operation_count(database, player, "cross001") == 1
    assert account_money(database, account) == ((200, 0) if personal_first else (190, 0))


@pytest.mark.parametrize("case,reason", [
    ("revision", "captain_revision_mismatch"), ("assigned", "captain_assigned"),
    ("bound", "engineer_bound"), ("known", "known"),
    ("bad_skill", "bad_skill"), ("role_known", "role_known"),
])
def test_business_refusal_removes_its_new_root(database, case, reason):
    player, _, _, account, initial = initialized(database)
    action, value, expected = "respec", None, initial["captain"]["revision"]
    if case == "revision":
        expected = str(int(expected) + 1)
    elif case == "assigned":
        attach(database, player)
        expected = view(database, player)["captain"]["revision"]
    elif case == "bound":
        private(database, "personal_captain_bind_engineer_locked", player)
        expected = view(database, player)["captain"]["revision"]
        action, value = "role", "medic"
    elif case in {"known", "bad_skill"}:
        action, value = "learn", "steady_aim" if case == "known" else "unknown_skill"
    elif case == "role_known":
        action, value = "role", "medic"
    before = view(database, player)
    assert edit(database, player, action, value, uid="refuse01", expected=expected) == {
        "status": "refused", "reason": reason,
    }
    assert view(database, player) == before
    as_owner(database)
    assert operation_count(database, player, "refuse01") == 0
    count = database.execute(
        "select count(*) from public.personal_captain_operations "
        "where player_id=%s and action_uid='refuse01'", (player,),
    ).fetchone()[0]
    assert count == 0
    assert apply_intent(database, player, account, "refuse01", "construction:build",
                        {"spot": "wall_1"}, price=10)["status"] == "done"


def test_replay_precedes_revision_and_links_the_exact_personal_operation(database):
    player, _, _, _, initial = initialized(database)
    revision = initial["captain"]["revision"]
    first = edit(database, player, "respec", uid="repeat01", expected=revision)
    edit(database, player, "role", "medic", uid="later001")
    before = view(database, player)
    repeated = edit(database, player, "respec", uid="repeat01", expected=revision)
    assert repeated["repeat"] is True and repeated["receipt"] == first["receipt"]
    assert repeated["profile"] == before and view(database, player) == before
    as_owner(database)
    row = database.execute(
        "select o.account_id,o.run_epoch,o.domain_action,p.operation_id=o.id "
        "from public.island_economy_operations o join public.personal_captain_operations p "
        "on p.player_id=o.actor_id and p.action_uid=o.action_uid "
        "where o.actor_id=%s and o.action_uid='repeat01'", (player,),
    ).fetchone()
    assert row == (None, None, "captain:respec", True)


def test_unregistered_personal_history_requires_mapping_without_leaving_a_claim(database):
    player, _, _, _, initial = initialized(database)
    private(database, "personal_captain_change", player, "history1", "respec", None)
    before = view(database, player)
    assert edit(database, player, "respec", uid="history1",
                expected=initial["captain"]["revision"])["reason"] == "captain_conversion_required"
    assert view(database, player) == before
    as_owner(database)
    assert operation_count(database, player, "history1") == 0


def test_concurrent_personal_and_paid_root_only_finishes_one_domain(database, scratch_server):
    player, _, _, account, initial = initialized(database)
    database.commit()
    barrier = Barrier(2)

    def execute(personal):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            barrier.wait(timeout=10)
            if personal:
                return edit(connection, player, "respec", uid="racing01",
                            expected=initial["captain"]["revision"])
            return apply_intent(connection, player, account, "racing01", "construction:build",
                                {"spot": "wall_1"}, price=10)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(execute, [True, False]))
    assert [result["status"] for result in results].count("done") == 1
    assert {"status": "refused", "reason": "action_conflict"} in results
    as_owner(database)
    assert operation_count(database, player, "racing01") == 1
    personal_won = results[0]["status"] == "done"
    assert account_money(database, account) == ((200, 0) if personal_won else (190, 0))


@pytest.mark.parametrize("uid", ["fx_reserved_charge", "sys_reserved_loot"])
def test_reserved_financial_prefix_is_never_a_personal_root(database, uid):
    player, _, _, _, initial = initialized(database)
    assert edit(database, player, "respec", uid=uid)["reason"] == "invalid_change"
    assert view(database, player) == initial
    as_owner(database)
    assert operation_count(database, player, uid) == 0


def test_missing_adoption_rolls_back_the_new_personal_claim(database):
    _, member, _, _, _ = initialized(database)
    as_server(database)
    assert rpc(database, "personal_captain_change", member, "missing1", "respec",
               None, 0)["reason"] == "captain_context_required"
    as_owner(database)
    assert operation_count(database, member, "missing1") == 0


def test_receipt_failure_rolls_back_root_and_personal_effect_before_retry(database):
    player, _, _, _, initial = initialized(database)
    as_owner(database)
    database.execute("create function public.reject_test_personal_receipt() returns trigger "
                     "language plpgsql as $$ begin raise exception 'receipt_unavailable'; end; $$")
    database.execute("create trigger reject_test_personal_receipt before insert on "
                     "public.personal_captain_operations for each row "
                     "execute function public.reject_test_personal_receipt()")
    with pytest.raises(psycopg.Error, match="receipt_unavailable"), database.transaction():
        edit(database, player, "respec", uid="failure1")
    assert view(database, player) == initial
    as_owner(database)
    assert operation_count(database, player, "failure1") == 0
    database.execute("drop trigger reject_test_personal_receipt "
                     "on public.personal_captain_operations")
    assert edit(database, player, "respec", uid="failure1")["status"] == "done"
