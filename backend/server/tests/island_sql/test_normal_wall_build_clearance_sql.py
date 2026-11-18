"""Fresh normal purchases and real row-lock contention on disposable Unix-socket PostgreSQL."""

import json
import queue
import subprocess
import threading
import time
from pathlib import Path
from uuid import UUID

import pytest

psycopg = pytest.importorskip("psycopg")
from server.island import layout  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    add_players,
    as_owner,
    as_server,
    balance,
    call,
    ledger,
    open_island,
)
from server.tests.island_sql.test_wall_chain_build_sql import OWNER as PRESSURE_OWNER  # noqa: E402
from server.tests.island_sql.test_wall_chain_concurrency_sql import committed_game  # noqa: E402

OWNER, FRIEND = UUID(int=16801), UUID(int=16802)
SAFE, TREE, PROP = (-18.5, -1), (-16, 0), (-2, 12)


def ready(db, policy=0, at=SAFE):
    add_players(db, OWNER, FRIEND)
    open_island(db, OWNER, "NWB68")
    open_island(db, FRIEND, "NWF68")
    as_server(db)
    db.execute(
        "insert into public.island_members(island_owner,player_id,role) values(%s,%s,'member')",
        (OWNER, FRIEND),
    )
    if policy:
        db.execute("insert into public.island_wall_policy values(%s,1,128)", (OWNER,))
    db.execute(
        "insert into public.island_layout(island_owner,plot,x_half,z_half,moved_by) "
        "values(%s,'wall_1',%s,%s,%s)",
        (OWNER, round(at[0] * 2), round(at[1] * 2), OWNER),
    )


def snapshot(db, owner=OWNER):
    return call(db, "select public.island_wall_layout_read(%s)", owner)


def purchase(db, friend=False, *, seen=None, at=None, uid="normal-sql-0001", owner=OWNER):
    raw = snapshot(db, owner) if seen is None else seen
    if at is None:
        rules = layout.island_layout(raw["ruleVersion"] == 1)
        stored = {r["plot"]: (r["x_half"] / 2, r["z_half"] / 2) for r in raw["rows"]}
        at = layout.positions_of(
            rules, stored, wall_rule_version=raw["ruleVersion"], wall_capacity=raw["capacity"]
        )["wall_1"]
    fence = [
        round(at[0] * 2),
        round(at[1] * 2),
        json.dumps(raw["rows"]),
        raw["ruleVersion"],
        raw["capacity"],
    ]
    if friend:
        return call(
            db,
            "select public.island_build(%s,%s,'wall_1','wall',%s,10,%s,%s,%s::jsonb,%s,%s)",
            FRIEND,
            owner,
            uid,
            *fence,
        )
    return call(
        db,
        "select public.islet_build(%s,'wall_1','wall',10::bigint,0,0,%s,%s,%s,%s::jsonb,%s,%s)",
        owner,
        "island:" + uid,
        *fence,
    )


def test_sql_obstacle_catalogue_exactly_matches_the_trusted_source(database):
    expected = json.loads(layout.CONTENT_FILE.read_text())["wallObstacles"]
    as_server(database)
    assert call(database, "select public.island_wall_scenery_obstacles()") == expected
    assert len(expected) == 14
    client = Path(__file__).resolve().parents[4] / "frontend/src/island/wall-obstacles.js"
    actual_client = json.loads(
        subprocess.check_output(
            [
                "node",
                "--input-type=module",
                "-e",
                "const m=await import(process.argv[1]);"
                "process.stdout.write(JSON.stringify(m.WALL_OBSTACLES));",
                client.as_uri(),
            ]
        )
    )
    assert actual_client == expected
    defaults = {
        row[0]: row[2:4]
        for row in json.loads(layout.CONTENT_FILE.read_text())["spots"]
        if row[1] == "wall"
    }
    assert call(database, "select public.island_wall_default_positions()") == defaults


def test_guarded_overloads_are_service_only(database):
    for signature in [
        "public.islet_build(uuid,text,text,bigint,integer,integer,text,integer,integer,jsonb,integer,integer)",
        "public.island_build(uuid,uuid,text,text,text,integer,integer,integer,jsonb,integer,integer)",
        "public.island_wall_single_build(uuid,uuid,text,bigint,text,boolean,integer,integer,jsonb,integer,integer)",
    ]:
        for role in ["anon", "authenticated", "service_role"]:
            assert call(
                database, "select has_function_privilege(%s,%s,'EXECUTE')", role, signature
            ) == (role == "service_role")


