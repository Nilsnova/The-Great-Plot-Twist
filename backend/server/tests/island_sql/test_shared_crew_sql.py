"""Real shared crew transactions, legacy exclusion and races on disposable PostgreSQL.

The fixture applies every migration twice and never reads live credentials.
"""

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Barrier
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island  # noqa: E402
from server.island.shared_crew_rules import manifest  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    keys,
    money,
    race,
    ready,
    reconciles,
    reserve,
    rpc,
)
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_owner,
    as_server,
    balance,
    open_island,
)
from server.tests.island_sql.test_personal_captain_sql import RULES  # noqa: E402
from server.tests.island_sql.test_shared_construction_sql import construct, intent  # noqa: E402

CATALOGUE = manifest(load_island())


def setup(connection, coins=200):
    owner, member, outsider, treasury = ready(connection, coins)
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    code = "".join(alphabet[(member.int >> (5 * index)) % len(alphabet)] for index in range(5))
    open_island(connection, member, code)
    as_owner(connection)
    connection.execute("update public.islands set wave_best=9 where player_id=%s", (owner,))
    as_server(connection)
    return owner, member, outsider, treasury


def hire(connection, actor, treasury, kind="gunner", uid=None, catalogue=None):
    as_server(connection)
    return rpc(
        connection,
        "island_economy_hire",
        actor,
        *keys(treasury),
        uid or uuid4().hex,
        kind,
        Jsonb(CATALOGUE if catalogue is None else catalogue),
    )


def snapshot(connection, actor, treasury):
    as_server(connection)
    return rpc(connection, "island_economy_crew", actor, *keys(treasury))


def counts(connection, owner):
    as_owner(connection)
    return connection.execute(
        "select crew_gunner,crew_carpenter,crew_lookout,crew_guard "
        "from public.islands where player_id=%s",
        (owner,),
    ).fetchone()


def operation_count(connection, actor, uid):
    as_owner(connection)
    return connection.execute(
        "select count(*) from public.island_economy_operations where actor_id=%s and action_uid=%s",
        (actor, uid),
    ).fetchone()[0]


def test_visitor_hire_changes_only_defended_island_and_all_clients_read_the_same_crew(database):
    owner, member, _, treasury = setup(database)
    as_owner(database)
    database.execute("update public.islands set crew_carpenter=2 where player_id=%s", (owner,))
    database.execute(
        "update public.islands set crew_gunner=2,captain_role='engineer' where player_id=%s",
        (member,),
    )
    wallets = [balance(database, actor) for actor in (owner, member)]
    for kind, price in [("gunner", "40"), ("lookout", "25"), ("guard", "60")]:
        result = hire(database, member, treasury, kind)
        assert result["status"] == "done", result
        assert result["receipt"]["result"]["chargedCoins"] == price
    assert counts(database, owner) == (1, 2, 1, 1)
    assert counts(database, member) == (2, 0, 0, 0)
    assert [balance(database, actor) for actor in (owner, member)] == wallets
    assert snapshot(database, member, treasury) == snapshot(database, owner, treasury)
    assert money(result) == (75, 0, 75)
    reconciles(database, keys(treasury)[0])


def test_original_receipt_replays_before_current_capacity_funds_phase_or_price_checks(database):
    owner, member, _, treasury = setup(database, 80)
    first = hire(database, member, treasury, uid="hire0001")
    hire(database, owner, treasury)
    as_owner(database)
    database.execute(
        "update public.island_recovery_state set current_wave_id=%s,"
        "reserved_at=clock_timestamp(),starts_at=clock_timestamp()+interval '1 minute',"
        "expires_at=clock_timestamp()+interval '2 minutes' where island_owner=%s",
        (uuid4(), owner),
    )
    changed = deepcopy(CATALOGUE)
    changed["gunner"]["priceCoins"] = "999"
    repeat = hire(database, member, treasury, uid="hire0001", catalogue=changed)
    assert repeat["repeat"] is True
    assert repeat["receipt"] == first["receipt"]
    assert repeat["currentCrew"]["gunner"] == 2
    assert money(repeat) == (0, 0, 0)
    assert hire(database, member, treasury, "lookout", "hire0001")["reason"] == "action_conflict"
    assert hire(database, member, treasury, "carpenter", "hire0001")["reason"] == "action_conflict"


@pytest.mark.parametrize("kind", ["carpenter", "cook"])
def test_unavailable_crew_never_charges_or_leaves_a_root_claim(database, kind):
    owner, member, _, treasury = setup(database)
    before = counts(database, owner)
    result = hire(database, member, treasury, kind, "hire0001")
    assert result["reason"] == ("crew_unavailable" if kind == "carpenter" else "invalid_crew")
    assert counts(database, owner) == before
    assert operation_count(database, member, "hire0001") == 0
    assert money(snapshot(database, owner, treasury)) == (200, 0, 200)


