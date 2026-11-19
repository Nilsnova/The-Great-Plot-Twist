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
from server.tests.island_sql.test_shared_lifecycle_transactions_sql import prepare, reset  # noqa: E402
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
