"""Real legacy structures -> canonical bell/report -> shared repair and free Tavern revival.

Synthetic accepted combat reports retain the existing trust limit. No authority provider,
canonical Captain slot/fall/pose, hold timestamp or structure checkpoint is overwritten.
"""

import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from queue import Queue
from threading import Barrier
from uuid import UUID, uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island  # noqa: E402
from server.island.personal_captain import configuration  # noqa: E402
from server.island.wave_economy import freeze_reward_basis  # noqa: E402
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, ready, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_owner,
    as_server,
    build,
)
from server.tests.island_sql.test_shared_revival_journal_sql import (  # noqa: E402
    Wave,
    command,
    finish,
    no_money_or_quota,
    report,
    seal_current_prefix,
    start_hold,
)
from server.tests.island_sql.test_shared_session_close_sql import close  # noqa: E402
from server.tests.island_sql.test_shared_session_control_sql import attach  # noqa: E402
from server.tests.island_sql.test_structure_recovery_mutations_sql import template  # noqa: E402


@dataclass
class CombatWave(Wave):
    snapshot: dict
    instance: UUID | None


def native_combat(database, *, tavern=False, coins=40, countdown=0):
    owner, member, outsider, _ = ready(database, admitted=False)
    as_owner(database)
    database.execute(
        "update public.islands set captain_level=5,captain_role=%s,captain_skills=%s,"
        "wave_best=40,won_wave_best=40,next_wave=1 where player_id=%s",
        (None if tavern else "engineer", [] if tavern else ["quick_fix"], owner),
    )
    spot, kind, level = ("house_1", "house", 2) if tavern else ("wall_1", "wall", 1)
    assert build(database, owner, spot, kind, "initial_build_001")["status"] == "done"
    if tavern:
        assert rpc(database, "island_upgrade", owner, owner, spot, "initial_raise_001",
                   [10, 20, 30, 40, 50], 5)["status"] == "done"
        assert rpc(database, "island_specialise", owner, owner, spot, "house", "tavern",
                   None, 0)["status"] == "done"
    treasury = rpc(database, "island_treasury_admit", owner, owner, "admit0001", coins)
    actors = [owner, member]
    for actor in actors:
        as_owner(database)
        database.execute(
            "insert into public.wallets(player_id,balance) values(%s,0) "
            "on conflict(player_id) do update set balance=0", (actor,),
        )
        as_server(database)
        initialized = rpc(database, "personal_captain_initialize", actor, owner,
                          keys(treasury)[1], Jsonb(configuration(load_island())))
        assert initialized["captain"]["progressionVersion"] == 1
    sessions = {actor: uuid4() for actor in actors}
    for actor in actors:
        assert attach(database, actor, owner, treasury, sessions[actor])["status"] == "done"
    as_server(database)
    assert rpc(database, "shared_session_settings", owner, owner, keys(treasury)[1],
               sessions[owner], 1, uuid4().hex,
               Jsonb({"countdownSeconds": countdown}))["status"] == "done"
    as_owner(database)
    snapshot = template() if tavern else template(((spot, kind),))
    snapshot.update(weatherLabel="Calm", expectedSource=rpc(
        database, "shared_session_source_locked", owner,
    ))
    snapshot["expectedRevision"] = database.execute(
        "select revision from public.island_recovery_state where island_owner=%s", (owner,),
    ).fetchone()[0]
    snapshot["weather"] = {"kind": "calm", "ships": 1, "fog": 0}
    snapshot["finishPolicy"] = {
        "restartBack": 2,
        "rescue": {"enabled": True, "fromWave": 4, "lastWave": 100, "restartBack": 1},
    }
    snapshot["createWave"].update(seed=42, defenses=[{
        "id": spot, "kind": kind, "level": level,
        **({"spec": "tavern"} if tavern else {}),
    }])
    basis = freeze_reward_basis(load_island(), played_wave=1, seed=42,
                                house_levels=level if tavern else 0)
    as_server(database)
    started = rpc(database, "shared_session_wave_start", owner, owner, keys(treasury)[1],
                  sessions[owner], 1, "native_bell_001", 42, countdown, 0, 900, 100,
                  "calm", 1, 0, ["structure_recovery"], Jsonb(snapshot), Jsonb(basis.envelope()))
    assert started["status"] == "started", started
    as_owner(database)
    tokens = dict(database.execute(
        "select player_id,participant_token from public.shared_session_slots where wave_id=%s",
        (started["waveId"],),
    ).fetchall())
    frozen = started["initialSnapshot"]
    assert frozen["countdownSeconds"] == countdown
    instance = None if tavern else UUID(frozen["structures"][0]["instanceId"])
    return CombatWave(owner, member, outsider, treasury, sessions, UUID(started["waveId"]),
                      tokens, {actor: 1 for actor in actors}, frozen, instance)


