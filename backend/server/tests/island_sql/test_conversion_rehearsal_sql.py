"""Populated conversion rehearsal on disposable PostgreSQL, never a production converter.

The exported facts and policy are synthetic. Existing admission/Captain/financial
functions and the full migration chain run; the outer composition is TEST ONLY.
"""

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Event
from time import monotonic

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.conversion_rehearsal_helpers import (  # noqa: E402
    inventory,
    rehearse,
    synthetic_case,
)
from server.tests.island_sql.test_island_treasury_sql import keys, rpc, settle  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import as_owner, as_server  # noqa: E402
from server.tests.island_sql.test_shared_arsenal_sql import change  # noqa: E402
from tools.economy.conversion import preview  # noqa: E402


@pytest.fixture
def populated_database(scratch_server):
    with psycopg.connect(scratch_server.get_uri(), autocommit=True) as connection:
        with connection.transaction():
            case = synthetic_case(connection)
        with connection.transaction():
            facts = inventory(connection, case)
        yield connection, case, facts


def amounts(connection, owners):
    return connection.execute(
        "select balance_coins,committed_coins from public.island_economy_accounts "
        "where island_owner=any(%s::uuid[]) and state='active' order by island_owner",
        (owners,),
    ).fetchall()


def assert_surviving_captain(connection, actor):
    with connection.transaction():
        as_server(connection)
        profile = rpc(connection, "personal_captain_read", actor)
        assert profile["captain"]["level"] == 4 and profile["skills"]["points"] == 1
        assert set(profile["skills"]["known"]) == {"steady_aim", "cutlass", "quick_fix"}
    as_owner(connection)
    assert connection.execute(
        "select balance from public.wallets where player_id=%s", (actor,)
    ).fetchone() == (10,)


def test_populated_two_island_rehearsal_preserves_entitlements_and_repeats_once(populated_database):
    connection, case, facts = populated_database
    before = deepcopy(facts)
    result = rehearse(connection, case, facts, case["policy"])
    assert result["repeat"] is False
    assert rehearse(connection, case, facts, case["policy"])["repeat"] is True
    assert facts == before
    assert amounts(connection, case["owners"]) == [(200, 0), (200, 0)]
    assert amounts(connection, [case["players"][-1]]) == [(200, 0)]
    for player in facts["players"]:
        assert connection.execute(
            "select balance from public.wallets where player_id=%s", (player["playerId"],)
        ).fetchone() == (int(player["walletCoins"]),)
    for owner in case["owners"]:
        as_server(connection)
        profile = rpc(connection, "personal_captain_read", owner)
        assert profile["captain"]["level"] == 4
        assert profile["captain"]["personalBestWave"] == 8
        assert profile["skills"]["earned"] == 4 and profile["skills"]["points"] == 1
        assert set(profile["skills"]["known"]) == {"steady_aim", "cutlass", "quick_fix"}
        if owner == case["owners"][0]:
            assert profile["captain"]["engineerCommitment"]["id"] == case["commitment"]
    as_owner(connection)
    original_ids = sorted(copy["copyId"] for copy in facts["islands"][0]["copies"])
    stored_ids = sorted(
        str(row[0])
        for row in connection.execute(
            "select id from public.arsenal_copies where island_owner=%s",
            (case["owners"][0],),
        ).fetchall()
    )
    # Snapshot order follows the fixture owner, independent of UUID sort order in the report.
    assert stored_ids == original_ids and len(stored_ids) == 22
    owner = case["owners"][0]
    account, epoch = connection.execute(
        "select current_account_id,run_epoch "
        "from public.island_economy_state where island_owner=%s",
        (owner,),
    ).fetchone()
    assert rpc(connection, "island_construction_refund", account, case["instance"], 1) == 45
    initial = {
        "currentEconomy": {
            "islandOwner": str(owner),
            "accountId": str(account),
            "runEpoch": str(epoch),
        }
    }
    as_server(connection)
    assert change(connection, owner, initial, uid="overflow001")["reason"] == "arsenal_full"
    assert rpc(
        connection,
        "island_demolish",
        owner,
        owner,
        "cannon_1",
        "oldrefund001",
        Jsonb({"cannon": [100]}),
    ) == {
        "status": "refused",
        "reason": "economy_context_required",
    }
    as_owner(connection)
    assert connection.execute(
        "select x_half,z_half from public.island_layout where island_owner=%s and plot='cannon_1'",
        (owner,),
    ).fetchone() == (7, -3)
    assert connection.execute(
        "select crew_carpenter from public.islands where player_id=%s", (owner,)
    ).fetchone() == (2,)
    assert connection.execute(
        "select crew_gunner,crew_carpenter,crew_lookout,crew_guard "
        "from public.islands where player_id=%s",
        (owner,),
    ).fetchone() == (3, 2, 1, 1)
    assert connection.execute(
        "select choice_2 from public.island_research where island_owner=%s and branch='wall'",
        (owner,),
    ).fetchone() == ("mason_drill",)
    changed = deepcopy(case["policy"])
    changed["openingGrantCoins"] = "201"
    with pytest.raises(ValueError, match="manifest_conflict"):
        rehearse(connection, case, facts, changed)
    as_owner(connection)
    assert amounts(connection, case["owners"]) == [(200, 0), (200, 0)]


