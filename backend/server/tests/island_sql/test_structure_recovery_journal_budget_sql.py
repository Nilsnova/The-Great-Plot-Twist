"""Bounded local-Postgres journal-volume and fixed-head paging diagnostic.

Run with CASE_PG_SCRATCH=1 like the other island SQL checks. Set
WRITE_RECOVERY_DIAGNOSTIC=1 to write a measured JSON artifact into the T60 evidence folder.
Normal test runs never write files.
"""

import json
import os
import time
from pathlib import Path
from uuid import UUID

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    add_players,
    as_owner,
    as_server,
    call,
    open_island,
)
from server.tests.island_sql.test_structure_recovery_api_sql import seed_recovery_wave  # noqa: E402

ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = ROOT / "docs" / "evidence" / "T60-structure-recovery" / "journal-budget.json"
ACTORS = tuple(UUID(int=number) for number in range(931, 934))
CLIENTS = (OWNER, *ACTORS)
INPUTS_PER_ACTOR = 2_500
BATCH_SIZE = 32
PAGE_SIZE = 256


def test_bounded_four_actor_journal_budget_and_fixed_head_pages(database):
    """Append 10k real RPC events, then read exactly one captured head in bounded pages."""
    wave_id, _owner_token = seed_recovery_wave(database)
    add_players(database, *ACTORS)
    for code, actor in zip(("J2R2K", "J3R3K", "J4R4K"), ACTORS, strict=True):
        open_island(database, actor, code)
    as_owner(database)
    for actor in ACTORS:
        database.execute(
            "insert into public.island_members (island_owner,player_id,role) "
            "values (%s,%s,'member')",
            (OWNER, actor),
        )

    as_server(database)
    for actor in ACTORS:
        joined = call(
            database,
            "select public.recovery_wave_join(%s,%s,2::smallint)",
            actor,
            wave_id,
        )
        assert joined["status"] == "joined"
        assert joined["waveProtocol"] == 2

    ingest_durations = []
    ingest_calls = 0
    inserted = 0
    for actor_index, actor in enumerate(CLIENTS):
        for start in range(1, INPUTS_PER_ACTOR + 1, BATCH_SIZE):
            batch = [
                {
                    "inputUid": f"c{actor_index}{counter:06d}",
                    "actorCounter": counter,
                    "tick": (counter - 1) * 5,
                    "command": {"type": "captain_move", "x": counter % 41, "z": actor_index},
                }
                for counter in range(start, min(start + BATCH_SIZE, INPUTS_PER_ACTOR + 1))
            ]
            tick0 = time.perf_counter_ns()
            reply = call(
                database,
                "select public.recovery_wave_inputs(%s,%s,%s::jsonb)",
                actor,
                wave_id,
                json.dumps(batch, separators=(",", ":")),
            )
            ingest_durations.append(time.perf_counter_ns() - tick0)
            ingest_calls += 1
            assert reply["status"] == "accepted"
            assert len(reply["accepted"]) == len(batch)
            inserted += len(batch)

    assert inserted == 10_000
    total_events, payload_bytes, event_tuple_bytes = database.execute(
        "select count(*), coalesce(sum(pg_column_size(payload)),0), "
        "coalesce(sum(pg_column_size(e)),0) "
        "from public.recovery_wave_events e where wave_id=%s",
        (wave_id,),
    ).fetchone()
    assert total_events == 10_003  # 10k commands plus three join events.

    as_owner(database)
    relation_sizes = dict(
        database.execute(
            "select c.relname, pg_relation_size(c.oid) "
            "from pg_class c join pg_namespace n on n.oid=c.relnamespace "
            "where n.nspname='public' and c.relname in ("
            "'recovery_wave_events','recovery_wave_events_pkey',"
            "'recovery_wave_events_actor_uid_unique','recovery_wave_events_replay_order_idx')"
        ).fetchall()
    )
    total_relation_bytes = database.execute(
        "select pg_total_relation_size('public.recovery_wave_events'::regclass)"
    ).fetchone()[0]

    # Capture one head, then drain it exactly in MAX_PAGE pages. Never reopen a head mid-drain.
    as_server(database)
    first_started = time.perf_counter_ns()
    first = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,null,null)",
        OWNER,
        wave_id,
    )
    page_durations = [time.perf_counter_ns() - first_started]
    assert first["status"] == "ok"
    fixed_head = first["headSeq"]
    watermark = first["sealedThroughTick"]
    page_count = 1
    cursor = 0
    events_read = first["events"]
    cursor += len(first["events"])
    while cursor < fixed_head:
        page_started = time.perf_counter_ns()
        page = call(
            database,
            "select public.recovery_wave_events_page(%s,%s,%s,%s,%s)",
            OWNER,
            wave_id,
            cursor,
            fixed_head,
            watermark,
        )
        page_durations.append(time.perf_counter_ns() - page_started)
        assert page["status"] == "ok"
        assert page["headSeq"] == fixed_head
        assert page["through"] == fixed_head
        assert page["sealedThroughTick"] == watermark
        assert 0 < len(page["events"]) <= PAGE_SIZE
        events_read.extend(page["events"])
        cursor += len(page["events"])
        page_count += 1

    assert cursor == fixed_head == total_events
    assert len(events_read) == total_events
    assert [event["serverSeq"] for event in events_read] == list(range(1, fixed_head + 1))

    report = {
        "source": {
            "api_rpc_migration": "supabase/migrations/20261117040000_structure_recovery_api.sql",
            "journal_schema_migration": "supabase/migrations/20261117020000_structure_recovery.sql",
            "test": "backend/server/tests/island_sql/test_structure_recovery_journal_budget_sql.py",
            "postgres": database.execute("select version()").fetchone()[0],
        },
        "workload": {
            "synthetic_clients": len(CLIENTS),
            "input_commands": inserted,
            "inputs_per_synthetic_client": INPUTS_PER_ACTOR,
            "assumed_client_command_rate_hz": 4,
            "frozen_maximum_wave_seconds": 900,
            "input_rpc_batch_limit": BATCH_SIZE,
            "page_event_limit": PAGE_SIZE,
            "input_rpc_calls": ingest_calls,
            "joined_participant_events": 3,
            "journal_events": total_events,
        },
        "storage_bytes": {
            "wave_payload_pg_column_size_sum": payload_bytes,
            "wave_event_tuple_pg_column_size_sum": event_tuple_bytes,
            "event_table_plus_indexes_allocated_bytes_scratch_database_wide": total_relation_bytes,
            "allocated_relation_bytes_scratch_database_wide": relation_sizes,
        },
        "paging": {
            "captured_head_seq": fixed_head,
            "sealed_through_tick": watermark,
            "fixed_head_page_count": page_count,
            "mean_page_ms_local": round(sum(page_durations) / len(page_durations) / 1e6, 3),
            "max_page_ms_local": round(max(page_durations) / 1e6, 3),
            "mean_input_batch_rpc_ms_local": round(
                sum(ingest_durations) / len(ingest_durations) / 1e6, 3
            ),
            "p95_input_batch_rpc_ms_local": round(
                sorted(ingest_durations)[int(len(ingest_durations) * 0.95)] / 1e6, 3
            ),
        },
        "theoretical_volume": {
            "one_command_per_client_per_4hz_for_900s": 4 * 4 * 900,
            "full_32_item_batch_per_client_per_4hz_for_900s": 4 * 4 * 900 * BATCH_SIZE,
            "one_process_four_players_full_batch_at_8_write_tokens_per_second_for_900s": (
                4 * (8 * 900 + 12) * BATCH_SIZE
            ),
            "note": (
                "The 4 Hz figures are representative client scenarios. The token-bucket scenario "
                "is per-player in one process and assumes every write token is an input batch."
            ),
        },
        "http_budgets": {
            "write_tokens_per_second_per_player_per_process": 8,
            "write_burst_capacity_per_player_per_process": 12,
            "write_routes": ["inputs", "health"],
            "event_read_tokens_per_second_per_player_per_process": 8,
            "event_read_burst_capacity_per_player_per_process": 8,
            "sql_diagnostic_bypasses_http_buckets": True,
            "note": (
                "Buckets are app-process local, not a durable global or per-wave journal cap; "
                "additional workers have independent buckets."
            ),
        },
        "retention": {
            "automatic_journal_cleanup": False,
            "behavior": (
                "Journal rows are append-only and retained with wave history; no automatic "
                "cleanup or retention cap was found in the current migrations."
            ),
        },
        "limits": [
            (
                "Timing is in-process against disposable local Unix-socket PostgreSQL and "
                "excludes internet/network latency."
            ),
            (
                "Allocated relation/index sizes are scratch-database-wide PostgreSQL relation "
                "sizes, not isolated per-wave index attribution."
            ),
            "The 10k bounded workload is a diagnostic sample, not a production-capacity guarantee.",
            (
                "Local PostgreSQL RPC measurements bypass the per-process HTTP token buckets; "
                "they do not measure HTTP throttling or cross-worker aggregate capacity."
            ),
        ],
    }
    if os.environ.get("WRITE_RECOVERY_DIAGNOSTIC") == "1":
        EVIDENCE.write_text(json.dumps(report, indent=2) + "\n")

    assert report["theoretical_volume"]["one_command_per_client_per_4hz_for_900s"] == 14_400
    assert report["theoretical_volume"]["full_32_item_batch_per_client_per_4hz_for_900s"] == 460_800
