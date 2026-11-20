"""Personal progress, global assignment and Engineer generations on disposable PostgreSQL.

Uses the opt-in full migration chain, applied twice, with synthetic players only.
Private hooks are exercised as their owning SQL domain transaction, never as browser RPCs.
"""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island  # noqa: E402
from server.island.personal_captain import configuration, read_profile  # noqa: E402
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, ready, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_owner,
    as_server,
    balance,
    move_start,
    open_island,
    start,
)
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    finish as legacy_finish,
)

RULES = configuration(load_island())


def initialized(connection, *, won=4, level=4, role="engineer", skills=None):
    owner, member, outsider, treasury = ready(connection)
    as_owner(connection)
    connection.execute(
        "update public.islands set wave_best=80,won_wave_best=%s,captain_level=%s,"
        "captain_role=%s,captain_skills=%s where player_id=%s",
        (won, level, role, skills if skills is not None else ["steady_aim"], owner),
    )
    as_server(connection)
    value = rpc(connection, "personal_captain_initialize", owner, owner,
                keys(treasury)[1], Jsonb(RULES))
    read_profile(value)
    return owner, member, outsider, treasury, value


def view(connection, player):
    as_server(connection)
    value = rpc(connection, "personal_captain_read", player)
    return read_profile(value)


def private(connection, name, *arguments):
    as_owner(connection)
    return rpc(connection, name, *arguments)


def edit(connection, player, action, value=None, uid=None, expected=None):
    revision = expected if expected is not None else view(connection, player)["captain"]["revision"]
    as_server(connection)
    return rpc(connection, "personal_captain_change", player, uid or uuid4().hex,
               action, value, revision)


def attach(connection, player, wave=None, played=6):
    wave = wave or uuid4()
    frozen = private(connection, "personal_captain_attach_wave_locked", player, wave, played)
    return wave, frozen


def finish(connection, player, wave, frozen, *, played=6, outcome="won", confirmed=True):
    return private(connection, "personal_captain_complete_locked", player, wave, played,
                   outcome, confirmed, frozen["engineerCommitmentId"])


def test_import_preserves_acquired_entitlement_but_never_uses_owned_island_best(database):
    owner, _, _, treasury, first = initialized(database)
    assert first["captain"]["level"] == 4
    assert first["captain"]["personalBestWave"] == 4
    assert first["skills"] == {"earned": 2, "spent": 1, "points": 1,
                               "known": ["steady_aim"], "role": "engineer"}
    wallet = balance(database, owner)
    as_owner(database)
    database.execute("update public.islands set won_wave_best=70 where player_id=%s", (owner,))
    as_server(database)
    repeated = rpc(database, "personal_captain_initialize", owner, owner,
                   keys(treasury)[1], Jsonb(RULES))
    assert repeated == first
    assert balance(database, owner) == wallet


def test_initialize_requires_shared_mode_and_current_member_epoch(database):
    owner, member, outsider, treasury = ready(database, admitted=False)
    as_server(database)
    refused = rpc(database, "personal_captain_initialize", owner, owner, uuid4(), Jsonb(RULES))
    assert refused["reason"] == "economy_context_required"
    treasury = rpc(database, "island_treasury_admit", owner, owner, "admit001", 200)
    assert rpc(database, "personal_captain_initialize", owner, owner,
               uuid4(), Jsonb(RULES))["reason"] == "economy_epoch_mismatch"
    assert rpc(database, "personal_captain_initialize", outsider, owner,
               keys(treasury)[1], Jsonb(RULES))["reason"] == "not_member"
    assert rpc(database, "personal_captain_initialize", member, owner,
               keys(treasury)[1], Jsonb(RULES))["captain"]["personalBestWave"] == 0


