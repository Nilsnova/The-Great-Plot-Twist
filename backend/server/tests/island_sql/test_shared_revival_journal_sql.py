"""Actual bell/input/Captain-report/hold/consume composition on disposable PostgreSQL.

Direct fixture writes set only initial money and legacy Captain entitlements. Real production hooks
freeze the roster and skills, accept HP reports, create fall UUIDs and start timed holds.
Synthetic gameplay reports exercise the existing combat-report trust boundary, not a per-hit
simulation verifier or authenticated browser journey. No canonical slot, fall, pose, hold
timestamp or authority provider is directly inserted, overwritten or substituted here.
"""

import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from threading import Barrier
from uuid import UUID, uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island  # noqa: E402
from server.island.personal_captain import configuration  # noqa: E402
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, ready, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import as_owner, as_server  # noqa: E402
from server.tests.island_sql.test_shared_session_control_sql import attach  # noqa: E402
from server.tests.island_sql.test_shared_session_wave_sql import bell  # noqa: E402


@dataclass
class Wave:
    owner: UUID
    target: UUID
    other: UUID
    treasury: dict
    sessions: dict
    wave: UUID
    tokens: dict
    generations: dict


def real_wave(database, *, role=None, surgeon=False, third_helper=False):
    owner, member, outsider, treasury = ready(database, coins=0)
    actors = [owner, member]
    if third_helper:
        assert rpc(database, "game_join", outsider, owner, 10)["status"] == "joined"
        actors.append(outsider)
    as_owner(database)
    # These are pre-conversion profile/balance fixtures, never live combat proof.
    database.execute(
        "update public.islands set captain_level=5,captain_role=%s,captain_skills=%s,"
        "wave_best=40,won_wave_best=40,next_wave=1 "
        "where player_id=%s", (role, ["field_surgeon"] if surgeon else [], owner),
    )
    for actor in actors:
        database.execute(
            "insert into public.wallets(player_id,balance) values(%s,0) "
            "on conflict(player_id) do update set balance=0", (actor,),
        )
        as_server(database)
        initialized = rpc(database, "personal_captain_initialize", actor, owner,
                          keys(treasury)[1], Jsonb(configuration(load_island())))
        assert initialized["captain"]["progressionVersion"] == 1
        as_owner(database)
    sessions = {actor: uuid4() for actor in actors}
    for actor in actors:
        assert attach(database, actor, owner, treasury, sessions[actor])["status"] == "done"
    started = bell(database, (owner, member, outsider, treasury, sessions))
    assert started["status"] == "started"
    as_owner(database)
    tokens = dict(database.execute(
        "select player_id,participant_token from public.shared_session_slots where wave_id=%s",
        (started["waveId"],),
    ).fetchall())
    return Wave(owner, member, outsider, treasury, sessions, UUID(started["waveId"]), tokens,
                {actor: 1 for actor in actors})


def report(database, world, *, fallen=None, hp=None, through=None, basis=None):
    """Controller submits a complete HP vector against the real current sealed prefix."""
    if through is None:
        as_owner(database)
        changed = list(fallen or []) + list(hp or {})
        minimum = database.execute(
            "select coalesce(max(state_through_tick)+1,0) from public.shared_session_slots "
            "where wave_id=%s and player_id=any(%s)", (world.wave, changed),
        ).fetchone()[0]
        deadline = time.monotonic() + 2
        through = seal_current_prefix(database, world)
        # A later injury must occur after the actual revival basis tick. Waiting for
        # the real clock preserves the native same-frontier divergence guard.
        while through < minimum:
            assert time.monotonic() < deadline, "The real clock did not seal the next prefix."
            time.sleep(0.01)
            through = seal_current_prefix(database, world)
    as_owner(database)
    head = database.execute(
        "select coalesce(max(seq),0) from public.recovery_wave_events "
        "where wave_id=%s and effective_tick<=%s", (world.wave, through),
    ).fetchone()[0]
    rows = database.execute(
        "select participant_token,hp_units,down_at_tick,revive_basis_seq "
        "from public.shared_session_slots where wave_id=%s", (world.wave,),
    ).fetchall()
    captains = {
        str(token): {"hpUnits": units, "downAtTick": down, "reviveBasisSeq": seq}
        for token, units, down, seq in rows
    }
    for actor in fallen or []:
        captains[str(world.tokens[actor])].update(hpUnits=0, downAtTick=through)
    for actor, units in (hp or {}).items():
        captains[str(world.tokens[actor])].update(hpUnits=units, downAtTick=None)
    for actor, seq in (basis or {}).items():
        captains[str(world.tokens[actor])]["reviveBasisSeq"] = seq
    as_server(database)
    answer = rpc(database, "shared_session_wave_captains", world.owner, world.owner,
                 keys(world.treasury)[1], world.wave, world.sessions[world.owner],
                 world.generations[world.owner], Jsonb({"checkpointUid": uuid4().hex,
                 "throughTick": through, "inputHeadSeq": head, "captains": captains}))
    assert answer.get("accepted") is True, answer
    return answer