def damage(database, world, *, hp=400000):
    as_owner(database)
    previous, event_tick = database.execute(
        "select coalesce(checkpoint_through_tick,-1),coalesce((select max(effective_tick) "
        "from public.recovery_wave_events e where e.wave_id=w.wave_id "
        "and e.event_kind='structure_repaired'),-1) from public.recovery_wave_states w "
        "where wave_id=%s", (world.wave,),
    ).fetchone()
    deadline = time.monotonic() + 3
    through = seal_current_prefix(database, world)
    while through <= max(previous, event_tick):
        assert time.monotonic() < deadline
        time.sleep(0.01)
        through = seal_current_prefix(database, world)
    as_owner(database)
    head, counter = database.execute(
        "select coalesce(max(seq),0),count(*) filter(where event_kind='structure_repaired') "
        "from public.recovery_wave_events where wave_id=%s and effective_tick<=%s",
        (world.wave, through),
    ).fetchone()
    repair_seq = database.execute(
        "select repair_seq from public.island_structure_health "
        "where island_owner=%s and instance_id=%s", (world.owner, world.instance),
    ).fetchone()[0]
    as_server(database)
    answer = rpc(database, "shared_session_wave_health", world.owner, world.owner,
                 keys(world.treasury)[1], world.wave, world.sessions[world.owner], 1,
                 Jsonb({"islandEpoch": world.snapshot["islandEpoch"], "checkpointUid": uuid4().hex,
                        "throughTick": through, "inputHeadSeq": head, "lastRepairSeq": counter,
                        "basisRepairSeq": {str(world.instance): repair_seq},
                        "hpUnits": {str(world.instance): hp}}))
    assert answer.get("accepted") is True, answer
    return repair_seq


def repair(database, world, *, actor=None, uid="native_repair_001", seq=0, price=10, account=None):
    as_server(database)
    return rpc(database, "island_shared_structure_repair", actor or world.owner, world.owner,
               account or keys(world.treasury)[0], keys(world.treasury)[1], uid,
               UUID(world.snapshot["islandEpoch"]), world.wave, "wall_1", world.instance,
               1, seq, price)


def wave_hp(database, world):
    as_owner(database)
    return rpc(database, "structure_recovery_wave_hp", world.wave)[str(world.instance)]


def test_actual_tavern_healing_during_same_hold_remains_free(database):
    world = native_combat(database, tavern=True, coins=0)
    for actor in world.sessions:
        command(database, world, {"type": "captain_move", "x": 7, "z": -6}, actor=actor)
    report(database, world, fallen=[world.target], hp={world.owner: 900000})
    before = no_money_or_quota(database, world)
    hold, fall, _ = start_hold(database, world)
    time.sleep(2.03)
    report(database, world, hp={world.owner: 901000})
    answer = finish(database, world, hold, fall)
    assert answer["status"] == "done", answer
    assert answer["receipt"]["result"]["restoredHPUnits"] == 500000
    assert no_money_or_quota(database, world) == before