@pytest.mark.parametrize("policy", [0, 1])
@pytest.mark.parametrize("friend", [False, True])
@pytest.mark.parametrize("at", [TREE, PROP])
def test_guarded_fresh_normal_purchase_refuses_without_changing_money_or_layout(
    database, policy, friend, at
):
    ready(database, policy, at)
    before = snapshot(database)
    answer = purchase(database, friend)
    assert answer == {"status": "refused", "reason": "place_taken"}
    assert balance(database, FRIEND if friend else OWNER) == 100
    assert snapshot(database)["rows"] == before["rows"]
    assert ledger(database, FRIEND if friend else OWNER, "building_purchase") == []
    assert (
        call(database, "select count(*) from public.islet_buildings where player_id=%s", OWNER) == 0
    )


@pytest.mark.parametrize("policy", [0, 1])
@pytest.mark.parametrize("friend", [False, True])
def test_safe_purchase_and_original_uid_replay_preserve_old_built_overlap(database, policy, friend):
    ready(database, policy)
    answer = purchase(database, friend)
    assert answer["status"] == "done" and balance(database, FRIEND if friend else OWNER) == 90
    database.execute(
        "update public.island_layout set x_half=-32,z_half=0 "
        "where island_owner=%s and plot='wall_1'",
        (OWNER,),
    )
    standing = purchase(database, friend, uid="already-standing-01")
    assert standing["reason"] == ("spot_taken" if friend else "plot_occupied")
    if friend:
        assert purchase(database, True)["repeat"] is True
    else:
        with (
            pytest.raises(psycopg.errors.UniqueViolation, match="already_applied"),
            database.transaction(),
        ):
            purchase(database)
    assert balance(database, FRIEND if friend else OWNER) == 90
    assert len(ledger(database, FRIEND if friend else OWNER, "building_purchase")) == 1
    assert (
        call(
            database,
            "select x_half from public.island_layout where island_owner=%s and plot='wall_1'",
            OWNER,
        )
        == -32
    )


@pytest.mark.parametrize("friend", [False, True])
def test_original_unguarded_signatures_also_cannot_insert_a_fresh_overlapping_wall(
    database, friend
):
    ready(database, 0, TREE)
    with (
        pytest.raises(psycopg.errors.CheckViolation, match="wall_position_check_required"),
        database.transaction(),
    ):
        if friend:
            call(
                database,
                "select public.island_build(%s,%s,'wall_1','wall','direct-wall-01',10)",
                FRIEND,
                OWNER,
            )
        else:
            call(
                database,
                "select public.islet_build(%s,'wall_1','wall',10::bigint,0,0,"
                "'island:direct-wall-01')",
                OWNER,
            )
    assert balance(database, FRIEND if friend else OWNER) == 100
    assert ledger(database, FRIEND if friend else OWNER, "building_purchase") == []


@pytest.mark.parametrize("friend", [False, True])
def test_old_signature_cannot_bypass_effective_legacy_clearance(database, friend):
    ready(database, 0, (-3.5, 4))
    effective = layout.positions_of(layout.island_layout(), {"wall_1": (-3.5, 4)})["wall_1"]
    assert effective == (-3, 3)
    assert call(database, "select public.island_wall_scenery_clear(-3.5,4)") is True
    assert call(database, "select public.island_wall_scenery_clear(-3,3)") is False
    with (
        pytest.raises(psycopg.errors.CheckViolation, match="wall_position_check_required"),
        database.transaction(),
    ):
        if friend:
            call(
                database,
                "select public.island_build(%s,%s,'wall_1','wall','direct-settled-01',10)",
                FRIEND,
                OWNER,
            )
        else:
            call(
                database,
                "select public.islet_build(%s,'wall_1','wall',10::bigint,0,0,"
                "'island:direct-settled-01')",
                OWNER,
            )
    assert balance(database, FRIEND if friend else OWNER) == 100