def test_free_respec_and_role_selection_never_charge_coins(database):
    owner, _, _, _, _ = initialized(database)
    wallet = balance(database, owner)
    cleared = edit(database, owner, "respec", uid="respec01")
    assert cleared["profile"]["skills"]["points"] == 2
    assert cleared["profile"]["captain"]["role"] is None
    edit(database, owner, "role", "medic")
    revision = view(database, owner)["captain"]["revision"]
    learned = edit(database, owner, "learn", "steady_aim", uid="learn001", expected=revision)
    assert learned["profile"]["skills"]["points"] == 1
    assert edit(database, owner, "learn", "steady_aim", uid="learn001",
                expected=revision)["repeat"] is True
    assert edit(database, owner, "learn", "cutlass", uid="learn001",
                expected=revision)["reason"] == "action_conflict"
    assert balance(database, owner) == wallet


def test_new_adoption_cannot_ignore_a_personal_wave_on_another_legacy_island(database):
    owner, member, _, treasury = ready(database)
    open_island(database, member, "P6W8X")
    start(database, member, "legacy01", owner=member)
    as_server(database)
    result = rpc(database, "personal_captain_initialize", member, owner,
                 keys(treasury)[1], Jsonb(RULES))
    assert result["reason"] == "captain_conversion_required"
    assert rpc(database, "personal_captain_context", member) == {"status": "legacy"}


def test_stale_profile_revision_and_old_unversioned_mutation_cannot_apply(database):
    owner, _, _, _, initial = initialized(database)
    revision = initial["captain"]["revision"]
    edit(database, owner, "respec", expected=revision)
    assert edit(database, owner, "role", "medic", expected=revision)["reason"] == (
        "captain_revision_mismatch"
    )
    as_owner(database)
    signature = "public.personal_captain_change(uuid,text,text,text)"
    assert database.execute(
        "select has_function_privilege('service_role',%s,'execute')", (signature,),
    ).fetchone() == (False,)


def test_unadopted_personal_profile_refuses_new_edit_without_import(database):
    _, member, _, _ = ready(database)
    as_server(database)
    result = rpc(database, "personal_captain_change", member, "profile01", "respec", None, "0")
    assert result == {"status": "refused", "reason": "captain_context_required"}
    assert rpc(database, "personal_captain_context", member) == {"status": "legacy"}


def test_pending_engineer_is_one_generation_and_skill_respec_keeps_role(database):
    owner, _, _, _, _ = initialized(database)
    first = private(database, "personal_captain_bind_engineer_locked", owner)
    assert private(database, "personal_captain_bind_engineer_locked", owner) == first
    assert edit(database, owner, "role", "medic")["reason"] == "engineer_bound"
    respec = edit(database, owner, "respec")["profile"]
    assert respec["captain"]["role"] == "engineer"
    assert respec["captain"]["canRespec"] is True
    assert respec["skills"]["points"] == 2
    assert respec["captain"]["engineerCommitment"]["id"] == str(first)


def test_personal_mode_and_legacy_guard_are_global_not_the_viewed_islands_mode(database):
    owner, member, _, _, _ = initialized(database)
    as_server(database)
    assert rpc(database, "personal_captain_context", owner)["captain"]["progressionVersion"] == 1
    assert rpc(database, "personal_captain_context", member) == {"status": "legacy"}
    with pytest.raises(psycopg.Error, match="personal_captain_managed"), database.transaction():
        private(database, "personal_captain_legacy_guard_locked", owner)
    private(database, "personal_captain_legacy_guard_locked", member)
    as_server(database)
    assert rpc(database, "personal_captain_context", member) == {"status": "legacy"}


def test_retired_acquired_skills_keep_their_real_point_cost_without_new_effects(database):
    owner, _, _, _, initial = initialized(database, skills=["quick_fix"])
    assert initial["skills"]["known"] == ["quick_fix"]
    assert initial["skills"]["spent"] == 1
    wave, frozen = attach(database, owner)
    assert frozen["activeSkills"] == []
    finish(database, owner, wave, frozen, outcome="lost")
    assert edit(database, owner, "respec")["profile"]["skills"]["points"] == 2
    assert edit(database, owner, "learn", "quick_fix")["reason"] == "retired_skill"


