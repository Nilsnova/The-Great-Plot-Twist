"""Routes of the class demo: the class code (host), joining with it (guest), and "Clean up guests".

Every answer carries "Cache-Control: private, no-store". The class code never appears in a log, in
GET /api/config or in any answer to a player.

Host routes. Who may call: hosts only (`HostDep`, hosts.py): 401 without a login, 403 forbidden for
a player who is not in HOST_PLAYER_IDS. A guest is never a host.

    GET /api/host/demo
      200  {"flagOn": true, "code": "K7QXM", "codeSetAt": "2026-11-09T14:00:00Z", "guests": 31}
      flagOn is the feature flag demo: while it is off, no guest is let in, with or without a
      code. code is null until a host makes the first one; the screen shows it as HARBOR-K7QXM and
      the QR as https://the-great-plot-twist.vercel.app/?join=K7QXM. guests counts the admitted
      guests not yet cleaned up.
      After answering, at most once every 10 minutes per server instance, it deletes old guests
      (anonymous users older than 24 hours, at most 25 per run, in the background). A failure is
      logged and never changes the answer.

    POST /api/host/demo/code
    {"actionUid": "<uuid>"}
      200  {"flagOn": true, "code": "ZZ234", "codeSetAt": "...", "guests": 31, "repeat": false}
      Makes a new random code and replaces the old one at once: the old code no longer lets anyone
      new in. Guests admitted before stay admitted. A repeat of the same actionUid changes nothing
      and answers the current code with "repeat": true. Works with the flag off too.
      422  validation_error   a bad uid or an extra field

    POST /api/host/demo/cleanup
    {"actionUid": "<uuid>"}
      200  {"checked": 57, "deleted": 41, "more": false}
      Deletes every anonymous guest whose account is older than 24 hours, through the database
      function delete_player (demo/guests.py says exactly who counts as a guest: never a GitHub or
      email user, never a host). At most 100 per call; "more": true means press again. Deleting
      is safe to repeat, so the actionUid only follows the house rule for retries and is not
      stored. A 503 means the outcome is unknown: press again.

The join route. Any signed-in player (a guest or not); it does NOT pass the guest gate, because a
guest calls it exactly to get through the gate.

    POST /api/demo/join
    {"code": "HARBOR-K7QXM", "actionUid": "<uuid>"}
      The code may come with or without "HARBOR-", in any case, with spaces or dashes.
      200  {"admitted": true}
      A guest who presented the current code is recorded in demo_guests and passes the gate from
      now on (also after a new code). A guest who was admitted before gets 200 even with an old
      code. A GitHub or email player needs no admission and is not recorded; a valid code answers
      200 for them too. Safe to repeat: the actionUid is not stored.
      403  demo_closed          the feature flag demo is off
      403  class_code_invalid   not the current code (or no code yet)
      429  too_many_requests    more than 10 tries in 10 minutes from this player or this address
                                (per server instance), with Retry-After
      422  validation_error     a code longer than 32 characters, a bad uid, an extra field

Common errors: 401 unauthorized, 502/503 database_*, 503 auth_*.

Used by: the host console, the projector panel (host) and the game's Join flow (guests).
"""

import hashlib
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from server.auth import Player, VerifierDep, read_bearer_token
from server.clock import ClockDep
from server.demo.code import (
    MAX_TYPED_LENGTH,
    ClassCode,
    admit,
    codes_match,
    new_code,
    normalize_code,
    read_code,
    set_code,
)
from server.demo.gate import DemoGate, demo_closed
from server.demo.guests import cleanup_guests
from server.errors import ApiError
from server.hosts import HostDep
from server.settings import SettingsDep
from server.supabase_admin import AdminDep
from server.weather.mapping import format_utc_time

router = APIRouter()

PRIVATE = "private, no-store"

# The join budget: tries per player and per address, per server instance.
JOIN_TRIES = 10
JOIN_SECONDS = 600


class CodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actionUid: UUID


class CleanupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actionUid: UUID


class JoinRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(max_length=MAX_TYPED_LENGTH)
    actionUid: UUID


class CodeResponse(BaseModel):
    flagOn: bool
    code: str | None
    codeSetAt: str | None
    guests: int
    repeat: bool = False


class CleanupResponse(BaseModel):
    checked: int
    deleted: int
    more: bool


class JoinResponse(BaseModel):
    admitted: bool


def gate_of(request: Request) -> DemoGate:
    return request.app.state.demo_gate


def code_response(gate: DemoGate, current: ClassCode, repeat: bool = False) -> CodeResponse:
    return CodeResponse(
        flagOn=gate.flag_on,
        code=current.code,
        codeSetAt=format_utc_time(current.set_at) if current.set_at is not None else None,
        guests=current.guests,
        repeat=repeat,
    )


def class_code_invalid() -> ApiError:
    return ApiError(
        403,
        "class_code_invalid",
        "This class code is not valid. Ask the presenter for the current code.",
    )


def address_key(request: Request) -> str:
    """A fingerprint of the caller's address, for the join budget. The address is never kept.

    On Vercel the platform writes X-Forwarded-For itself; its first entry is the caller. Locally
    the header can be anything, which only matters for the local budget.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    address = forwarded.split(",")[0].strip() or (request.client.host if request.client else "")
    return "ip:" + hashlib.sha256(address.encode("utf-8", "replace")).hexdigest()


@router.get("/host/demo")
async def get_demo(
    request: Request,
    response: Response,
    background: BackgroundTasks,
    host: HostDep,
    admin: AdminDep,
) -> dict:
    response.headers["Cache-Control"] = PRIVATE
    current = await read_code(admin)
    auto = request.app.state.auto_cleanup
    if auto.claim():
        background.add_task(auto.run)
    return code_response(gate_of(request), current).model_dump(exclude={"repeat"})


@router.post("/host/demo/code")
async def post_code(
    body: CodeRequest, request: Request, response: Response, host: HostDep, admin: AdminDep
) -> CodeResponse:
    response.headers["Cache-Control"] = PRIVATE
    current, repeat = await set_code(admin, host.id, body.actionUid, new_code())
    return code_response(gate_of(request), current, repeat)


@router.post("/host/demo/cleanup")
async def post_cleanup(
    body: CleanupRequest,
    response: Response,
    host: HostDep,
    admin: AdminDep,
    settings: SettingsDep,
    now: ClockDep,
) -> CleanupResponse:
    response.headers["Cache-Control"] = PRIVATE
    result = await cleanup_guests(admin, now(), settings.host_player_ids)
    return CleanupResponse(checked=result.checked, deleted=result.deleted, more=result.more)


@router.post("/demo/join")
async def post_join(
    body: JoinRequest,
    request: Request,
    response: Response,
    verifier: VerifierDep,
    admin: AdminDep,
) -> JoinResponse:
    response.headers["Cache-Control"] = PRIVATE
    # The login check without the guest gate: a guest comes here to get through it.
    player: Player = await verifier.verify(read_bearer_token(request.headers.get("Authorization")))
    gate = gate_of(request)
    if not gate.flag_on:
        raise demo_closed()
    request.app.state.join_budget.spend(player.id)
    request.app.state.join_budget.spend(address_key(request))
    if player.is_anonymous and await gate.is_admitted(player.id):
        return JoinResponse(admitted=True)
    typed = normalize_code(body.code)
    current = await read_code(admin)
    # Compare even a malformed code, so every refusal takes the same path.
    if not codes_match(typed or "", current.code) or typed is None:
        raise class_code_invalid()
    if player.is_anonymous:
        if await admit(admin, player.id) == "missing":
            raise ApiError(
                404,
                "player_not_set_up",
                "Your guest login is gone. Reload the page and join again.",
            )
        gate.remember(player.id)
    return JoinResponse(admitted=True)
