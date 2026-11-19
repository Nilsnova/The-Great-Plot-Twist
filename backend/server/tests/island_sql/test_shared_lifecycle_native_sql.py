"""Lifecycle boundaries use the actual accepted-bell and persisted authority.

Auth identities and combat configuration are local fixtures. Canonical controller,
roster, assignment, accounting and snapshot production use the real functions;
these SQL checks do not claim provider-issued authenticated acceptance.
"""

from threading import Event
from time import monotonic
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island  # noqa: E402
from server.island.wave_economy import freeze_reward_basis  # noqa: E402
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import as_owner, as_server  # noqa: E402
from server.tests.island_sql.test_shared_arsenal_sql import change  # noqa: E402
from server.tests.island_sql.test_shared_lifecycle_transactions_sql import (  # noqa: E402
    delete,
    prepare,
    reset,
)
from server.tests.island_sql.test_shared_session_control_sql import attach  # noqa: E402
from server.tests.island_sql.test_structure_recovery_mutations_sql import template  # noqa: E402


def native_room(database, *, treasury=None, actors=None, prepared=None):
    owner, member, outsider, initial, code = prepared or prepare(database)
    current = treasury or initial
    sessions, generations = {}, {}
    for actor in actors or (owner, member):
        sessions[actor] = uuid4()
        attached = attach(database, actor, owner, current, sessions[actor])
        assert attached["status"] == "done", attached
        generations[actor] = int(attached["session"]["connectionGeneration"])
    return {
        "owner": owner, "member": member, "outsider": outsider, "treasury": current,
        "code": code, "sessions": sessions, "generations": generations,
    }


def native_bell(database, room, *, actor=None, countdown=0, maximum=900, uid="lifecycle-bell01"):
    owner, treasury = room["owner"], room["treasury"]
    actor = actor or owner
    as_server(database)
    setting = rpc(
        database, "shared_session_settings", actor, owner, keys(treasury)[1],
        room["sessions"][actor], room["generations"][actor], uuid4().hex,
        Jsonb({"countdownSeconds": countdown}),
    )
    assert setting["status"] == "done", setting
    as_owner(database)
    revision = database.execute(
        "select revision from public.island_recovery_state where island_owner=%s", (owner,)
    ).fetchone()[0]
    source = rpc(database, "shared_session_source_locked", owner)
    played = source["nextWave"] or source["waveBest"] + 1
    snapshot = template()
    snapshot["expectedRevision"] = revision
    snapshot["expectedSource"] = source
    snapshot["weatherLabel"] = "Calm"
    snapshot["weather"] = {"kind": "calm", "ships": 1, "fog": 0}
    snapshot["createWave"]["seed"] = 42
    snapshot["eventByWave"] = {str(played): None}
    snapshot["bossByWave"] = {str(played): False}
    basis = freeze_reward_basis(load_island(), played_wave=played, seed=42, house_levels=0)
    as_server(database)
    result = rpc(
        database, "shared_session_wave_start", actor, owner, keys(treasury)[1],
        room["sessions"][actor], room["generations"][actor], uid, 42, countdown, 0, maximum,
        100, "calm", 1, 0, ["structure_recovery"], Jsonb(snapshot), Jsonb(basis.envelope()),
    )
    assert result["status"] == "started", result
    return result


def await_actual_deadline(database, wave):
    as_owner(database)
    limit, pause = monotonic() + 4, Event()
    while monotonic() < limit:
        if database.execute(
            "select clock_timestamp() >= expires_at from public.island_recovery_state "
            "where current_wave_id=%s", (wave,)
        ).fetchone() == (True,):
            return
        pause.wait(0.02)
    pytest.fail("The accepted one-second native reservation did not reach its actual deadline.")


def native_health(database, room, started, actor):
    limit, pause = monotonic() + 3, Event()
    while True:
        as_server(database)
        page = rpc(
            database, "shared_session_wave_events", actor, room["owner"], keys(room["treasury"])[1],
            started["waveId"], room["sessions"][actor], room["generations"][actor], 0, None, None,
        )
        if page["sealedThroughTick"] >= 0:
            break
        assert monotonic() < limit, "The real native server clock did not seal tick zero."
        pause.wait(0.01)
    report = {
        "islandEpoch": started["initialSnapshot"]["islandEpoch"],
        "checkpointUid": uuid4().hex, "throughTick": page["sealedThroughTick"],
        "inputHeadSeq": page["through"], "lastRepairSeq": 0, "basisRepairSeq": {}, "hpUnits": {},
    }
    accepted = rpc(
        database, "shared_session_wave_health", actor, room["owner"], keys(room["treasury"])[1],
        started["waveId"], room["sessions"][actor], room["generations"][actor], Jsonb(report),
    )
    assert accepted["status"] == "accepted", accepted
    return report