def test_assignment_is_global_and_frozen_state_survives_late_progress(database):
    owner, _, _, _, _ = initialized(database)
    private(database, "personal_captain_bind_engineer_locked", owner)
    wave, frozen = attach(database, owner, played=8)
    assert edit(database, owner, "respec")["reason"] == "captain_assigned"
    with pytest.raises(psycopg.Error, match="captain_assigned"), database.transaction():
        attach(database, owner, played=2)
    finish(database, owner, wave, frozen, played=8)
    current = view(database, owner)
    assert current["captain"]["level"] == 5
    assert current["skills"]["earned"] == 4
    as_owner(database)
    assert database.execute(
        "select profile from public.personal_captain_wave_snapshots "
        "where player_id=%s and wave_id=%s", (owner, wave),
    ).fetchone()[0]["captain"]["level"] == 4


@pytest.mark.parametrize("outcome,confirmed", [
    ("won", False), ("lost", False), ("abandoned", True), ("expired", True),
])
def test_no_participation_or_non_normal_outcome_never_satisfies_engineer(
    database, outcome, confirmed,
):
    owner, _, _, _, _ = initialized(database)
    generation = private(database, "personal_captain_bind_engineer_locked", owner)
    wave, frozen = attach(database, owner)
    finish(database, owner, wave, frozen, outcome=outcome, confirmed=confirmed)
    current = view(database, owner)
    assert current["captain"]["engineerCommitment"]["id"] == str(generation)
    assert current["captain"]["assignmentWaveId"] is None
    assert current["skills"]["earned"] == 2


def test_normal_defeat_satisfies_engineer_but_never_grants_win_points(database):
    owner, _, _, _, _ = initialized(database)
    private(database, "personal_captain_bind_engineer_locked", owner)
    wave, frozen = attach(database, owner)
    finish(database, owner, wave, frozen, outcome="lost")
    current = view(database, owner)
    assert current["captain"]["engineerCommitment"] is None
    assert current["skills"]["earned"] == 2


def test_late_c1_completion_cannot_clear_a_new_c2_generation(database):
    owner, _, _, _, _ = initialized(database)
    c1 = private(database, "personal_captain_bind_engineer_locked", owner)
    first_wave, first = attach(database, owner)
    private(database, "personal_captain_release_assignment_locked", owner, first_wave)
    second_wave, second = attach(database, owner)
    private(database, "personal_captain_release_assignment_locked", owner, second_wave)
    finish(database, owner, first_wave, first, outcome="lost")
    c2 = private(database, "personal_captain_bind_engineer_locked", owner)
    assert c2 != c1
    finish(database, owner, second_wave, second, outcome="lost")
    assert view(database, owner)["captain"]["engineerCommitment"]["id"] == str(c2)


def test_purchase_after_withdrawal_rotates_before_the_old_wave_finishes(database):
    owner, _, _, _, _ = initialized(database)
    c1 = private(database, "personal_captain_bind_engineer_locked", owner)
    wave, frozen = attach(database, owner)
    private(database, "personal_captain_release_assignment_locked", owner, wave)
    attached = view(database, owner)["captain"]
    assert attached["assignmentWaveId"] is None
    assert attached["engineerCommitment"]["state"] == "attached"
    c2 = private(database, "personal_captain_bind_engineer_locked", owner)
    assert c1 != c2
    assert private(database, "personal_captain_bind_engineer_locked", owner) == c2
    finish(database, owner, wave, frozen, outcome="lost")
    current = view(database, owner)["captain"]["engineerCommitment"]
    assert current == {"id": str(c2), "state": "pending", "waveId": None}


def test_old_completion_does_not_release_a_different_current_assignment(database):
    owner, _, _, _, _ = initialized(database)
    private(database, "personal_captain_bind_engineer_locked", owner)
    first_wave, first = attach(database, owner)
    private(database, "personal_captain_release_assignment_locked", owner, first_wave)
    second_wave, second = attach(database, owner)
    finish(database, owner, first_wave, first, outcome="lost")
    current = view(database, owner)["captain"]
    assert current["engineerCommitment"] is None
    assert current["assignmentWaveId"] == str(second_wave)
    assert current["canRespec"] is False
    finish(database, owner, second_wave, second, outcome="lost")
    assert view(database, owner)["captain"]["assignmentWaveId"] is None