def test_unlock_uses_target_progress_instead_of_buyers_home_progress(database):
    owner, member, _, treasury = setup(database)
    as_owner(database)
    database.execute(
        "update public.islands set wave_best=0,won_wave_best=99 where player_id=%s", (owner,)
    )
    database.execute("update public.islands set wave_best=99 where player_id=%s", (member,))
    assert hire(database, member, treasury, uid="hire0001")["reason"] == "locked"
    assert operation_count(database, member, "hire0001") == 0
    as_owner(database)
    database.execute("update public.islands set wave_best=9 where player_id=%s", (owner,))
    database.execute("update public.islands set wave_best=0 where player_id=%s", (member,))
    assert hire(database, member, treasury, uid="hire0001")["status"] == "done"


@pytest.mark.parametrize("window", ["countdown", "expired", "recovery"])
def test_every_unclosed_reservation_blocks_hiring_without_automatic_expiry(database, window):
    owner, member, _, treasury = setup(database)
    as_owner(database)
    if window == "recovery":
        database.execute(
            "update public.island_recovery_state set current_wave_id=%s,"
            "reserved_at=clock_timestamp(),starts_at=clock_timestamp()+interval '1 minute',"
            "expires_at=clock_timestamp()+interval '2 minutes' where island_owner=%s",
            (uuid4(), owner),
        )
    else:
        database.execute(
            "insert into public.wave_runs(started_by,island_owner,wave,starts_at,"
            "action_uid,place,seed,minimum_seconds,maximum_seconds,weather_kind,"
            "weather_ships,weather_fog) values(%s,%s,4,clock_timestamp()+ %s * "
            "interval '1 minute','reserved1','island',1,1,60,'calm',1,1)",
            (owner, owner, -600 if window == "expired" else 1),
        )
    assert hire(database, member, treasury, uid="hire0001")["reason"] == "wave_running"
    assert counts(database, owner)[0] == 0
    assert operation_count(database, member, "hire0001") == 0


def test_last_capacity_slot_can_be_bought_once(database, scratch_server):
    owner, member, _, treasury = setup(database)
    as_owner(database)
    database.execute("update public.islands set crew_gunner=1 where player_id=%s", (owner,))
    database.commit()
    results = race(
        scratch_server, [lambda c: hire(c, member, treasury), lambda c: hire(c, owner, treasury)]
    )
    assert sorted(result["status"] for result in results) == ["done", "refused"]
    assert (
        next(result for result in results if result["status"] == "refused")["reason"] == "crew_full"
    )
    assert counts(database, owner)[0] == 2
    assert money(snapshot(database, member, treasury)) == (160, 0, 160)


def test_hire_build_and_all_in_bet_compete_for_one_available_balance(database, scratch_server):
    owner, member, _, treasury = setup(database, 40)
    as_server(database)
    rpc(database, "personal_captain_initialize", owner, owner, keys(treasury)[1], Jsonb(RULES))
    database.commit()
    results = race(
        scratch_server,
        [
            lambda c: hire(c, member, treasury),
            lambda c: reserve(c, owner, treasury, 40),
            lambda c: construct(c, owner, treasury, intent(coins="10")),
        ],
    )
    assert [result["status"] for result in results].count("done") == 1, results
    assert all(
        result.get("reason") == "insufficient_funds"
        for result in results
        if result["status"] == "refused"
    )
    reconciles(database, keys(treasury)[0])


def test_global_identity_conflicts_before_unrelated_current_state_checks(database):
    owner, member, _, treasury = setup(database)
    hire(database, member, treasury, uid="global001")
    assert construct(database, member, treasury, uid="global001")["reason"] == "action_conflict"
    held = reserve(database, owner, treasury, 1, uid="global002")
    assert held["status"] == "done"
    assert hire(database, owner, treasury, uid="global002")["reason"] == "action_conflict"
    assert hire(database, owner, treasury, uid="fx_invalid_root")["reason"] == "invalid_change"


def test_departed_actor_gets_only_original_receipt_and_no_new_hire_or_current_projection(database):
    owner, member, _, treasury = setup(database)
    original = hire(database, member, treasury, uid="hire0001")
    rpc(database, "game_leave", member, owner)
    replay = hire(database, member, treasury, uid="hire0001")
    assert replay["receipt"] == original["receipt"]
    assert (replay["currentEconomy"], replay["currentCrew"], replay["currentWaveBest"]) == (
        None,
        None,
        None,
    )
    assert hire(database, member, treasury, uid="hire0002")["reason"] == "not_member"
    assert snapshot(database, member, treasury)["reason"] == "not_member"
    assert operation_count(database, member, "hire0002") == 0


def test_membership_departure_commits_before_a_waiting_hire_is_checked(database, scratch_server):
    owner, member, _, treasury = setup(database)
    database.commit()
    barrier = Barrier(2)

    def waiting_hire():
        with psycopg.connect(scratch_server.get_uri()) as connection:
            barrier.wait(timeout=10)
            result = hire(connection, member, treasury, uid="leave001")
            connection.commit()
            return result

    with psycopg.connect(scratch_server.get_uri()) as departing:
        as_owner(departing)
        departing.execute(
            "select player_id from public.islands where player_id=%s for update", (owner,)
        )
        with ThreadPoolExecutor(1) as pool:
            purchase = pool.submit(waiting_hire)
            barrier.wait(timeout=10)
            as_server(departing)
            assert rpc(departing, "game_leave", member, owner)["status"] == "left"
            departing.commit()
            assert purchase.result(timeout=10)["reason"] == "not_member"
    assert counts(database, owner)[0] == 0
    assert operation_count(database, member, "leave001") == 0


