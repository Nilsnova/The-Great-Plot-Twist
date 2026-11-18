"""Strict shared-wave controller proof and transport compatibility.

Used by wave routes. The canonical session transaction still checks all authority.
"""

from typing import Annotated
from uuid import UUID

from fastapi import Request
from pydantic import BaseModel, ConfigDict, Field, StrictStr

from server.errors import ApiError
from server.island.economy_http import require_economy_capability
from server.island.economy_http_models import SharedEconomy


class SharedWaveProof(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    economy: SharedEconomy
    sessionId: UUID
    connectionGeneration: Annotated[StrictStr, Field(pattern=r"^[1-9][0-9]*$")]


def require_shared_wave_client(request: Request, wave_protocol: int) -> None:
    """No native shared request may fall through to a personal legacy wave writer."""
    require_economy_capability(request)
    if wave_protocol != 2:
        raise ApiError(
            409, "client_update_required", "Reload to join this shared island wave.",
        )