def test_completion_and_milestone_replays_cannot_grant_more_points(database):
    owner, _, _, _, _ = initialized(database)
    wave, frozen = attach(database, owner)
    assert finish(database, owner, wave, frozen)["repeat"] is False
    assert finish(database, owner, wave, frozen)["repeat"] is True
    assert view(database, owner)["skills"]["earned"] == 3
    next_wave, next_frozen = attach(database, owner)
    finish(database, owner, next_wave, next_frozen)
    assert view(database, owner)["skills"]["earned"] == 3
    with pytest.raises(psycopg.Error, match="completion_conflict"), database.transaction():
        finish(database, owner, wave, frozen, outcome="lost")


def test_private_hooks_have_no_browser_or_standalone_service_capability(database):
    signature = "public.personal_captain_bind_engineer_locked(uuid)"
    assert database.execute(
        "select has_function_privilege('anon',%s,'execute'),"
        "has_function_privilege('authenticated',%s,'execute'),"
        "has_function_privilege('service_role',%s,'execute')",
        (signature, signature, signature),
    ).fetchone() == (False, False, False)
    assert database.execute(
        "select has_table_privilege('service_role',"
        "'public.personal_captain_profiles','update')",
    ).fetchone() == (False,)


def test_parallel_respec_and_discount_binding_cannot_leave_a_non_engineer_bound(
    database, scratch_server,
):
    owner, _, _, _, _ = initialized(database)
    database.commit()
    barrier = Barrier(2)

    def execute(binding):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            barrier.wait(timeout=10)
            try:
                if binding:
                    private(connection, "personal_captain_bind_engineer_locked", owner)
                else:
                    edit(connection, owner, "respec")
                return "done"
            except psycopg.Error as error:
                assert "engineer_required" in str(error)
                return "not_engineer"

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(execute, [True, False]))
    assert "done" in results
    current = view(database, owner)["captain"]
    assert current["engineerCommitment"] is None or current["role"] == "engineer"


def test_personal_freeze_and_real_legacy_finish_do_not_deadlock_on_profile_foreign_key(
    database, scratch_server,
):
    owner, member, _, _ = ready(database, admitted=False)
    # Close a real preconversion personal wave with the owner's participation unpaid.
    open_island(database, member, "P6W8X")
    rpc(database, "game_join", owner, member, 10)
    wave = start(database, member, "legacy01", owner=member)
    rpc(database, "wave_join", owner, wave["waveId"])
    move_start(database, wave["waveId"], 30)
    assert legacy_finish(database, member, wave["waveId"])["loot"] > 0
    treasury = rpc(database, "island_treasury_admit", owner, owner, "admit0001", 200)
    rpc(database, "personal_captain_initialize", owner, owner,
        keys(treasury)[1], Jsonb(RULES))
    database.commit()
    barrier = Barrier(2)

    def finish_old():
        with psycopg.connect(scratch_server.get_uri()) as connection:
            connection.execute("set local statement_timeout='5s'")
            connection.execute(
                "select 1 from public.wallets where player_id=%s for update", (owner,),
            )
            connection.execute(
                "select 1 from public.islands where player_id=%s for update", (member,),
            )
            barrier.wait(timeout=10)
            result = legacy_finish(connection, owner, wave["waveId"])
            assert result["status"] == "done" and result["loot"] > 0

    def freeze_personal():
        with psycopg.connect(scratch_server.get_uri()) as connection:
            connection.execute("set local statement_timeout='5s'")
            private(connection, "personal_captain_lock_state_locked", owner)
            barrier.wait(timeout=10)
            connection.execute(
                "select 1 from public.islands where player_id=%s for update", (member,),
            )

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(finish_old), pool.submit(freeze_personal)]
        for future in futures:
            future.result(timeout=15)