def native_finish(database, room, started, actor=None, generation=None):
    actor = actor or room["owner"]
    as_server(database)
    return rpc(
        database, "shared_session_wave_finish", actor, room["owner"], keys(room["treasury"])[1],
        started["waveId"], room["sessions"][actor], generation or room["generations"][actor],
        Jsonb({"survived": True, "shipsSunk": 0, "bonuses": [], "rescued": False,
               "checkpoint": None, "walls": None}),
    )


def buy_member_copy(database, prepared):
    _, member, _, treasury, _ = prepared
    as_server(database)
    bought = change(database, member, treasury)
    assert bought["status"] == "done", bought
    return bought["receipt"]["result"]["copyId"]


@pytest.mark.parametrize("phase", ["countdown", "active", "expired_unsealed"])
def test_actual_native_reservation_blocks_new_reset_without_withdrawal(database, phase):
    room = native_room(database)
    started = native_bell(
        database, room, countdown=30 if phase == "countdown" else 0,
        maximum=1 if phase == "expired_unsealed" else 900,
    )
    if phase == "expired_unsealed":
        await_actual_deadline(database, started["waveId"])
    result = reset(database, room["owner"], room["treasury"], room["code"])
    assert result == {"status": "refused", "reason": "wave_running"}
    as_owner(database)
    assert database.execute(
        "select count(*) from public.shared_session_slots where wave_id=%s and status='active'",
        (started["waveId"],),
    ).fetchone() == (2,)
    assert database.execute(
        "select count(*) from public.personal_captain_profiles where assignment_wave_id=%s",
        (started["waveId"],),
    ).fetchone() == (2,)
    assert database.execute(
        "select count(*) from public.island_wave_closures where wave_id=%s", (started["waveId"],)
    ).fetchone() == (0,)
    assert database.execute(
        "select count(*) from public.island_economy_operations where actor_id=%s "
        "and domain_action='lifecycle:reset'", (room["owner"],)
    ).fetchone() == (0,)


def test_original_reset_receipt_replays_while_replacement_native_wave_is_active(database):
    prepared = prepare(database)
    owner, _, _, treasury, code = prepared
    original = reset(database, owner, treasury, code)
    assert original["status"] == "done"
    as_server(database)
    canonical_context = rpc(database, "island_economy_context", owner)
    current = {"currentEconomy": canonical_context["economy"]}
    assert keys(current) != keys(treasury)
    room = native_room(database, treasury=current, prepared=prepared)
    started = native_bell(database, room)
    replay = reset(database, owner, treasury, code)
    assert replay["repeat"] and replay["receipt"] == original["receipt"]
    assert replay["currentEconomy"] is None
    assert started["initialSnapshot"]["economy"]["runEpoch"] == keys(current)[1]
    assert started["initialSnapshot"]["economy"]["accountId"] == keys(current)[0]
    as_owner(database)
    assert database.execute(
        "select count(*) from public.shared_session_slots where wave_id=%s and status='active'",
        (started["waveId"],),
    ).fetchone() == (2,)


def test_deleted_native_starter_preserves_health_journal_copy_and_survivor_win(database):
    prepared = prepare(database)
    owner, member, _, treasury, _ = prepared
    copy = buy_member_copy(database, prepared)
    room = native_room(database, prepared=prepared, actors=(member, owner))
    started = native_bell(database, room, actor=member)
    as_server(database)
    command = [{"inputUid": "deleted-starter-input01", "actorCounter": 1, "tick": 0,
                "command": {"type": "captain_move", "x": 1, "z": 2}}]
    accepted = rpc(
        database, "shared_session_wave_inputs", member, owner, keys(treasury)[1],
        started["waveId"], room["sessions"][member], room["generations"][member], Jsonb(command),
    )
    assert accepted["status"] == "accepted", accepted
    report = native_health(database, room, started, member)
    rpc(database, "shared_session_heartbeat", owner, owner, keys(treasury)[1],
        room["sessions"][owner], room["generations"][owner])
    assert delete(database, member) == {"status": "deleted"}
    as_owner(database)
    assert database.execute(
        "select holder,holder_generation,pending_return_wave_id::text from public.arsenal_copies "
        "where id=%s", (copy,)
    ).fetchone() == (member, 1, started["waveId"])
    assert database.execute(
        "select started_by from public.wave_runs where id=%s", (started["waveId"],)
    ).fetchone() == (member,)
    assert database.execute(
        "select actor_id from public.recovery_health_checkpoints where wave_id=%s "
        "and checkpoint_uid=%s", (started["waveId"], report["checkpointUid"])
    ).fetchone() == (member,)
    assert database.execute(
        "select actor_id,participant_token is not null from public.recovery_wave_events "
        "where wave_id=%s and input_uid='deleted-starter-input01'", (started["waveId"],)
    ).fetchone() == (None, True)
    assert database.execute(
        "select initial_snapshot,checkpoint_actor from public.recovery_wave_states "
        "where wave_id=%s",
        (started["waveId"],),
    ).fetchone() == (started["initialSnapshot"], None)
    completed = native_finish(database, room, started)
    assert completed["status"] == "done" and completed["outcome"] == "won", completed
    assert completed["completion"]["confirmedParticipation"] is True
    assert native_finish(database, room, started, generation=999)["completion"] == completed[
        "completion"
    ]
    as_owner(database)
    assert database.execute(
        "select holder,holder_generation,pending_return_wave_id from public.arsenal_copies "
        "where id=%s", (copy,)
    ).fetchone() == (None, 2, None)
    assert database.execute(
        "select count(*) from public.island_wave_completion_receipts where wave_id=%s",
        (started["waveId"],),
    ).fetchone() == (2,)
    assert database.execute(
        "select won_wave_best,assignment_wave_id from public.personal_captain_profiles "
        "where player_id=%s", (owner,)
    ).fetchone() == (31, None)
    assert database.execute(
        "select balance_coins from public.island_economy_accounts where id=%s",
        (keys(treasury)[0],),
    ).fetchone() == (369,)  # 40 after the copy + one 329-coin wave-31 late-curve reward