def test_native_paid_repair_uses_actual_checkpoint_shared_quota_and_exact_price(database):
    world = native_combat(database, countdown=1)
    as_owner(database)
    assert database.execute(
        "select paid_used from public.recovery_wave_states where wave_id=%s", (world.wave,),
    ).fetchone()[0] == 0
    before = no_money_or_quota(database, world)
    assert repair(database, world) == {"status": "refused", "reason": "intact"}
    seq = damage(database, world)
    assert wave_hp(database, world) == 400000
    assert repair(database, world, uid="wrong_price_001", price=9) == {
        "status": "refused", "reason": "stale_recovery_quote",
    }
    first = repair(database, world, seq=seq)
    assert first["status"] == "done", first
    assert first["receipt"]["result"]["chargedPrice"] == "10"
    assert first["receipt"]["result"]["financialReceipt"]["balanceDelta"] == "-10"
    assert first["receipt"]["result"]["useOrdinal"] == 1
    seq = damage(database, world)
    replay = repair(database, world, seq=seq)
    assert replay == {"status": "done", "repeat": True, "receipt": first["receipt"]}
    assert wave_hp(database, world) == 400000
    second = repair(database, world, actor=world.target, uid="native_repair_002", seq=seq)
    assert second["status"] == "done" and second["receipt"]["result"]["useOrdinal"] == 2
    seq = damage(database, world)
    # A new member without personal conversion or a wave assignment may repair too.
    assert rpc(database, "game_join", world.other, world.owner, 10)["status"] == "joined"
    as_owner(database)
    outside_wallet = database.execute(
        "select balance,updated_at from public.wallets where player_id=%s", (world.other,),
    ).fetchone()
    assert outside_wallet[0] == 0
    third = repair(database, world, actor=world.other, uid="native_repair_003", seq=seq)
    assert third["status"] == "done" and third["receipt"]["result"]["useOrdinal"] == 3
    as_owner(database)
    assert database.execute(
        "select balance,updated_at from public.wallets where player_id=%s", (world.other,),
    ).fetchone() == outside_wallet
    seq = damage(database, world)
    assert repair(database, world, actor=world.target, uid="native_repair_004", seq=seq) == {
        "status": "refused", "reason": "repair_limit_reached",
    }
    as_owner(database)
    assert no_money_or_quota(database, world)[1:3] == before[1:3]
    assert database.execute(
        "select balance_coins,committed_coins from public.island_economy_accounts where id=%s",
        (keys(world.treasury)[0],),
    ).fetchone() == (10, 0)
    assert database.execute(
        "select count(*) from public.island_economy_operations where account_id=%s "
        "and domain_action='structure_repair'", (keys(world.treasury)[0],),
    ).fetchone()[0] == 3
    # The retained legacy paid entry point cannot use any personal wallet on this target.
    as_server(database)
    assert rpc(database, "island_structure_repair", world.target, world.owner, "wall_1",
               world.instance, "legacy_fallback_001", UUID(world.snapshot["islandEpoch"]),
               "reserved_wave", world.wave, 1, seq, 10, "0" * 64,
               Jsonb({"wall": [10, 20, 40, 80, 160]})) == {
        "status": "refused", "reason": "economy_context_required",
    }
    close(database, {"waveId": str(world.wave)})
    assert repair(database, world, seq=seq) == {
        "status": "done", "repeat": True, "receipt": first["receipt"],
    }


def repair_facts(database, world):
    as_owner(database)
    return (
        no_money_or_quota(database, world),
        database.execute(
            "select count(*) from public.island_economy_operations where account_id=%s "
            "and domain_action='structure_repair'", (keys(world.treasury)[0],),
        ).fetchone(),
        database.execute(
            "select count(*) from public.island_shared_repair_receipts r "
            "join public.island_economy_operations o on o.id=r.operation_id where o.account_id=%s",
            (keys(world.treasury)[0],),
        ).fetchone(),
        database.execute(
            "select repair_seq,hp_units from public.island_structure_health "
            "where island_owner=%s and instance_id=%s", (world.owner, world.instance),
        ).fetchone(),
        wave_hp(database, world),
    )


@pytest.mark.parametrize("table", ["recovery_wave_events", "island_shared_repair_receipts"])
def test_native_repair_write_fault_rolls_back_root_money_hp_event_and_quota(database, table):
    world = native_combat(database)
    seq = damage(database, world)
    before = repair_facts(database, world)
    as_owner(database)
    database.execute(
        "create function public.native_repair_fault_fixture() returns trigger language plpgsql "
        "set search_path='' as $$begin raise exception 'native_repair_write_fault_fixture'; end$$"
    )
    # Fixed table names inject a write failure, never a gameplay/financial authority fact.
    database.execute("create trigger native_repair_fault_fixture before insert on public." + table
                     + " for each row execute function public.native_repair_fault_fixture()")
    with pytest.raises(psycopg.errors.RaiseException, match="native_repair_write_fault_fixture"):
        with database.transaction():
            repair(database, world, seq=seq)
    assert repair_facts(database, world) == before
    as_owner(database)
    database.execute("drop trigger native_repair_fault_fixture on public." + table)
    assert repair(database, world, seq=seq)["status"] == "done"


def test_native_repair_missing_actor_profile_refuses_without_root_or_payment(database):
    world = native_combat(database)
    seq = damage(database, world)
    before = repair_facts(database, world)
    assert repair(database, world, actor=uuid4(), seq=seq) == {
        "status": "refused", "reason": "not_member",
    }
    assert repair_facts(database, world) == before


