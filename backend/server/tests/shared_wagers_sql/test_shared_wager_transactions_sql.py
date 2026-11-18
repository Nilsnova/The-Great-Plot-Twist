"""Real domain transactions with explicitly simulated authority, never runtime acceptance."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from threading import Barrier
from uuid import uuid4

import pytest

from server.island.wager_store import read_reply

psycopg = pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.economy_test_authority import (  # noqa: E402
    configure_test_authority,
    install_test_authority,
)
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    as_owner,
    keys,
    money,
    reconciles,
    rpc,
    spend,
)
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    ready as treasury_ready,
)


@pytest.fixture(autouse=True)
def fixture_authority(database):
    """TEST-ONLY six-field authority. Production permission/assignment RPC is not implemented."""
    as_owner(database)
    install_test_authority(database)


def ready(connection, coins=200):
    result = treasury_ready(connection, coins)
    as_owner(connection)
    # Explicitly unlocked test island; no personal record supplies shared product access.
    connection.execute("update public.islands set wave_best=7 where player_id=%s", (result[0],))
    for actor in result[:3]:
        configure_test_authority(connection, actor, result[0])
    return result


def evidence(connection, *, price="100", **changes):
    moment = connection.execute("select clock_timestamp()").fetchone()[0]
    return {"asset": "harbor-trust", "price": price, "source": "live",
            "fetchedAt": moment.isoformat(),
            "quotedAt": moment.isoformat()} | changes


def domain_view(reply):
    """Test-only aliases for domain facts; the wire receipt still uses the exact common shape."""
    if reply["status"] != "done":
        return reply
    read_reply(reply)
    result = reply["receipt"]["result"]
    return reply | result | {"treasury": {"receipt": result["financialReceipt"],
                                         "currentEconomy": reply["currentEconomy"]}}


def open_wager(connection, actor, owner, initial, stake=50, uid="wager001", *,
               product="market_call", event="harbor-trust", selection="up", supplied=None):
    return domain_view(rpc(connection, "island_wager_open", actor, owner, keys(initial)[1], uid,
               product, event, selection, stake,
               Jsonb(supplied if supplied is not None else evidence(connection, asset=event))))


def settlement(connection, opened, *, price="101", supplied=None):
    return domain_view(rpc(connection, "island_wager_settle", opened["wager"]["id"],
               Jsonb(supplied if supplied is not None else evidence(connection, price=price))))


def make_due(connection, opened):
    """Move only the disposable database clock via stored time fixture before immutable insert."""
    as_owner(connection)
    connection.execute("alter table public.island_wagers disable trigger island_wagers_immutable")
    connection.execute(
        "update public.island_wagers set opened_at=clock_timestamp()-interval '6 minutes',"
        "settle_at=clock_timestamp()-interval '1 second' where id=%s", (opened["wager"]["id"],)
    )
    connection.execute("alter table public.island_wagers enable trigger island_wagers_immutable")


def counts(connection, actor, uid):
    as_owner(connection)
    return connection.execute(
        "select (select count(*) from public.island_economy_operations "
        "where actor_id=%s and action_uid=%s),(select count(*) from public.island_wagers "
        "where operation_id in(select id from public.island_economy_operations "
        "where actor_id=%s and action_uid=%s))", (actor, uid, actor, uid)
    ).fetchone()


def test_opening_persists_one_product_root_and_financial_child(database):
    owner, actor, _, initial = ready(database, 100)
    database.execute("set local role service_role")
    first = open_wager(database, actor, owner, initial, 100)
    assert first["status"] == "done" and first["repeat"] is False
    assert money(first["treasury"]) == (100, 100, 0)
    assert first["treasury"]["receipt"]["actionUid"].startswith("fx_")
    assert counts(database, actor, "wager001") == (1, 1)
    reconciles(database, keys(initial)[0])


def test_same_event_separate_actions_have_no_one_bet_or_open_count_cap(database):
    owner, actor, _, initial = ready(database, 20)
    for number in range(12):
        assert open_wager(database, actor, owner, initial, 1, f"wager{number:03d}")["status"] == (
            "done"
        )
    assert counts(database, actor, "wager001") == (1, 1)
    reconciles(database, keys(initial)[0])


def test_identical_replay_ignores_fresh_price_and_departed_membership(database):
    owner, actor, _, initial = ready(database)
    first = open_wager(database, actor, owner, initial)
    rpc(database, "game_leave", actor, owner)
    again = open_wager(database, actor, owner, initial, supplied={"invalid": "changed source"})
    assert again["repeat"] is True and again["wager"] == first["wager"]
    assert again["treasury"]["receipt"] == first["treasury"]["receipt"]
    assert counts(database, actor, "wager001") == (1, 1)
    assert again["currentEconomy"] is None


def test_opening_replay_after_settlement_keeps_the_original_opening_receipt(database):
    owner, actor, _, initial = ready(database)
    opened = open_wager(database, actor, owner, initial)
    make_due(database, opened)
    original_receipt = open_wager(database, actor, owner, initial)["receipt"]
    assert settlement(database, opened)["status"] == "done"
    again = open_wager(database, actor, owner, initial)
    assert again["receipt"] == original_receipt
    assert again["settlement"] is None


def test_common_receipt_has_exact_origin_actor_and_operation_fields(database):
    owner, actor, _, initial = ready(database)
    opened = open_wager(database, actor, owner, initial)
    receipt = opened["receipt"]
    assert set(receipt) == {"receiptId", "actionUid", "action", "actorId", "origin", "result"}
    assert (receipt["actionUid"], receipt["actorId"], receipt["action"]) == (
        "wager001", str(actor), "island_bet"
    )
    assert receipt["origin"] == {
        "mode": "island_shared", "version": 1, "islandOwner": str(owner),
        "accountId": keys(initial)[0], "runEpoch": keys(initial)[1],
    }


@pytest.mark.parametrize("changed", [{"stake": 51}, {"selection": "down"}, {"event": "apple"}])
def test_changed_root_payload_conflicts_without_another_reserve(database, changed):
    owner, actor, _, initial = ready(database)
    open_wager(database, actor, owner, initial)
    assert open_wager(database, actor, owner, initial, **changed) == {
        "status": "refused", "reason": "action_conflict"
    }
    assert counts(database, actor, "wager001") == (1, 1)


@pytest.mark.parametrize("kind", ["funds", "source", "nonmember", "authority"])
def test_refusals_roll_back_new_root_product_and_reservation(database, kind):
    owner, actor, outsider, initial = ready(database, 10)
    supplied = evidence(database)
    stake = 1
    if kind == "funds":
        stake = 11
    if kind == "source":
        supplied["source"] = "replay"
    if kind == "nonmember":
        actor = outsider
    if kind == "authority":
        as_owner(database)
        database.execute("drop function public.island_economy_authority(uuid,uuid)")
    result = open_wager(database, actor, owner, initial, stake, supplied=supplied)
    assert result["status"] == "refused"
    assert counts(database, actor, "wager001") == (0, 0)
    assert database.execute(
        "select committed_coins from public.island_economy_accounts where id=%s",
        (keys(initial)[0],)
    ).fetchone() == (0,)


def test_post_reserve_failure_rolls_back_the_financial_child_and_root(database):
    owner, actor, _, initial = ready(database, 100)
    as_owner(database)
    database.execute("""
      create function public.test_wager_failure() returns trigger language plpgsql as $$
      begin raise exception 'test_product_failure'; end; $$;
      create trigger test_wager_failure before insert on public.island_wagers
      for each row execute function public.test_wager_failure();
    """)
    with pytest.raises(psycopg.errors.RaiseException, match="test_product_failure"):
        with database.transaction():
            open_wager(database, actor, owner, initial)
    assert counts(database, actor, "wager001") == (0, 0)
    reconciles(database, keys(initial)[0])


def race(server, functions):
    barrier = Barrier(len(functions))

    def run(function):
        with psycopg.connect(server.get_uri()) as connection:
            connection.execute("set lock_timeout='5s'")
            barrier.wait(timeout=5)
            result = function(connection)
            connection.commit()
            return result

    with ThreadPoolExecutor(len(functions)) as pool:
        return list(pool.map(run, functions))


def test_last_coin_purchase_and_wager_cannot_both_spend_free_funds(database, scratch_server):
    owner, actor, _, initial = ready(database, 1)
    database.commit()
    results = race(scratch_server, [
        lambda c: open_wager(c, actor, owner, initial, 1),
        lambda c: spend(c, actor, initial, 1),
    ])
    assert sum(result["status"] == "done" for result in results) == 1
    assert {"status": "refused", "reason": "insufficient_funds"} in results
    as_owner(database)
    reconciles(database, keys(initial)[0])


def test_concurrent_identical_wagers_create_one_product_and_reserve(database, scratch_server):
    owner, actor, _, initial = ready(database, 100)
    database.commit()
    results = race(scratch_server, [
        lambda c: open_wager(c, actor, owner, initial),
        lambda c: open_wager(c, actor, owner, initial),
    ])
    assert sorted(result["repeat"] for result in results) == [False, True]
    assert results[0]["receipt"] == results[1]["receipt"]
    assert counts(database, actor, "wager001") == (1, 1)
    reconciles(database, keys(initial)[0])


def test_concurrent_result_checks_settle_one_reservation(database, scratch_server):
    owner, actor, _, initial = ready(database, 100)
    opened = open_wager(database, actor, owner, initial)
    make_due(database, opened)
    database.commit()
    results = race(scratch_server, [
        lambda c: settlement(c, opened), lambda c: settlement(c, opened),
    ])
    assert sorted(result["repeat"] for result in results) == [False, True]
    assert results[0]["receipt"] == results[1]["receipt"]
    as_owner(database)
    reconciles(database, keys(initial)[0])


def test_5001_digit_stake_and_payout_remain_exact_in_postgresql(database):
    coins = Decimal("1" + "0" * 4999 + "7")
    owner, actor, _, initial = ready(database, coins)
    opened = open_wager(database, actor, owner, initial, coins)
    assert opened["wager"]["stake"] == format(coins, "f")
    make_due(database, opened)
    paid = settlement(database, opened)
    assert paid["settlement"]["returnedPayout"] == "2" + "0" * 4998 + "14"
    reconciles(database, keys(initial)[0])


@pytest.mark.parametrize("price", ["99", "100", "101"])
def test_market_loss_tie_win_settles_exactly_once(database, price):
    owner, actor, _, initial = ready(database, 100)
    opened = open_wager(database, actor, owner, initial)
    make_due(database, opened)
    result = settlement(database, opened, price=price)
    expected = {"99": "0", "100": "50", "101": "100"}[price]
    assert result["settlement"]["returnedPayout"] == expected
    reconciles(database, keys(initial)[0])


def football_evidence(connection, **changes):
    now = connection.execute("select clock_timestamp()").fetchone()[0]
    return {"provider": "football-data.org", "source": "live", "fixtureId": "fd-123",
            "sport": "football", "status": "scheduled", "fetchedAt": now.isoformat(),
            "kickoff": (now + timedelta(hours=2)).isoformat()} | changes


@pytest.mark.parametrize("status,home,away,expected", [
    ("finished", 2, 1, "100"), ("finished", 0, 1, "0"),
    ("finished", 1, 1, "0"), ("cancelled", None, None, "50"),
])
def test_official_football_result_or_void_settles_original_bet(
    database, status, home, away, expected,
):
    owner, actor, _, initial = ready(database, 100)
    opened = open_wager(database, actor, owner, initial, product="football", event="fd-123",
                        selection="home", supplied=football_evidence(database))
    make_due(database, opened)
    result = settlement(database, opened, supplied=football_evidence(
        database, status=status, homeScore=home, awayScore=away))
    assert result["settlement"]["returnedPayout"] == expected
    reconciles(database, keys(initial)[0])


def test_unusable_market_data_refunds_once_after_timeout(database):
    owner, actor, _, initial = ready(database, 100)
    opened = open_wager(database, actor, owner, initial)
    make_due(database, opened)
    as_owner(database)
    database.execute("alter table public.island_wagers disable trigger island_wagers_immutable")
    database.execute(
        "update public.island_wagers set opened_at=opened_at-interval '25 hours',"
        "settle_at=settle_at-interval '25 hours' where id=%s", (opened["wager"]["id"],)
    )
    database.execute("alter table public.island_wagers enable trigger island_wagers_immutable")
    paid = settlement(database, opened, supplied=evidence(database, source="stale", price=None))
    again = settlement(database, opened)
    assert paid["settlement"]["returnedPayout"] == "50"
    assert again["receipt"] == paid["receipt"] and again["repeat"] is True
    reconciles(database, keys(initial)[0])


@pytest.mark.parametrize("bad", [
    {"is_member": "true"}, {"actor_id": None}, {"reservation_id": 42},
    {"session_leader_id": "invalid"}, {"extra": True},
])
def test_malformed_authority_fails_closed_and_rolls_back_the_root(database, bad):
    owner, actor, _, initial = ready(database, 100)
    as_owner(database)
    database.execute("""
      create or replace function public.island_economy_authority(
        p_actor_id uuid,p_island_owner uuid)
      returns jsonb language sql stable as $$
        select jsonb_build_object('actor_id',$1,'island_owner',$2,'is_member',true,
          'reservation_id',null,'session_leader_id',null,'actor_assignment_wave_id',null)
          || current_setting('mp_eco_test.bad_authority')::jsonb
      $$;
    """)
    import json
    database.execute("select set_config('mp_eco_test.bad_authority',%s,true)", (json.dumps(bad),))
    assert open_wager(database, actor, owner, initial) == {
        "status": "refused", "reason": "path_unavailable"
    }
    assert counts(database, actor, "wager001") == (0, 0)


def test_product_and_settlement_tables_are_private_and_immutable(database):
    owner, actor, _, initial = ready(database)
    opened = open_wager(database, actor, owner, initial)
    as_owner(database)
    assert database.execute(
        "select has_table_privilege('authenticated','public.island_wagers','select')"
    ).fetchone() == (False,)
    assert database.execute(
        "select has_table_privilege('service_role','public.island_wagers','insert,update,delete')"
    ).fetchone() == (False,)
    assert database.execute(
        "select has_function_privilege('authenticated',"
        "'public.island_wager_settle(uuid,jsonb)','execute')"
    ).fetchone() == (False,)
    with pytest.raises(psycopg.errors.RaiseException, match="island_wager_immutable"):
        with database.transaction():
            database.execute("update public.island_wagers set selection='down' where id=%s",
                             (opened["wager"]["id"],))


def test_bets_remain_available_during_a_reserved_wave(database):
    owner, actor, _, initial = ready(database)
    configure_test_authority(database, actor, owner, reservation_id=uuid4())
    assert open_wager(database, actor, owner, initial)["status"] == "done"


def test_veteran_members_cannot_bypass_the_target_island_unlock(database):
    owner, actor, _, initial = ready(database)
    database.execute("update public.islands set wave_best=0 where player_id=%s", (owner,))
    assert open_wager(database, actor, owner, initial) == {
        "status": "refused", "reason": "harbor_closed"
    }
    assert counts(database, actor, "wager001") == (0, 0)


@pytest.mark.parametrize("amount", [Decimal("0"), Decimal("-1"), Decimal("0.5"),
                                    Decimal("NaN"), Decimal("Infinity")])
def test_invalid_numeric_stakes_cannot_claim_roots_or_hold_funds(database, amount):
    owner, actor, _, initial = ready(database)
    assert open_wager(database, actor, owner, initial, amount) == {
        "status": "refused", "reason": "invalid_change"
    }
    assert counts(database, actor, "wager001") == (0, 0)


def test_unsupported_exchange_products_cannot_use_a_private_wallet_fallback(database):
    owner, actor, _, initial = ready(database)
    assert open_wager(database, actor, owner, initial, product="exchange_position") == {
        "status": "refused", "reason": "path_unavailable"
    }
    assert counts(database, actor, "wager001") == (0, 0)


def test_prior_different_financial_domain_conflicts_with_wager_root(database):
    owner, actor, _, initial = ready(database)
    assert spend(database, actor, initial, 1, uid="wager001")["status"] == "done"
    assert open_wager(database, actor, owner, initial) == {
        "status": "refused", "reason": "action_conflict"
    }
    assert counts(database, actor, "wager001") == (1, 0)


@pytest.mark.parametrize("bad", [
    {"source": "replay"}, {"source": "stale"}, {"asset": "apple"}, {"price": None},
    {"price": "NaN"}, {"price": "Infinity"}, {"price": "-1"},
])
def test_unverified_market_results_leave_original_commitment_unchanged(database, bad):
    owner, actor, _, initial = ready(database, 100)
    opened = open_wager(database, actor, owner, initial)
    make_due(database, opened)
    assert settlement(database, opened, supplied=evidence(database, **bad))["status"] == "refused"
    as_owner(database)
    assert database.execute(
        "select committed_coins from public.island_economy_accounts where id=%s",
        (keys(initial)[0],)
    ).fetchone() == (50,)
    assert database.execute(
        "select count(*) from public.island_wager_settlements where wager_id=%s",
        (opened["wager"]["id"],)
    ).fetchone() == (0,)
    reconciles(database, keys(initial)[0])


@pytest.mark.parametrize("bad", [
    {"source": "recorded"}, {"provider": "recorded"}, {"fixtureId": "fd-124"},
    {"status": "scheduled"}, {"homeScore": "NaN"}, {"awayScore": -1},
])
def test_unverified_football_results_cannot_move_committed_money(database, bad):
    owner, actor, _, initial = ready(database, 100)
    opened = open_wager(database, actor, owner, initial, product="football", event="fd-123",
                        selection="home", supplied=football_evidence(database))
    make_due(database, opened)
    result = football_evidence(database, status="finished", homeScore=2, awayScore=1) | bad
    assert settlement(database, opened, supplied=result)["status"] == "refused"
    reconciles(database, keys(initial)[0])


def test_post_settlement_failure_rolls_back_product_and_system_financial_effect(database):
    owner, actor, _, initial = ready(database, 100)
    opened = open_wager(database, actor, owner, initial)
    make_due(database, opened)
    as_owner(database)
    database.execute("""
      create function public.test_result_failure() returns trigger language plpgsql as $$
      begin raise exception 'test_result_failure'; end; $$;
      create trigger test_result_failure before insert on public.island_wager_settlements
      for each row execute function public.test_result_failure();
    """)
    with pytest.raises(psycopg.errors.RaiseException, match="test_result_failure"):
        with database.transaction():
            settlement(database, opened)
    assert database.execute(
        "select count(*) from public.island_treasury_transactions where source_reservation_id=%s",
        (opened["wager"]["sourceReservationId"],)
    ).fetchone() == (0,)
    reconciles(database, keys(initial)[0])


def test_settlement_persists_result_and_pays_source_once(database):
    owner, actor, _, initial = ready(database, 100)
    opened = open_wager(database, actor, owner, initial)
    make_due(database, opened)
    settled = settlement(database, opened)
    again = settlement(database, opened, price="99")
    assert settled["settlement"]["outcome"] == "won"
    assert settled["settlement"]["returnedPayout"] == "100"
    assert again["repeat"] is True and again["settlement"] == settled["settlement"]
    assert money(again["treasury"]) == (150, 0, 150)
    assert again["treasury"]["receipt"]["actionUid"].startswith("sys_")
    reconciles(database, keys(initial)[0])


def test_departed_actor_and_retired_origin_settlement_cannot_credit_replacement(database):
    owner, actor, _, initial = ready(database, 100)
    opened = open_wager(database, actor, owner, initial)
    make_due(database, opened)
    rpc(database, "game_leave", actor, owner)
    as_owner(database)
    database.execute(
        "update public.island_economy_accounts set state='retired',retired_at=clock_timestamp() "
        "where id=%s", (keys(initial)[0],)
    )
    replacement = database.execute(
        "insert into public.island_economy_accounts(island_owner) values(%s) "
        "returning id,run_epoch",
        (owner,),
    ).fetchone()
    database.execute(
        "update public.island_economy_state set current_account_id=%s,run_epoch=%s "
        "where island_owner=%s", (*replacement, owner)
    )
    settled = settlement(database, opened)
    assert settled["currentEconomy"] is None
    assert database.execute(
        "select balance_coins from public.island_economy_accounts where id=%s", (keys(initial)[0],)
    ).fetchone() == (150,)
    assert database.execute(
        "select balance_coins from public.island_economy_accounts where id=%s", (replacement[0],)
    ).fetchone() == (0,)
    reconciles(database, keys(initial)[0])