@pytest.mark.parametrize("friend", [False, True])
def test_failed_payment_rolls_back_fresh_effective_coordinate_materialization(database, friend):
    # This old off-lane raw cell displays at a different canonical legacy lane site.
    ready(database, 0, (-13, -12))
    before = snapshot(database)
    actor = FRIEND if friend else OWNER
    as_owner(database)
    database.execute("update public.wallets set balance=5 where player_id=%s", (actor,))
    as_server(database)
    call(database, "select set_config('app.wall_single_build','outer-context',true)")
    if friend:
        assert purchase(database, True)["reason"] == "insufficient_funds"
    else:
        with (
            pytest.raises(psycopg.errors.RaiseException, match="insufficient_funds"),
            database.transaction(),
        ):
            purchase(database)
    assert snapshot(database)["rows"] == before["rows"]
    assert balance(database, actor) == 5
    assert call(database, "select current_setting('app.wall_single_build',true)") == "outer-context"


@pytest.mark.parametrize("change", ["malformed", "owner", "plot", "xHalf", "ref"])
def test_missing_or_mismatched_transaction_proof_cannot_authorize_a_fresh_wall(database, change):
    ready(database)
    proof = {
        "owner": str(OWNER),
        "payer": str(OWNER),
        "plot": "wall_1",
        "ref": "island:proof-wall-01",
        "xHalf": -37,
        "zHalf": -2,
    }
    if change == "malformed":
        value = "not-json"
    else:
        proof[change] = {
            "owner": str(FRIEND),
            "plot": "wall_2",
            "xHalf": -36,
            "ref": "island:other-proof-01",
        }[change]
        value = json.dumps(proof)
    call(database, "select set_config('app.wall_single_build',%s,true)", value)
    with (
        pytest.raises(psycopg.errors.CheckViolation, match="wall_position_check_required"),
        database.transaction(),
    ):
        call(
            database,
            "select public.islet_build(%s,'wall_1','wall',10::bigint,0,0,'island:proof-wall-01')",
            OWNER,
        )
    assert balance(database, OWNER) == 100


def test_success_restores_prior_proof_and_cannot_authorize_a_later_old_signature(database):
    ready(database)
    call(database, "select set_config('app.wall_single_build','outer-context',true)")
    assert purchase(database)["status"] == "done"
    assert call(database, "select current_setting('app.wall_single_build',true)") == "outer-context"
    with (
        pytest.raises(psycopg.errors.CheckViolation, match="wall_position_check_required"),
        database.transaction(),
    ):
        call(
            database,
            "select public.islet_build(%s,'wall_2','wall',10::bigint,0,0,'island:later-proof-01')",
            OWNER,
        )
    assert balance(database, OWNER) == 90


def test_existing_positioned_batch_context_still_authorizes_an_original_wall(database):
    ready(database, 1)
    epoch = UUID(int=16803)
    database.execute(
        "insert into public.island_recovery_state(island_owner,reset_epoch) values(%s,%s) "
        "on conflict(island_owner) do update set reset_epoch=excluded.reset_epoch",
        (OWNER, epoch),
    )
    before = snapshot(database)
    call(database, "select set_config('app.wall_single_build','outer-context',true)")
    intent = {
        "placements": [{"spot": "wall_1", "x": SAFE[0], "z": SAFE[1]}],
        "quotedTotal": 10,
        "islandEpoch": str(epoch),
    }
    items = [{"spot": "wall_1", "x_half": -37, "z_half": -2, "price": 10}]
    answer = call(
        database,
        "select public.island_wall_build(%s,%s,'normal-batch-01',%s::jsonb,"
        "%s::jsonb,%s::jsonb,null,0)",
        OWNER,
        OWNER,
        json.dumps(intent),
        json.dumps(items),
        json.dumps(before["rows"]),
    )
    assert answer["status"] == "done" and balance(database, OWNER) == 90
    assert call(database, "select current_setting('app.wall_single_build',true)") == "outer-context"
    assert call(database, "select current_setting('app.positioned_wall_build',true)") in (None, "")


def test_checked_policy_and_complete_raw_layout_are_both_fenced(database):
    ready(database)
    before = snapshot(database)
    database.execute(
        "insert into public.island_layout(island_owner,plot,x_half,z_half,moved_by) "
        "values(%s,'cannon_1',-20,-20,%s)",
        (OWNER, OWNER),
    )
    assert purchase(database, seen=before)["reason"] == "busy"
    fresh = snapshot(database)
    database.execute("insert into public.island_wall_policy values(%s,1,128)", (OWNER,))
    assert purchase(database, seen=fresh)["reason"] == "busy"
    assert balance(database, OWNER) == 100 and ledger(database, OWNER, "building_purchase") == []


