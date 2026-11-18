"""Strict shared-wave controller proof and transport compatibility.

Used by wave routes. The canonical session transaction still checks all authority.
"""

from typing import Annotated
from uuid import UUID

from fastapi import Request
from pydantic import BaseModel, ConfigDict, Field, StrictStr

from server.errors import ApiError
from server.island import economy_http, personal_captain_store
from server.island.economy_http import require_economy_capability
from server.island.economy_http_models import SharedEconomy
from server.island.treasury import EconomyContext
from server.supabase_admin import SupabaseAdmin


class SharedWaveProof(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    economy: SharedEconomy
    sessionId: UUID
    connectionGeneration: Annotated[StrictStr, Field(pattern=r"^[1-9][0-9]*$")]


async def read_target_context(
    admin: SupabaseAdmin, actor_id: str, where: str
) -> EconomyContext | None:
    """Resolve persisted mode before any legacy own-island initializer can run."""
    if where == "pirate_point":
        return None
    code = None if where == "own" else where
    owner = await economy_http.target_owner(admin, actor_id, code)
    return await economy_http.persisted_context(
        admin, actor_id, owner, allow_missing_own=code is None
    )


async def require_legacy_controller(admin: SupabaseAdmin, actor_id: str) -> None:
    """The globally adopted Captain cannot silently return to the old control store."""
    if await personal_captain_store.read_optional(admin, actor_id) is not None:
        raise ApiError(
            409, "personal_captain_managed", "Use the canonical Captain session to play."
        )


def require_shared_wave_client(request: Request, wave_protocol: int) -> None:
    """No native shared request may fall through to a personal legacy wave writer."""
    require_economy_capability(request)
    if wave_protocol != 2:
        raise ApiError(
            409, "client_update_required", "Reload to join this shared island wave.",
        )