@pytest.mark.parametrize("phase", ["countdown", "active", "expired_unsealed"])
def test_confirmed_owner_deletion_closes_native_attempt_before_live_cascades(database, phase):
    room = native_room(database)
    owner, member, treasury = room["owner"], room["member"], room["treasury"]
    started = native_bell(
        database, room, countdown=30 if phase == "countdown" else 0,
        maximum=1 if phase == "expired_unsealed" else 900,
    )
    if phase == "expired_unsealed":
        await_actual_deadline(database, started["waveId"])
    assert delete(database, owner, True) == {"status": "deleted"}
    as_owner(database)
    assert database.execute(
        "select outcome from public.island_wave_closures where wave_id=%s", (started["waveId"],)
    ).fetchone() == ("expired" if phase == "expired_unsealed" else "abandoned",)
    assert database.execute(
        "select started_by,island_owner,finished_at is not null from public.wave_runs where id=%s",
        (started["waveId"],),
    ).fetchone() == (owner, owner, True)
    assert database.execute(
        "select island_owner,initial_snapshot,closed_at is not null "
        "from public.recovery_wave_states where wave_id=%s", (started["waveId"],)
    ).fetchone() == (owner, started["initialSnapshot"], True)
    assert database.execute(
        "select count(*) from public.islands where player_id=%s", (owner,)
    ).fetchone() == (0,)
    assert database.execute(
        "select assignment_wave_id from public.personal_captain_profiles where player_id=%s",
        (member,),
    ).fetchone() == (None,)
    assert database.execute(
        "select state,balance_coins from public.island_economy_accounts where id=%s",
        (keys(treasury)[0],),
    ).fetchone() == ("retired", 100)


@pytest.mark.parametrize("in_roster", [False, True])
def test_native_member_leave_reserves_copy_until_actual_canonical_close(database, in_roster):
    prepared = prepare(database)
    owner, member, _, treasury, _ = prepared
    copy = buy_member_copy(database, prepared)
    room = native_room(
        database, prepared=prepared, actors=(owner, member) if in_roster else (owner,)
    )
    started = native_bell(database, room)
    as_server(database)
    assert rpc(database, "game_leave", member, owner) == {"status": "left", "repeat": False}
    as_owner(database)
    assert database.execute(
        "select holder,holder_generation,pending_return_wave_id::text from public.arsenal_copies "
        "where id=%s", (copy,)
    ).fetchone() == (member, 1, started["waveId"])
    assert native_finish(database, room, started)["outcome"] == "won"
    as_owner(database)
    assert database.execute(
        "select holder,holder_generation,pending_return_wave_id from public.arsenal_copies "
        "where id=%s", (copy,)
    ).fetchone() == (None, 2, None)


def test_deleting_last_eligible_member_normalizes_expired_peer_grace_in_same_transaction(database):
    room = native_room(database)
    started = native_bell(database, room)
    as_owner(database)
    # TEST ONLY clock fixture: the peer's fixed grace has actually elapsed at
    # deletion time. No browser read/worker should be required to finish removal.
    database.execute(
        "update public.shared_session_controls set "
        "last_seen=clock_timestamp()-interval '61 seconds',"
        "connected_until=null,active_since=null,"
        "grace_until=clock_timestamp()-interval '1 second' where player_id=%s",
        (room["owner"],),
    )
    assert delete(database, room["member"]) == {"status": "deleted"}
    as_owner(database)
    assert database.execute(
        "select outcome from public.island_wave_closures where wave_id=%s", (started["waveId"],)
    ).fetchone() == ("abandoned",)
    assert database.execute(
        "select count(*) from public.shared_session_slots where wave_id=%s and status='withdrawn'",
        (started["waveId"],),
    ).fetchone() == (2,)
