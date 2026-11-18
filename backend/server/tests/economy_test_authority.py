"""Explicit injected authority for disposable PostgreSQL domain tests, never runtime use.

Membership comes from real game rows; phase/leader/assignment are fixture values.
This helper implements no production Captain, wave, journal or session authority.
"""

from pathlib import Path
from typing import Any
from uuid import UUID

FIXTURE_SQL = Path(__file__).with_name("economy_authority_fixture.sql")


def install_test_authority(connection: Any) -> None:
    """Install as the scratch database owner, refusing an unmarked provider."""
    connection.execute(FIXTURE_SQL.read_text())


def configure_test_authority(
    connection: Any,
    actor_id: UUID | str,
    island_owner: UUID | str,
    *,
    reservation_id: UUID | str | None = None,
    session_leader_id: UUID | str | None = None,
    actor_assignment_wave_id: UUID | str | None = None,
) -> None:
    """Inject explicit missing-provider state; this grants no game membership."""
    connection.execute(
        "insert into mp_eco_test.authority "
        "(actor_id,island_owner,reservation_id,session_leader_id,actor_assignment_wave_id) "
        "values (%s,%s,%s,%s,%s) on conflict (actor_id,island_owner) do update set "
        "reservation_id=excluded.reservation_id,session_leader_id=excluded.session_leader_id,"
        "actor_assignment_wave_id=excluded.actor_assignment_wave_id",
        (actor_id, island_owner, reservation_id, session_leader_id, actor_assignment_wave_id),
    )
