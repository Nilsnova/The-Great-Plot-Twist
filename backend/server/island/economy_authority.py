"""Checked server authority for the isolated shared-island permission policy (MP-ECO-08).

Used by: economy_permissions.py. The reserved RPC is service-only; browser presence is not
authority. Its reader is not a substitute for repeating checks under mutation locks.
"""

from dataclasses import dataclass
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StrictBool, StrictStr, ValidationError, field_validator

from server.errors import ApiError
from server.supabase_admin import SupabaseAdmin, SupabaseRejected


@dataclass(frozen=True)
class EconomyAuthority:
    """Server-derived identity, membership, phase and personal assignment; never client input."""

    actor_id: str
    island_owner: str
    is_member: bool
    reservation_id: str | None
    session_leader_id: str | None
    actor_assignment_wave_id: str | None


class _AuthorityRow(BaseModel):
    """Exact private RPC response, without truthy coercion or missing-field defaults."""

    model_config = ConfigDict(extra="forbid")

    actor_id: StrictStr
    island_owner: StrictStr
    is_member: StrictBool
    reservation_id: StrictStr | None
    session_leader_id: StrictStr | None
    actor_assignment_wave_id: StrictStr | None

    @field_validator(
        "actor_id", "island_owner", "reservation_id", "session_leader_id",
        "actor_assignment_wave_id",
    )
    @classmethod
    def canonical_uuid(cls, value: str | None) -> str | None:
        return str(UUID(value)) if value is not None else None


def authority_unavailable() -> ApiError:
    return ApiError(
        409, "economy_path_unavailable",
        "Shared-island permission checks are not available. Try again after the update.",
    )


async def read_economy_authority(
    admin: SupabaseAdmin, actor_id: str, island_owner: str,
) -> EconomyAuthority:
    """Fail closed until the persisted phase/leader/assignment RPC is implemented and readable.

    Reservation identity is the accepted wave identity, not the display combat-start time.
    Transport failures keep their existing unavailable error; no personal policy is attempted.
    """
    try:
        reply = await admin.call_function("island_economy_authority", {
            "p_actor_id": actor_id, "p_island_owner": island_owner,
        })
        row = _AuthorityRow.model_validate(reply)
    except (SupabaseRejected, ValidationError) as error:
        raise authority_unavailable() from error
    if row.actor_id != actor_id or row.island_owner != island_owner:
        raise authority_unavailable()
    return EconomyAuthority(**row.model_dump())