def fall_id(database, world, target=None):
    as_owner(database)
    return database.execute(
        "select fall_id from public.shared_session_slots where wave_id=%s and player_id=%s",
        (world.wave, target or world.target),
    ).fetchone()[0]


def command(database, world, value, *, actor=None, original=None):
    actor = actor or world.owner
    if original is None:
        as_owner(database)
        counter = database.execute(
            "select last_actor_counter+1 from public.recovery_wave_participants "
            "where wave_id=%s and player_id=%s", (world.wave, actor),
        ).fetchone()[0]
        original = {"inputUid": uuid4().hex, "actorCounter": counter, "tick": 0,
                    "command": value}
    as_server(database)
    answer = rpc(database, "shared_session_wave_inputs", actor, world.owner,
                 keys(world.treasury)[1], world.wave, world.sessions[actor],
                 world.generations[actor], Jsonb([original]))
    assert answer["status"] == "accepted", answer
    return answer, original


def start_hold(database, world, *, actor=None, target=None):
    target = target or world.target
    fall = fall_id(database, world, target)
    assert fall is not None
    answer, original = command(database, world, {
        "type": "captain_revive_hold_start", "targetId": str(world.tokens[target]),
        "fallId": str(fall),
    }, actor=actor)
    return answer["accepted"][0]["payload"]["hold"], fall, original


def finish(database, world, hold, fall, *, actor=None, target=None, uid="free_help_001"):
    actor, target = actor or world.owner, target or world.target
    as_server(database)
    return rpc(database, "island_shared_captain_revive", actor, world.owner,
               *keys(world.treasury), uid, world.wave, world.tokens[target], fall,
               hold["holdId"], world.sessions[actor], world.generations[actor])


def no_money_or_quota(database, world):
    as_owner(database)
    return (
        database.execute(
            "select balance_coins,committed_coins,revision from public.island_economy_accounts "
            "where id=%s", (keys(world.treasury)[0],),
        ).fetchone(),
        database.execute(
            "select player_id,balance from public.wallets where player_id=any(%s) "
            "order by player_id", (list(world.sessions),),
        ).fetchall(),
        database.execute(
            "select count(*) from public.wallet_transactions where player_id=any(%s)",
            (list(world.sessions),),
        ).fetchone(),
        database.execute(
            "select count(*) from public.island_treasury_transactions where account_id=%s",
            (keys(world.treasury)[0],),
        ).fetchone(),
        database.execute("select paid_used from public.recovery_wave_states where wave_id=%s",
                         (world.wave,)).fetchone(),
    )


def seal_current_prefix(database, world):
    as_server(database)
    answer = rpc(database, "shared_session_wave_events", world.owner, world.owner,
                 keys(world.treasury)[1], world.wave, world.sessions[world.owner],
                 world.generations[world.owner], 0, None, None)
    assert answer.get("status") != "refused", answer
    return answer["sealedThroughTick"]


