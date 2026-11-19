"""Always-on defaults cannot rewrite a previously accepted native wave's policy.

The transport adapter is local SQL; membership, controllers, preparation, frozen
rules, finish and receipts are real. Seeded identities are not provider sessions.
"""

import asyncio

import pytest

pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.island import wave_rules  # noqa: E402
from server.island.catalogue import load_island, runtime_catalogue  # noqa: E402
from server.island.rules import weather_for  # noqa: E402
from server.island.shared_wave_template import prepare_shared_wave  # noqa: E402
from server.settings import Settings  # noqa: E402
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import as_owner, as_server  # noqa: E402
from server.tests.island_sql.test_shared_session_wave_sql import live_room  # noqa: E402
from server.tests.island_sql.test_shared_session_worker_sql import SQLAdmin  # noqa: E402


def test_always_on_rescue_does_not_change_accepted_rules_or_saved_loss_policy(database):
    owner, _, _, treasury, sessions = live_room(database)
    as_owner(database)
    database.execute(
        "update public.islands set wave_best=20,next_wave=5 where player_id=%s", (owner,)
    )
    as_server(database)
    assert rpc(
        database, "shared_session_settings", owner, owner, keys(treasury)[1], sessions[owner], 1,
        "compat_countdown01", Jsonb({"countdownSeconds": 0}),
    )["status"] == "done"
    catalogue = runtime_catalogue(load_island())
    # An old accepted rule set is persisted even though today's defaults enable
    # rescue. Preparation consumes that exact set instead of today's switches.
    template, basis = asyncio.run(prepare_shared_wave(
        SQLAdmin(database), catalogue, str(owner), str(owner), weather_for(catalogue, None),
        42, ["structure_recovery"],
    ))
    started = rpc(
        database, "shared_session_wave_start", owner, owner, keys(treasury)[1], sessions[owner], 1,
        "compat_old_rules01", 42, 0, 0, 900, 100, "calm", 1, 0, ["structure_recovery"],
        Jsonb(template), Jsonb(basis.envelope()),
    )
    assert started["status"] == "started", started
    assert "rescue" in wave_rules.wanted_rules(Settings())
    snapshot = started["initialSnapshot"]
    assert snapshot["rules"] == ["structure_recovery"]
    assert snapshot["finishPolicy"]["rescue"]["enabled"] is False
    finished = rpc(
        database, "shared_session_wave_finish", owner, owner, keys(treasury)[1], started["waveId"],
        sessions[owner], 1, Jsonb({"survived": False, "rescued": True, "shipsSunk": 0}),
    )
    assert finished["status"] == "done" and finished["outcome"] == "lost", finished
    as_owner(database)
    assert database.execute(
        "select next_wave from public.islands where player_id=%s", (owner,)
    ).fetchone() == (18,)
    assert database.execute(
        "select initial_snapshot from public.recovery_wave_states where wave_id=%s",
        (started["waveId"],),
    ).fetchone() == (snapshot,)
    as_server(database)
    replay = rpc(
        database, "shared_session_wave_finish", owner, owner, keys(treasury)[1], started["waveId"],
        sessions[owner], 999, Jsonb({"survived": True, "rescued": False, "shipsSunk": 99}),
    )
    assert replay["repeat"] is True and replay["completion"] == finished["completion"]