@pytest.mark.parametrize("stage", ["grant", "assets"])
def test_failure_after_real_changes_rolls_back_everything_then_retry_succeeds(
    populated_database, stage
):
    connection, case, facts = populated_database
    with pytest.raises(ValueError, match="synthetic_failure_after_" + stage):
        rehearse(connection, case, facts, case["policy"], **{"fail_after_" + stage: True})
    assert connection.execute(
        "select count(*) from public.island_economy_state where island_owner=any(%s::uuid[])",
        (case["owners"],),
    ).fetchone() == (0,)
    assert connection.execute(
        "select count(*) from conversion_rehearsal.receipts where policy_id=%s",
        (case["policy"]["policyId"],),
    ).fetchone() == (0,)
    assert connection.execute(
        "select count(*) from public.personal_captain_profiles where player_id=any(%s::uuid[])",
        (case["owners"],),
    ).fetchone() == (1,)
    assert connection.execute(
        "select count(*) from public.arsenal_copies where island_owner=%s "
        "and economy_account_id is not null",
        (case["owners"][0],),
    ).fetchone() == (0,)
    assert connection.execute(
        "select count(*) from public.island_construction_payments "
        "where island_owner=any(%s::uuid[])",
        (case["owners"],),
    ).fetchone() == (0,)
    assert rehearse(connection, case, facts, case["policy"])["repeat"] is False


def test_actual_changed_wallet_invalidates_manifest_without_partial_admission(populated_database):
    connection, case, facts = populated_database
    with connection.transaction():
        as_server(connection)
        rpc(
            connection,
            "apply_wallet_transaction",
            case["players"][0],
            7,
            "admin_adjust",
            "later001",
        )
    with pytest.raises(ValueError, match="stale_snapshot"):
        rehearse(connection, case, facts, case["policy"])
    assert connection.execute(
        "select count(*) from public.island_economy_state where island_owner=any(%s::uuid[])",
        (case["owners"],),
    ).fetchone() == (0,)


def test_retired_old_shared_hold_settles_only_its_original_account(populated_database):
    connection, case, facts = populated_database
    report = preview(facts, case["policy"])
    assert report["status"] == "ready_for_rehearsal"
    assert report["preserved"]["obligations"] == facts["obligations"]
    rehearse(connection, case, facts, case["policy"])
    with connection.transaction():
        as_server(connection)
        paid = settle(connection, case["oldHold"], 60, uid="latepay001", reference="old:late")
        repeated = settle(connection, case["oldHold"], 60, uid="latepay001", reference="old:late")
        assert paid["repeat"] is False and repeated["repeat"] is True
    as_owner(connection)
    assert connection.execute(
        "select balance_coins,committed_coins from public.island_economy_accounts where id=%s",
        (keys(case["oldTreasury"])[0],),
    ).fetchone() == (130, 0)
    assert amounts(connection, case["owners"]) == [(200, 0), (200, 0)]
    assert amounts(connection, [case["players"][-1]]) == [(200, 0)]
    for player in facts["players"]:
        assert connection.execute(
            "select balance from public.wallets where player_id=%s", (player["playerId"],)
        ).fetchone() == (int(player["walletCoins"]),)


def test_parallel_same_manifest_creates_one_receipt_and_one_grant_per_island(
    populated_database,
    scratch_server,
):
    observer, case, facts = populated_database

    def convert():
        with psycopg.connect(scratch_server.get_uri(), autocommit=True) as connection:
            return rehearse(connection, case, facts, case["policy"])

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: convert(), range(2)))
    assert sorted(row["repeat"] for row in results) == [False, True]
    assert observer.execute(
        "select count(*) from conversion_rehearsal.receipts where policy_id=%s",
        (case["policy"]["policyId"],),
    ).fetchone() == (1,)
    assert amounts(observer, case["owners"]) == [(200, 0), (200, 0)]