@pytest.mark.parametrize(("role", "surgeon", "milliseconds", "restored"), [
    (None, False, 2000, 500000), ("medic", False, 1200, 750000),
    ("medic", True, 1200, 1000000),
])
def test_real_free_hold_uses_frozen_rules_and_works_at_zero_coins(
    database, role, surgeon, milliseconds, restored,
):
    world = real_wave(database, role=role, surgeon=surgeon)
    report(database, world, fallen=[world.target])
    before = no_money_or_quota(database, world)
    assert before[0][:2] == (0, 0) and all(row[1] == 0 for row in before[1])
    hold, fall, original = start_hold(database, world)
    assert hold["requiredMs"] == milliseconds
    assert finish(database, world, hold, fall) == {"status": "refused", "reason": "hold_incomplete"}
    as_owner(database)
    assert database.execute(
        "select count(*) from public.island_economy_operations "
        "where actor_id=%s and action_uid='free_help_001'", (world.owner,),
    ).fetchone()[0] == 0
    repeated, _ = command(database, world, original["command"], original=original)
    assert repeated["accepted"][0]["payload"]["hold"] == hold
    # A genuine identical idle movement is allowed and must not restart the timer.
    command(database, world, {"type": "captain_move", "x": 0, "z": 0})
    if role is None:
        time.sleep(0.07)
        report(database, world, hp={world.owner: 900000})
    time.sleep(milliseconds / 1000 + 0.03)
    answer = finish(database, world, hold, fall)
    assert answer["status"] == "done" and answer["repeat"] is False, answer
    facts = answer["receipt"]["result"]
    assert facts["restoredHPUnits"] == restored
    assert facts["reviveSeq"] == facts["eventSeq"]
    as_owner(database)
    assert database.execute(
        "select hp_units,down,fall_id,revive_basis_seq from public.shared_session_slots "
        "where wave_id=%s and player_id=%s", (world.wave, world.target),
    ).fetchone() == (restored, False, None, facts["eventSeq"])
    payload, token, frozen = database.execute(
        "select e.payload,e.participant_token,s.frozen_captain from public.recovery_wave_events e "
        "join public.shared_session_slots s on s.wave_id=e.wave_id and s.player_id=e.actor_id "
        "where e.wave_id=%s and e.seq=%s", (world.wave, facts["eventSeq"]),
    ).fetchone()
    assert token == world.tokens[world.owner] and payload["captain"] == frozen
    assert payload["targetId"] == str(world.tokens[world.target])
    assert payload["fallId"] == str(fall)
    assert payload["command"] == {
        "type": "captain_revive", "targetId": str(world.tokens[world.target]),
        "downAt": facts["downAtTick"], "x": 0, "z": 0,
    }
    assert no_money_or_quota(database, world) == before
    again = finish(database, world, hold, fall)
    assert again == {**answer, "repeat": True}
    assert no_money_or_quota(database, world) == before


@pytest.mark.parametrize("interruption", ["cancel", "move_away_back", "reconnect"])
def test_real_ordered_interruptions_invalidate_hold_and_roll_back_root(database, interruption):
    world = real_wave(database)
    report(database, world, fallen=[world.target])
    hold, fall, _ = start_hold(database, world)
    if interruption == "cancel":
        command(database, world, {"type": "captain_revive_hold_cancel"})
    elif interruption == "move_away_back":
        command(database, world, {"type": "captain_move", "x": 4, "z": 0})
        command(database, world, {"type": "captain_move", "x": 0, "z": 0})
    else:
        replacement = attach(database, world.owner, world.owner, world.treasury,
                             world.sessions[world.owner], 1)
        assert replacement["status"] == "done"
        world.generations[world.owner] = 2
    assert finish(database, world, hold, fall) == {
        "status": "refused", "reason": "hold_invalidated",
    }
    as_owner(database)
    assert database.execute(
        "select count(*) from public.island_economy_operations "
        "where actor_id=%s and action_uid='free_help_001'", (world.owner,),
    ).fetchone()[0] == 0
    assert fall_id(database, world) == fall
    if interruption == "cancel":
        fresh, same_fall, _ = start_hold(database, world)
        assert fresh["holdId"] != hold["holdId"] and same_fall == fall
        assert finish(database, world, fresh, fall) == {
            "status": "refused", "reason": "hold_incomplete",
        }
        time.sleep(2.03)
        assert finish(database, world, fresh, fall)["status"] == "done"