def test_old_epoch_cannot_purchase_or_expose_a_retired_origins_current_island(database):
    owner, member, _, treasury = setup(database)
    original = hire(database, member, treasury, uid="hire0001")
    as_server(database)
    assert (
        rpc(
            database,
            "island_economy_hire",
            member,
            keys(treasury)[0],
            uuid4(),
            "hire0002",
            "gunner",
            Jsonb(CATALOGUE),
        )["reason"]
        == "epoch_mismatch"
    )
    as_owner(database)
    database.execute(
        "update public.island_economy_accounts set state='retired',"
        "retired_at=clock_timestamp() where id=%s",
        (keys(treasury)[0],),
    )
    replay = hire(database, member, treasury, uid="hire0001")
    assert replay["receipt"] == original["receipt"]
    assert replay["currentEconomy"] is None and replay["currentCrew"] is None
    assert hire(database, member, treasury)["reason"] == "path_unavailable"


def test_failure_after_charge_and_count_change_rolls_back_every_effect(database):
    owner, member, _, treasury = setup(database)
    as_owner(database)
    database.execute(
        "create function public.crew_test_fail() returns trigger language plpgsql "
        "as $$ begin raise exception 'crew_test_failure'; end; $$"
    )
    database.execute(
        "create trigger crew_test_fail before insert on public.island_crew_receipts "
        "for each row execute function public.crew_test_fail()"
    )
    with (
        pytest.raises(psycopg.errors.RaiseException, match="crew_test_failure"),
        database.transaction(),
    ):
        hire(database, member, treasury, uid="failure01")
    assert counts(database, owner)[0] == 0
    assert operation_count(database, member, "failure01") == 0
    assert money(snapshot(database, owner, treasury)) == (200, 0, 200)
    reconciles(database, keys(treasury)[0])


def test_legacy_hire_keeps_old_behavior_and_cannot_bypass_shared_or_paused_admission(database):
    owner, member, _, treasury = setup(database)
    as_server(database)
    assert rpc(database, "island_hire", member, "carpenter", "legacy01", 30, 2)["count"] == 1
    for paused in (False, True):
        if paused:
            as_owner(database)
            database.execute(
                "update public.island_economy_state set admission_state='paused' "
                "where island_owner=%s",
                (owner,),
            )
        as_server(database)
        assert rpc(database, "island_hire", owner, "gunner", "legacy02", 40, 2) == {
            "status": "refused",
            "reason": "economy_context_required",
        }
    assert counts(database, owner)[0] == 0
    assert balance(database, owner) == 100
    as_owner(database)
    for role in ("anon", "authenticated", "service_role"):
        assert database.execute(
            "select has_function_privilege(%s,'public.island_hire_legacy_personal"
            "(uuid,text,text,integer,integer)','execute')",
            (role,),
        ).fetchone() == (False,)


def test_old_carpenter_count_and_personal_payment_history_survive_new_shared_hires(database):
    owner, member, _, _ = ready(database, admitted=False)
    as_server(database)
    assert rpc(database, "island_hire", owner, "carpenter", "oldcarp01", 30, 2)["count"] == 1
    as_owner(database)
    history = database.execute(
        "select * from public.wallet_transactions where player_id=%s order by id", (owner,)
    ).fetchall()
    database.execute("update public.islands set wave_best=9 where player_id=%s", (owner,))
    as_server(database)
    treasury = rpc(database, "island_treasury_admit", owner, owner, "admit001", 200)
    assert hire(database, member, treasury)["status"] == "done"
    assert counts(database, owner) == (1, 1, 0, 0)
    assert (
        database.execute(
            "select * from public.wallet_transactions where player_id=%s order by id", (owner,)
        ).fetchall()
        == history
    )


def test_rpc_access_and_immutable_receipt_storage_are_server_only(database):
    _, member, _, treasury = setup(database)
    result = hire(database, member, treasury)
    as_owner(database)
    for name in (
        "island_economy_crew(uuid,uuid,uuid)",
        "island_economy_hire(uuid,uuid,uuid,text,text,jsonb)",
    ):
        for role in ("anon", "authenticated", "service_role"):
            assert database.execute(
                "select has_function_privilege(%s,%s,'execute')", (role, "public." + name)
            ).fetchone() == (role == "service_role",)
    with (
        pytest.raises(psycopg.errors.RaiseException, match="crew_history_immutable"),
        database.transaction(),
    ):
        database.execute(
            "update public.island_crew_receipts set count=count where id=%s",
            (result["receipt"]["receiptId"],),
        )