@pytest.mark.parametrize("friend", [False, True])
def test_successful_legacy_purchase_materializes_only_its_checked_effective_cell(database, friend):
    ready(database, 0, (-13, -12))
    before = snapshot(database)
    rules = layout.island_layout()
    expected = layout.positions_of(rules, {"wall_1": (-13, -12)})["wall_1"]
    assert expected != (-13, -12)
    assert purchase(database, friend)["status"] == "done"
    after = snapshot(database)
    assert len(after["rows"]) == len(before["rows"]) == 1
    assert (after["rows"][0]["x_half"] / 2, after["rows"][0]["z_half"] / 2) == expected


@pytest.mark.parametrize("policy", [0, 1])
@pytest.mark.parametrize("friend", [False, True])
def test_default_purchase_keeps_absent_layout_rows_absent(database, policy, friend):
    ready(database, policy)
    database.execute("delete from public.island_layout where island_owner=%s", (OWNER,))
    assert snapshot(database)["rows"] == []
    assert purchase(database, friend)["status"] == "done"
    assert snapshot(database)["rows"] == []


@pytest.mark.parametrize("policy", [0, 1])
@pytest.mark.parametrize("friend", [False, True])
def test_matching_saved_cell_keeps_its_metadata_exactly(database, policy, friend):
    ready(database, policy)
    as_owner(database)
    database.execute(
        "update public.island_layout set moved_by=%s,moved_at=now()-interval '2 days' "
        "where island_owner=%s",
        (FRIEND, OWNER),
    )
    before = database.execute(
        "select x_half,z_half,moved_by,moved_at from public.island_layout where island_owner=%s",
        (OWNER,),
    ).fetchone()
    as_server(database)
    assert purchase(database, friend)["status"] == "done"
    after = database.execute(
        "select x_half,z_half,moved_by,moved_at from public.island_layout where island_owner=%s",
        (OWNER,),
    ).fetchone()
    assert after == before


def test_real_owner_lock_wait_rechecks_the_snapshot_after_a_concurrent_change(scratch_server):
    with committed_game(scratch_server) as uri:
        results, started = queue.Queue(), queue.Queue()

        def worker():
            try:
                with psycopg.connect(uri) as db:
                    as_server(db)
                    db.execute("set local statement_timeout='8s'")
                    started.put(call(db, "select pg_backend_pid()"))
                    result = purchase(
                        db,
                        seen={"rows": [], "ruleVersion": 1, "capacity": 128},
                        at=SAFE,
                        owner=PRESSURE_OWNER,
                    )
                results.put(result)
            except Exception as error:
                results.put(error)

        thread = threading.Thread(target=worker)
        with psycopg.connect(uri) as blocker:
            blocker.execute(
                "select 1 from public.islands where player_id=%s for update", (PRESSURE_OWNER,)
            )
            try:
                thread.start()
                pid = started.get(timeout=5)
                with psycopg.connect(uri, autocommit=True) as probe:
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        if call(
                            probe,
                            "select wait_event_type='Lock' from pg_stat_activity where pid=%s",
                            pid,
                        ):
                            break
                        time.sleep(0.01)
                    else:
                        pytest.fail("The real purchase must wait for the owner row.")
                blocker.execute(
                    "insert into public.island_layout(island_owner,plot,x_half,z_half,moved_by) "
                    "values(%s,'cannon_1',-20,-20,%s)",
                    (PRESSURE_OWNER, PRESSURE_OWNER),
                )
                blocker.commit()
            finally:
                blocker.rollback()
                thread.join(timeout=10)
                if thread.is_alive():
                    with psycopg.connect(uri, autocommit=True) as cancel:
                        call(cancel, "select pg_cancel_backend(%s)", pid)
                    thread.join(timeout=3)
                assert not thread.is_alive()
        answer = results.get_nowait()
        assert answer == {"status": "refused", "reason": "busy"}, answer
        with psycopg.connect(uri) as db:
            assert balance(db, PRESSURE_OWNER) == 100
            assert ledger(db, PRESSURE_OWNER, "building_purchase") == []