def test_native_repair_foreign_account_selector_does_not_borrow_held_row(scratch_server):
    with psycopg.connect(scratch_server.get_uri()) as setup:
        world = native_combat(setup)
        _, _, _, foreign = ready(setup)
        setup.commit()
    with psycopg.connect(scratch_server.get_uri()) as blocker:
        as_owner(blocker)
        blocker.execute("select 1 from public.island_economy_accounts where id=%s for update",
                        (keys(foreign)[0],))
        with psycopg.connect(scratch_server.get_uri()) as request:
            request.execute("set lock_timeout='250ms'")
            assert repair(request, world, account=keys(foreign)[0]) == {
                "status": "refused", "reason": "account_missing",
            }


def test_native_repair_waits_for_actor_scope_before_any_target_account_lock(scratch_server):
    with psycopg.connect(scratch_server.get_uri()) as setup:
        world = native_combat(setup)
        seq = damage(setup, world)
        setup.commit()
    pids = Queue()

    def attempt():
        with psycopg.connect(scratch_server.get_uri()) as connection:
            connection.execute("set statement_timeout='5s'")
            pids.put(connection.execute("select pg_backend_pid()").fetchone()[0])
            return repair(connection, world, actor=world.target, seq=seq)

    with psycopg.connect(scratch_server.get_uri()) as blocker:
        as_owner(blocker)
        rpc(blocker, "island_treasury_lock_scope", world.target)
        blocker.execute("select 1 from public.profiles where id=%s for no key update",
                        (world.target,))
        with ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(attempt)
            pid = pids.get(timeout=3)
            deadline = time.monotonic() + 3
            while True:
                waiting = blocker.execute("select cardinality(pg_blocking_pids(%s))", (pid,))
                if waiting.fetchone()[0] > 0:
                    break
                assert not pending.done(), "Repair bypassed the held actor scope."
                assert time.monotonic() < deadline
                time.sleep(0.01)
            with psycopg.connect(scratch_server.get_uri()) as inspector:
                as_owner(inspector)
                inspector.execute(
                    "select 1 from public.island_economy_accounts where id=%s for update nowait",
                    (keys(world.treasury)[0],),
                )
                inspector.rollback()
            blocker.rollback()
            assert pending.result(timeout=5)["status"] == "done"


def test_native_repair_and_personal_role_race_share_one_global_actor_uid(scratch_server):
    with psycopg.connect(scratch_server.get_uri()) as setup:
        world = native_combat(setup)
        seq = damage(setup, world)
        as_server(setup)
        assert rpc(setup, "island_open", world.other, "U9R4P", 100)["status"] == "open"
        as_owner(setup)
        setup.execute(
            "update public.islands set captain_level=5,won_wave_best=40,wave_best=40 "
            "where player_id=%s", (world.other,),
        )
        setup.execute("update public.wallets set balance=0 where player_id=%s", (world.other,))
        as_server(setup)
        assert rpc(setup, "game_join", world.other, world.owner, 10)["status"] == "joined"
        personal = rpc(setup, "personal_captain_initialize", world.other, world.owner,
                       keys(world.treasury)[1], Jsonb(configuration(load_island())))
        revision = personal["captain"]["revision"]
        setup.commit()
    barrier = Barrier(2)

    def attempt(domain):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            connection.execute("set statement_timeout='5s'")
            as_server(connection)
            barrier.wait(timeout=5)
            if domain == "repair":
                return repair(connection, world, actor=world.other, uid="global_actor_uid_001",
                              seq=seq)
            return rpc(connection, "personal_captain_change", world.other, "global_actor_uid_001",
                       "role", "medic", revision)

    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = [pool.submit(attempt, domain) for domain in ("repair", "personal")]
        answers = [job.result(timeout=8) for job in jobs]
    assert sorted(value["status"] for value in answers) == ["done", "refused"], answers
    assert next(value for value in answers if value["status"] == "refused")["reason"] == (
        "action_conflict"
    )
    with psycopg.connect(scratch_server.get_uri()) as check:
        as_owner(check)
        assert check.execute(
            "select count(*) from public.island_economy_operations where actor_id=%s "
            "and action_uid='global_actor_uid_001'", (world.other,),
        ).fetchone()[0] == 1
        repair_won = answers[0]["status"] == "done"
        assert check.execute(
            "select balance_coins from public.island_economy_accounts where id=%s",
            (keys(world.treasury)[0],),
        ).fetchone()[0] == (30 if repair_won else 40)
        assert check.execute("select role from public.personal_captain_profiles where player_id=%s",
                             (world.other,)).fetchone()[0] == (None if repair_won else "medic")
