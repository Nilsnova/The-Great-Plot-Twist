"""Standalone, already-adopted personal Captain version-one API.

GET /api/captain reads only the authenticated player's existing profile, without import/grant.
POST /api/captain/role, /skill and /respec take strict version one, expectedRevision and
actionUid, plus role or skill as appropriate. No island/code/payer/owner input is accepted.
GET without adoption answers 409 captain_not_initialized. POST without version/adoption
answers 409 captain_context_required; stale new changes answer
409 captain_revision_mismatch. Reallocation is free and checks global assignment/Engineer
binding under SQL locks. Replies are {captain,skills}; legacy endpoints are unchanged here.
Used by explicit application integration; this module does not register itself in app.py.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr

from server.auth import Player, PlayerDep
from server.errors import ApiError
from server.island import personal_captain_store
from server.supabase_admin import AdminDep, SupabaseAdmin

router = APIRouter()


class PersonalChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    progressionVersion: StrictInt | None = None
    expectedRevision: Annotated[StrictStr, Field(pattern=r"^(0|[1-9][0-9]*)$")]
    actionUid: Annotated[StrictStr, Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")]


class RoleChange(PersonalChange):
    role: Literal["medic", "engineer", "gunner"]


class SkillChange(PersonalChange):
    skill: Annotated[StrictStr, Field(pattern=r"^[a-z][a-z0-9_]{1,39}$")]


def response_body(profile: dict, response: Response) -> dict:
    response.headers["Cache-Control"] = "private, no-store"
    return {"captain": profile["captain"], "skills": profile["skills"]}


@router.get("/captain")
async def captain(request: Request, response: Response, player: PlayerDep, admin: AdminDep) -> dict:
    if request.query_params:
        raise ApiError(422, "validation_error", "This personal read takes no query fields.")
    profile = await personal_captain_store.read_optional(admin, player.id)
    if profile is None:
        raise ApiError(409, "captain_not_initialized", "This Captain uses legacy progression.")
    return response_body(profile, response)


async def change_profile(
    admin: SupabaseAdmin, player: Player, body: PersonalChange, action: str,
    value: str | None, response: Response,
) -> dict:
    if body.progressionVersion != 1:
        raise ApiError(409, "captain_context_required", "Read your version-one Captain first.")
    result = await personal_captain_store.change(
        admin, player.id, body.actionUid, action, value, expected_revision=body.expectedRevision,
    )
    return response_body(result["profile"], response)


@router.post("/captain/role")
async def role(body: RoleChange, response: Response, player: PlayerDep, admin: AdminDep) -> dict:
    return await change_profile(admin, player, body, "role", body.role, response)


@router.post("/captain/skill")
async def skill(body: SkillChange, response: Response, player: PlayerDep, admin: AdminDep) -> dict:
    return await change_profile(admin, player, body, "learn", body.skill, response)


@router.post("/captain/respec")
async def respec(
    body: PersonalChange, response: Response, player: PlayerDep, admin: AdminDep,
) -> dict:
    return await change_profile(admin, player, body, "respec", None, response)
