"""Real canonical read provider with owner-seeded facts; no lifecycle/auth claim."""

from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.economy_test_authority import (  # noqa: E402
    FIXTURE_SQL,
    authority_definition,
    authority_outage,
    configure_test_authority,
    install_test_authority,
)
from server.tests.island_sql.test_island_treasury_sql import as_owner, ready, rpc  # noqa: E402


def test_canonical_provider_returns_exact_contract_fields_and_explicit_nulls(database):
    owner, member, _, _ = ready(database)
    as_owner(database)
    install_test_authority(database)
    configure_test_authority(database, member, owner)
    assert rpc(database, "island_economy_authority", member, owner) == {
        "actor_id": str(member), "island_owner": str(owner), "is_member": True,
        "reservation_id": None, "session_leader_id": None, "actor_assignment_wave_id": None,
    }


def test_real_provider_follows_departure_without_fixture_reconfiguration(database):
    owner, member, _, _ = ready(database)
    configure_test_authority(database, member, owner)
    assert rpc(database, "game_leave", member, owner)["status"] == "left"
    assert rpc(database, "island_economy_authority", member, owner)["is_member"] is False


def test_fact_setup_does_not_grant_membership_to_an_uninvited_actor(database):
    owner, _, outsider, _ = ready(database)
    configure_test_authority(database, outsider, owner)
    assert rpc(database, "island_economy_authority", outsider, owner)["is_member"] is False


def test_real_provider_reads_seeded_phase_lease_and_personal_assignment(database):
    owner, member, _, _ = ready(database)
    wave = uuid4()
    before = authority_definition(database)
    configure_test_authority(database, member, owner, reservation_id=wave,
                             session_leader_id=owner, actor_assignment_wave_id=wave)
    row = rpc(database, "island_economy_authority", member, owner)
    assert row["reservation_id"] == row["actor_assignment_wave_id"] == str(wave)
    assert row["session_leader_id"] == str(owner)
    assert authority_definition(database) == before
    assert database.execute("select to_regnamespace('mp_eco_test'), "
                            "to_regnamespace('arsenal_test')").fetchone() == (None, None)
    configure_test_authority(database, member, owner)
    idle = rpc(database, "island_economy_authority", member, owner)
    assert (idle["reservation_id"] is idle["session_leader_id"]
            is idle["actor_assignment_wave_id"] is None)
    assert database.execute("select count(*) from public.island_wave_accounting "
                            "where wave_id=%s", (wave,)).fetchone() == (1,)
    assert authority_definition(database) == before


def test_unconfigured_real_provider_reads_idle_facts_without_invented_phase(database):
    owner, member, _, _ = ready(database)
    row = rpc(database, "island_economy_authority", member, owner)
    assert (row["reservation_id"] is row["session_leader_id"]
            is row["actor_assignment_wave_id"] is None)


def test_only_service_role_can_execute_the_actual_authority_rpc(database):
    install_test_authority(database)
    privileges = database.execute(
        "select has_function_privilege(role,'public.island_economy_authority(uuid,uuid)',"
        "'execute') from unnest(array['anon','authenticated','service_role']) role"
    ).fetchall()
    assert privileges == [(False,), (False,), (True,)]


def test_historical_synthetic_fixture_cannot_replace_the_actual_provider(database):
    before = authority_definition(database)
    with (pytest.raises(psycopg.errors.RaiseException, match="cannot_replace"),
          database.transaction()):
        database.execute(FIXTURE_SQL.read_text())
    assert authority_definition(database) == before


def test_explicit_missing_provider_outage_restores_definition_owner_acl_and_comment(database):
    before = authority_definition(database)
    with authority_outage(database):
        assert authority_definition(database) is None
    assert authority_definition(database) == before
