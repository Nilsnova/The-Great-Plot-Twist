"""Bounded real native-input/paging measurement; no hosted access or cleanup.

Set WRITE_T60_NATIVE_DIAGNOSTIC=1 to save this isolated measurement. Otherwise
the test writes no evidence files. Auth identities and combat configuration are
explicit fixtures, while controller, input and journal RPCs are the real source.
"""

import hashlib
import json
import os
import subprocess
import time
from pathlib import Path

import pytest

pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import as_owner, as_server  # noqa: E402
from server.tests.island_sql.test_shared_combat_native_sql import native_combat  # noqa: E402
from server.tests.island_sql.test_shared_session_close_sql import close  # noqa: E402

ROOT = Path(__file__).resolve().parents[4]
BASELINE = "3bdd8eda16470795fdedd68c42fffab54e5f2ced"
OUTPUT = ROOT / "docs/evidence/T60-structure-recovery/current-native-20261119/journal-budget.json"


def test_actual_native_journal_sample_retains_closed_history_and_fixed_head(database):
    world = native_combat(database, coins=40)
    durations = []
    for actor_index, actor in enumerate((world.owner, world.target)):
        for start in range(1, 1001, 32):
            batch = [
                {
                    "inputUid": f"budget_{actor_index}_{counter:06d}",
                    "actorCounter": counter,
                    "tick": 0,
                    "command": {"type": "captain_move", "x": counter % 3, "z": 0},
                }
                for counter in range(start, min(start + 32, 1001))
            ]
            as_server(database)
            started = time.perf_counter_ns()
            reply = rpc(
                database,
                "shared_session_wave_inputs",
                actor,
                world.owner,
                keys(world.treasury)[1],
                world.wave,
                world.sessions[actor],
                1,
                Jsonb(batch),
            )
            durations.append(time.perf_counter_ns() - started)
            assert reply["status"] == "accepted" and len(reply["accepted"]) == len(batch), reply
    as_owner(database)
    count, payload, tuples = database.execute(
        "select count(*),sum(pg_column_size(payload)),sum(pg_column_size(e)) "
        "from public.recovery_wave_events e where wave_id=%s",
        (world.wave,),
    ).fetchone()
    assert count == 2000
    allocation = database.execute(
        "select pg_total_relation_size('public.recovery_wave_events'::regclass)",
    ).fetchone()[0]
    pages, elapsed, rows, cursor, maximum_page_bytes = 0, [], [], 0, 0
    head = sealed = None
    while head is None or cursor < head:
        as_server(database)
        started = time.perf_counter_ns()
        page = rpc(
            database,
            "shared_session_wave_events",
            world.owner,
            world.owner,
            keys(world.treasury)[1],
            world.wave,
            world.sessions[world.owner],
            1,
            cursor,
            head,
            sealed,
        )
        elapsed.append(time.perf_counter_ns() - started)
        assert "error" not in page and "events" in page, page
        if head is None:
            head, sealed = page["headSeq"], page["sealedThroughTick"]
        assert page["headSeq"] == head and page["sealedThroughTick"] == sealed
        assert 0 < len(page["events"]) <= 256
        maximum_page_bytes = max(maximum_page_bytes, len(json.dumps(page).encode()))
        rows.extend(page["events"])
        cursor = page["events"][-1]["serverSeq"]
        pages += 1
    assert cursor == head == count
    assert [row["serverSeq"] for row in rows] == list(range(1, count + 1))
    before_hash = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()
    assert close(database, {"waveId": str(world.wave)}, "lost")["status"] == "done"
    as_owner(database)
    assert (
        database.execute(
            "select count(*) from public.recovery_wave_events where wave_id=%s", (world.wave,)
        ).fetchone()[0]
        == count
    )
    assert (
        database.execute(
            "select count(*) from public.island_wave_closures where wave_id=%s", (world.wave,)
        ).fetchone()[0]
        == 1
    )
    report = {
        "sourceCommit": BASELINE,
        "measurementSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "journalEvents": count,
        "allocatedBytes": allocation,
        "payloadBytes": payload,
        "eventTupleBytes": tuples,
        "sample": {
            "actors": 2,
            "commandsPerActor": 1000,
            "batchLimit": 32,
            "fixedHeadPages": pages,
            "maxEncodedPageBytes": maximum_page_bytes,
            "capturedHead": head,
            "prefixSha256": before_hash,
        },
        "timing": {
            "meanInputBatchMs": round(sum(durations) / len(durations) / 1e6, 3),
            "maximumPageMs": round(max(elapsed) / 1e6, 3),
        },
        "retention": {
            "closedJournalRowsRetained": count,
            "canonicalClosureRowsRetained": 1,
            "destructiveOperations": 0,
        },
        "limits": [
            "Disposable Unix-socket PostgreSQL; seeded Auth identities, not provider sign-in.",
            "Native SQL bypasses HTTP token buckets; no cross-worker capacity guarantee.",
            "Allocation is the scratch relation plus indexes, not isolated per-wave attribution.",
            "Retain canonical/accounting history; no automatic deletion policy selected.",
        ],
    }
    if os.environ.get("WRITE_T60_NATIVE_DIAGNOSTIC") == "1":
        production = ["backend/server/island", "backend/server/routes", "supabase/migrations"]
        subprocess.run(
            ["git", "diff", "--quiet", BASELINE, "--", *production], cwd=ROOT, check=True
        )
        assert not subprocess.check_output(
            ["git", "ls-files", "--others", "--exclude-standard", "--", *production], cwd=ROOT
        ), "Untracked production source cannot be assigned to the baseline."
        report["measurementCommit"] = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip()
        report["productionSourceMatchesBaseline"] = True
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(report, indent=2) + "\n")
