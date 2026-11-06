"""Festival routes, behind festival; private optional-auth reads and authenticated writes.

GET /api/festival gives the 48-hour timer, lamp states and optional own queue/duel state.
POST /api/festival/claim {lampId,actionUid}; /ring/join {signals:[3 A7 glyphs],actionUid};
/ring/leave {actionUid}. Unknown fields and client amounts/results are forbidden. The ring
also needs arena. Mutations use durable once-only receipts and fresh views. No wallet reason
or client clock decides an outcome. Root app.py mounts this router under /api.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field

from server.auth import PlayerDep, VerifierDep, read_bearer_token
from server.clock import ClockDep
from server.errors import ApiError
from server.festival.content import FestivalContentError, festival_content
from server.festival.service import FestivalService
from server.flags import is_enabled
from server.settings import SettingsDep
from server.supabase_admin import AdminDep

router = APIRouter()


def festival_on(settings: SettingsDep) -> None:
    if not is_enabled("festival", settings.flags):
        raise ApiError(404, "feature_off", "The festival is closed for now.")


FestivalOn = Annotated[None, Depends(festival_on)]


class Intent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    actionUid: str = Field(pattern=r"^[A-Za-z0-9_-]{8,64}$", strict=True)


class Claim(Intent):
    lampId: str = Field(pattern=r"^[a-z][a-z0-9_]{1,60}$", strict=True)


class Join(Intent):
    signals: list[Literal["flash", "shade", "mirror"]] = Field(
        min_length=3, max_length=3, strict=True
    )


def service(clock) -> FestivalService:
    try:
        return FestivalService(festival_content(), clock)
    except FestivalContentError:
        raise ApiError(503, "festival_unavailable", "The festival could not be prepared.") from None


@router.get("/festival")
async def get_festival(
    request: Request,
    enabled: FestivalOn,
    admin: AdminDep,
    settings: SettingsDep,
    clock: ClockDep,
    verifier: VerifierDep,
) -> dict:
    if request.query_params:
        raise ApiError(422, "validation_error", "This address takes no query parameters.")
    player_id = None
    if "authorization" in request.headers:
        player_id = (await verifier.verify(read_bearer_token(request.headers["authorization"]))).id
    return await service(clock).view(admin, player_id, arena=is_enabled("arena", settings.flags))


@router.post("/festival/claim")
async def claim(
    body: Claim,
    enabled: FestivalOn,
    player: PlayerDep,
    admin: AdminDep,
    settings: SettingsDep,
    clock: ClockDep,
) -> dict:
    return await service(clock).intent(
        admin,
        player.id,
        "claim",
        body.actionUid,
        arena=is_enabled("arena", settings.flags),
        lamp_id=body.lampId,
    )


@router.post("/festival/ring/join")
async def join(
    body: Join,
    enabled: FestivalOn,
    player: PlayerDep,
    admin: AdminDep,
    settings: SettingsDep,
    clock: ClockDep,
) -> dict:
    return await service(clock).intent(
        admin,
        player.id,
        "join",
        body.actionUid,
        arena=is_enabled("arena", settings.flags),
        signals=tuple(body.signals),
    )


@router.post("/festival/ring/leave")
async def leave(
    body: Intent,
    enabled: FestivalOn,
    player: PlayerDep,
    admin: AdminDep,
    settings: SettingsDep,
    clock: ClockDep,
) -> dict:
    return await service(clock).intent(
        admin, player.id, "leave", body.actionUid, arena=is_enabled("arena", settings.flags)
    )