def test_helper_fall_and_revive_at_unchanged_pose_cannot_reuse_earlier_hold(database):
    world = real_wave(database, third_helper=True)
    report(database, world, fallen=[world.target])
    original, target_fall, _ = start_hold(database, world)
    time.sleep(0.07)
    report(database, world, fallen=[world.owner])
    rescue, helper_fall, _ = start_hold(database, world, actor=world.other, target=world.owner)
    time.sleep(2.03)
    assert finish(database, world, rescue, helper_fall, actor=world.other,
                  target=world.owner, uid="helper_rescue_001")["status"] == "done"
    assert finish(database, world, original, target_fall) == {
        "status": "refused", "reason": "hold_invalidated",
    }
    assert fall_id(database, world) == target_fall


def test_real_two_helpers_race_one_fall_without_money_or_duplicate_event(scratch_server):
    with psycopg.connect(scratch_server.get_uri()) as setup:
        world = real_wave(setup, third_helper=True)
        report(setup, world, fallen=[world.target])
        first, fall, _ = start_hold(setup, world)
        second, _, _ = start_hold(setup, world, actor=world.other)
        before = no_money_or_quota(setup, world)
        setup.commit()
    time.sleep(2.03)
    barrier = Barrier(2)

    def compete(actor, hold, uid):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            connection.execute("set statement_timeout='5s'")
            barrier.wait(timeout=5)
            return finish(connection, world, hold, fall, actor=actor, uid=uid)

    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = [pool.submit(compete, world.owner, first, "race_help_001"),
                pool.submit(compete, world.other, second, "race_help_002")]
        answers = [job.result(timeout=8) for job in jobs]
    assert sorted(row["status"] for row in answers) == ["done", "refused"], answers
    assert next(row for row in answers if row["status"] == "refused")["reason"] == (
        "target_unavailable"
    )
    with psycopg.connect(scratch_server.get_uri()) as check:
        as_owner(check)
        assert check.execute(
            "select count(*) from public.recovery_wave_events "
            "where wave_id=%s and event_kind='captain_revive'", (world.wave,),
        ).fetchone()[0] == 1
        assert check.execute(
            "select count(*) from public.island_shared_revival_receipts where wave_id=%s",
            (world.wave,),
        ).fetchone()[0] == 1
        assert check.execute(
            "select count(*) from public.island_economy_operations "
            "where domain_action='wave_revive' and fingerprint->>'waveId'=%s", (str(world.wave),),
        ).fetchone()[0] == 1
        assert no_money_or_quota(check, world) == before


def test_real_hold_requires_captain_report_covering_current_sealed_frontier(database):
    world = real_wave(database)
    report(database, world, fallen=[world.target])
    hold, fall, _ = start_hold(database, world)
    time.sleep(0.07)
    seal_current_prefix(database, world)
    assert finish(database, world, hold, fall) == {
        "status": "refused", "reason": "health_sync_required",
    }
    report(database, world)
    time.sleep(2.03)
    assert finish(database, world, hold, fall)["status"] == "done"