def test_conversion_and_owner_deletion_serialize_without_losing_other_captains(
    populated_database,
    scratch_server,
):
    observer, case, facts = populated_database
    locked, release, deleting = Event(), Event(), Event()
    deletion_pid = []

    def pause():
        locked.set()
        assert release.wait(10), "test did not release conversion"

    def convert():
        with psycopg.connect(scratch_server.get_uri(), autocommit=True) as connection:
            return rehearse(connection, case, facts, case["policy"], after_locks=pause)

    def delete():
        with psycopg.connect(scratch_server.get_uri(), autocommit=True) as connection:
            with connection.transaction():
                as_server(connection)
                deletion_pid.append(connection.info.backend_pid)
                deleting.set()
                return rpc(connection, "island_lifecycle_delete_player", case["owners"][0], True)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(convert)
        assert locked.wait(10)
        second = pool.submit(delete)
        assert deleting.wait(10)
        deadline = monotonic() + 5
        while monotonic() < deadline:
            if observer.execute("select pg_blocking_pids(%s)", (deletion_pid[0],)).fetchone()[0]:
                break
            release.wait(0.01)
        else:
            release.set()
            pytest.fail("owner deletion did not wait on conversion's shared scope")
        release.set()
        assert first.result(timeout=15)["repeat"] is False
        assert second.result(timeout=15) == {"status": "deleted"}
    assert observer.execute(
        "select count(*) from public.islands where player_id=%s", (case["owners"][0],)
    ).fetchone() == (0,)
    assert_surviving_captain(observer, case["owners"][1])


def test_cleanup_without_owner_confirmation_preserves_the_admitted_cohort(populated_database):
    connection, case, facts = populated_database
    rehearse(connection, case, facts, case["policy"])
    with connection.transaction():
        as_server(connection)
        refused = rpc(connection, "island_lifecycle_delete_player", case["owners"][0], False)
        assert refused == {"status": "refused", "reason": "owned_island_confirmation_required"}
    as_owner(connection)
    assert amounts(connection, case["owners"]) == [(200, 0), (200, 0)]
    assert_surviving_captain(connection, case["owners"][1])


def test_deletion_wins_before_manifest_apply_and_leaves_no_new_grant(populated_database):
    connection, case, facts = populated_database
    with connection.transaction():
        as_server(connection)
        assert rpc(connection, "island_lifecycle_delete_player", case["owners"][0], True) == {
            "status": "deleted",
        }
    with pytest.raises(ValueError, match="source_actor_deleted"):
        rehearse(connection, case, facts, case["policy"])
    as_owner(connection)
    assert connection.execute(
        "select count(*) from public.island_economy_accounts where island_owner=any(%s::uuid[])",
        (case["owners"],),
    ).fetchone() == (0,)


@pytest.mark.parametrize("column", ["crew_gunner", "crew_carpenter", "crew_lookout", "crew_guard"])
def test_every_saved_crew_count_change_invalidates_reviewed_source(populated_database, column):
    connection, case, facts = populated_database
    # Parametrized identifiers are a fixed test-owned allowlist, not external input.
    connection.execute(
        f"update public.islands set {column}={column}+1 where player_id=%s", (case["owners"][0],)
    )
    with pytest.raises(ValueError, match="stale_snapshot"):
        rehearse(connection, case, facts, case["policy"])
    assert amounts(connection, case["owners"]) == []


@pytest.mark.parametrize(
    "column,value", [("weapons_owned", ["musket", "pistols"]), ("weapon_equipped", "pistols")]
)
def test_actual_residual_personal_weapon_state_blocks_and_changes_hash(
    populated_database,
    column,
    value,
):
    connection, case, facts = populated_database
    if column == "weapon_equipped":
        # An equipped item must be owned. This unresolved legacy state already
        # blocks admission; changing only its equipped choice must still hash.
        connection.execute(
            "update public.islands set weapons_owned=%s where player_id=%s",
            (["musket", "pistols"], case["owners"][0]),
        )
        with connection.transaction():
            facts = inventory(connection, case)
    original = preview(facts, case["policy"])
    connection.execute(
        f"update public.islands set {column}=%s where player_id=%s", (value, case["owners"][0])
    )
    with connection.transaction():
        current = inventory(connection, case)
    report = preview(current, case["policy"])
    assert report["snapshotSha256"] != original["snapshotSha256"]
    assert report["status"] == "blocked"
    assert "unmapped_weapon" in {row["code"] for row in report["findings"]}
    expected = "blocked_manifest" if column == "weapon_equipped" else "stale_snapshot"
    with pytest.raises(ValueError, match=expected):
        rehearse(connection, case, facts, case["policy"])
    assert amounts(connection, case["owners"]) == []
