"""Contract checks for injected SQL authority, never proof of persistent session authority."""

from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.economy_test_authority import (  # noqa: E402
    configure_test_authority,
    install_test_authority,
)
from server.tests.island_sql.test_island_treasury_sql import as_owner, ready, rpc  # noqa: E402


def test_fixture_returns_exact_contract_fields_and_explicit_nulls(database):
    owner, member, _, _ = ready(database)
    as_owner(database)
    install_test_authority(database)
    configure_test_authority(database, member, owner)

    assert rpc(database, "island_economy_authority", member, owner) == {
        "actor_id": str(member),
        "island_owner": str(owner),
        "is_member": True,
        "reservation_id": None,
        "session_leader_id": None,
        "actor_assignment_wave_id": None,
    }


def test_fixture_membership_follows_real_departure_without_fixture_reconfiguration(database):
    owner, member, _, _ = ready(database)
    as_owner(database)
    install_test_authority(database)
    configure_test_authority(database, member, owner)
    assert rpc(database, "game_leave", member, owner)["status"] == "left"
    assert rpc(database, "island_economy_authority", member, owner)["is_member"] is False


def test_fixture_does_not_grant_membership_to_an_uninvited_actor(database):
    owner, _, outsider, _ = ready(database)
    as_owner(database)
    install_test_authority(database)
    configure_test_authority(database, outsider, owner)
    assert rpc(database, "island_economy_authority", outsider, owner)["is_member"] is False


def test_fixture_exposes_only_explicitly_injected_phase_leader_and_assignment(database):
    owner, member, _, _ = ready(database)
    as_owner(database)
    wave = uuid4()
    install_test_authority(database)
    configure_test_authority(
        database,
        member,
        owner,
        reservation_id=wave,
        session_leader_id=owner,
        actor_assignment_wave_id=wave,
    )
    row = rpc(database, "island_economy_authority", member, owner)
    assert row["reservation_id"] == row["actor_assignment_wave_id"] == str(wave)
    assert row["session_leader_id"] == str(owner)


def test_unconfigured_fixture_authority_fails_instead_of_guessing_phase(database):
    owner, member, _, _ = ready(database)
    as_owner(database)
    install_test_authority(database)
    with (
        pytest.raises(psycopg.errors.RaiseException, match="not_configured"),
        database.transaction(),
    ):
        rpc(database, "island_economy_authority", member, owner)


def test_only_service_role_can_execute_the_injected_authority_rpc(database):
    install_test_authority(database)
    privileges = database.execute(
        "select has_function_privilege(role, 'public.island_economy_authority(uuid,uuid)', "
        "'execute') from unnest(array['anon','authenticated','service_role']) role"
    ).fetchall()
    assert privileges == [(False,), (False,), (True,)]


def test_fixture_cannot_replace_an_existing_unmarked_authority_provider(database):
    database.execute(
        "create function public.island_economy_authority(uuid,uuid) returns jsonb "
        "language sql as $$select '{}'::jsonb$$"
    )
    with (
        pytest.raises(psycopg.errors.RaiseException, match="cannot_replace"),
        database.transaction(),
    ):
        install_test_authority(database)