def test_original_receipt_cannot_heal_later_damage_or_consume_another_fall(database):
    world = real_wave(database)
    report(database, world, fallen=[world.target])
    hold, fall, _ = start_hold(database, world)
    time.sleep(2.03)
    original = finish(database, world, hold, fall)
    assert original["status"] == "done", original
    as_owner(database)
    old_tick = database.execute(
        "select sealed_through_tick from public.recovery_wave_states where wave_id=%s",
        (world.wave,),
    ).fetchone()[0]
    # Reading the new global head does not mean the future revival event has been
    # simulated at this old tick. Echoing its fresh basis cannot create another fall.
    premature = {
        str(token): {"hpUnits": 0 if actor == world.target else 1000000,
                     "downAtTick": old_tick if actor == world.target else None,
                     "reviveBasisSeq": original["receipt"]["result"]["reviveSeq"]
                     if actor == world.target else 0}
        for actor, token in world.tokens.items()
    }
    as_server(database)
    refused = rpc(database, "shared_session_wave_captains", world.owner, world.owner,
                  keys(world.treasury)[1], world.wave, world.sessions[world.owner], 1,
                  Jsonb({"checkpointUid": uuid4().hex, "throughTick": old_tick,
                         "inputHeadSeq": original["receipt"]["result"]["eventSeq"],
                         "captains": premature}))
    assert refused == {"status": "refused", "reason": "checkpoint_stale"}
    assert fall_id(database, world) is None
    time.sleep(0.07)
    seal_current_prefix(database, world)
    report(database, world, hp={world.target: 250000})
    assert finish(database, world, hold, fall) == {**original, "repeat": True}
    as_owner(database)
    assert database.execute(
        "select hp_units from public.shared_session_slots where wave_id=%s and player_id=%s",
        (world.wave, world.target),
    ).fetchone()[0] == 250000
    time.sleep(0.07)
    seal_current_prefix(database, world)
    report(database, world, fallen=[world.target])
    next_fall = fall_id(database, world)
    assert next_fall and next_fall != fall
    assert finish(database, world, hold, fall) == {**original, "repeat": True}
    assert fall_id(database, world) == next_fall
    as_server(database)
    assert rpc(database, "shared_session_disconnect", world.owner, world.owner,
               keys(world.treasury)[1], world.sessions[world.owner], 1)["status"] == "done"
    assert finish(database, world, hold, fall) == {**original, "repeat": True}
    as_owner(database)
    assert database.execute(
        "select count(*) from public.recovery_wave_events "
        "where wave_id=%s and event_kind='captain_revive'", (world.wave,),
    ).fetchone()[0] == 1


@pytest.mark.parametrize("fault_table", ["recovery_wave_events", "island_shared_revival_receipts"])
def test_real_event_and_receipt_faults_roll_back_root_fall_hold_and_journal(database, fault_table):
    world = real_wave(database)
    report(database, world, fallen=[world.target])
    hold, fall, _ = start_hold(database, world)
    before = no_money_or_quota(database, world)
    as_owner(database)
    database.execute(
        "create function public.fail_free_revival_fixture() returns trigger "
        "language plpgsql set search_path='' as $$begin "
        "raise exception 'free_revival_write_fault_fixture'; end$$"
    )
    # Names come only from this fixed parametrization. The trigger injects a write failure,
    # never a controller, combat, hold or financial authority fact.
    database.execute(
        "create trigger free_revival_write_fault_fixture before insert on public." + fault_table
        + " for each row execute function public.fail_free_revival_fixture()"
    )
    time.sleep(2.03)
    with pytest.raises(psycopg.errors.RaiseException, match="free_revival_write_fault_fixture"):
        with database.transaction():
            finish(database, world, hold, fall)
    as_owner(database)
    assert database.execute(
        "select count(*) from public.island_economy_operations "
        "where actor_id=%s and action_uid='free_help_001'", (world.owner,),
    ).fetchone()[0] == 0
    assert database.execute(
        "select count(*) from public.recovery_wave_events "
        "where wave_id=%s and event_kind='captain_revive'", (world.wave,),
    ).fetchone()[0] == 0
    assert fall_id(database, world) == fall
    assert database.execute(
        "select completed_operation_id from public.island_shared_revival_holds where id=%s",
        (hold["holdId"],),
    ).fetchone()[0] is None
    assert no_money_or_quota(database, world) == before
    database.execute("drop trigger free_revival_write_fault_fixture on public." + fault_table)
    assert finish(database, world, hold, fall)["status"] == "done"
