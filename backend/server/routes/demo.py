"""Host routes of the class demo: the "Demo open for N hours" switch and "Clean up guests".

Who may call: hosts only (`HostDep`, hosts.py): 401 without a login, 403 forbidden for a player who
is not in HOST_PLAYER_IDS. A guest is never a host. Every answer carries
"Cache-Control: private, no-store".

    GET /api/host/demo
      200  {"flagOn": true, "open": true, "openUntil": "2026-11-09T15:00:00Z"}
      flagOn is the feature flag demo. While it is off, guests are refused whatever the window
      says, and "open" is false.

    POST /api/host/demo
    {"hours": 2, "actionUid": "<uuid>"}       hours 0 to 6 (0 closes the window)
      200  {"flagOn": true, "open": true, "openUntil": "2026-11-09T15:00:00Z", "repeat": false}
      The window runs from now (the database clock) for that many hours and replaces any earlier
      one. A repeat of the same actionUid changes nothing and answers the window as it is now
      with "repeat": true. Switching works with the flag off too, so a host can prepare it.
      422  validation_error   hours outside 0 to 6, not a whole number, a bad uid, an extra field

    POST /api/host/demo/cleanup
    {"actionUid": "<uuid>"}
      200  {"checked": 57, "deleted": 41, "more": false}
      Deletes every anonymous guest whose account is older than 24 hours, through the database
      function delete_player (demo/guests.py says exactly who counts as a guest: never a GitHub or
      Google user, never a host). At most 100 per call; "more": true means press again. Deleting
      is safe to repeat, so the actionUid only follows the house rule for retries and is not
      stored. A 503 means the outcome is unknown: press again.

Common errors: 502/503 database_* (the window or a deletion), 503 auth_* (the login check).

Used by: the host console (checkpoint C1/C2 browser work).
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from server.clock import ClockDep
from server.demo.gate import DemoGate
from server.demo.guests import cleanup_guests
from server.demo.window import MAX_HOURS, Window, read_window, set_window
from server.hosts import HostDep
from server.settings import SettingsDep
from server.supabase_admin import AdminDep
from server.weather.mapping import format_utc_time

router = APIRouter()

PRIVATE = "private, no-store"


class WindowRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hours: StrictInt = Field(ge=0, le=MAX_HOURS)
    actionUid: UUID


class CleanupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actionUid: UUID


class WindowResponse(BaseModel):
    flagOn: bool
    open: bool
    openUntil: str | None
    repeat: bool = False


class CleanupResponse(BaseModel):
    checked: int
    deleted: int
    more: bool


def gate_of(request: Request) -> DemoGate:
    return request.app.state.demo_gate


def window_response(gate: DemoGate, window: Window, repeat: bool = False) -> WindowResponse:
    until: datetime | None = window.open_until if window.open else None
    return WindowResponse(
        flagOn=gate.flag_on,
        open=gate.flag_on and window.open,
        openUntil=format_utc_time(until) if until is not None else None,
        repeat=repeat,
    )


@router.get("/host/demo")
async def get_demo(request: Request, response: Response, host: HostDep, admin: AdminDep) -> dict:
    response.headers["Cache-Control"] = PRIVATE
    # The host always sees the database, never the 10-second memory of the gate.
    window = await read_window(admin)
    gate = gate_of(request)
    gate.remember(window)
    return window_response(gate, window).model_dump(exclude={"repeat"})


@router.post("/host/demo")
async def post_demo(
    body: WindowRequest,
    request: Request,
    response: Response,
    host: HostDep,
    admin: AdminDep,
    now: ClockDep,
) -> WindowResponse:
    response.headers["Cache-Control"] = PRIVATE
    gate = gate_of(request)
    window, repeat = await set_window(admin, host.id, body.actionUid, body.hours, now())
    gate.remember(window)
    return window_response(gate, window, repeat)


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
