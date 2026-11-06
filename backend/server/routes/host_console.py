"""G14 host console: verified console hosts, private aggregates and atomic crew cleanup.

GET /host/overview: UTC wallet totals, expected schema probes/flags, build and source health.
GET /host/crews: newest 50 crews and total; captain names only, never player login details.
POST /host/crews/{id}/close {actionUid}: UUID retries; own forming crew without other humans.
403 for non-hosts, 409 for a refused cleanup, 502/503 for unreadable/unavailable storage.
No endpoint reads the case solution or returns credentials. Host responses are never cached.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request

from server.auth import Player, VerifierDep, read_bearer_token
from server.crews.store import read_row, unreadable
from server.errors import ApiError
from server.host_console import (
    CloseReply,
    CloseRequest,
    CrewList,
    OverviewRows,
    build_stamp,
    case_clock_available,
    expected_migrations,
)
from server.hosts import require_host
from server.routes.weather import WeatherSourceDep
from server.settings import SettingsDep
from server.supabase_admin import AdminDep
from server.weather.mapping import format_utc_time

router = APIRouter()


async def console_host(request: Request, verifier: VerifierDep, settings: SettingsDep) -> Player:
    """The console uses 403 for visitors; shared HostDep keeps its existing 401 contract."""
    try:
        player = await verifier.verify(read_bearer_token(request.headers.get("Authorization")))
    except ApiError as error:
        if error.status_code != 401:
            raise
        raise ApiError(403, "forbidden", "Only a host can do this.") from error
    return require_host(player, settings)


ConsoleHostDep = Annotated[Player, Depends(console_host)]


@router.get("/host/overview")
async def overview(
    host: ConsoleHostDep,
    admin: AdminDep,
    settings: SettingsDep,
    source: WeatherSourceDep,
    request: Request,
) -> dict:
    rows = read_row(OverviewRows, await admin.call_function("host_console_overview", {}))
    try:
        reading = await source.get()
        weather = {
            "source": reading.source,
            "origin": "recorded" if reading.source == "fallback" else "live",
            "fetchedAt": format_utc_time(reading.fetched_at),
        }
    except ApiError:
        weather = {"source": "unavailable", "origin": "unknown", "fetchedAt": None}
    schema = request.app.openapi()
    clock_available = case_clock_available(schema, settings.flags)
    last = rows.lastKeepaliveAt
    return {
        **rows.model_dump(exclude={"lastKeepaliveAt"}),
        "crews": {
            status: (rows.crews or {}).get(status, 0)
            for status in ("forming", "active", "finished")
        },
        "flags": settings.flags,
        "demoMode": settings.demo_mode,
        "expectedMigrations": expected_migrations(rows.schemaObjects, settings.flags),
        "build": build_stamp(settings.build_commit),
        "weather": weather,
        "realtimeConnections": None,
        "caseClockAvailable": clock_available,
        "keepalive": {
            "lastSuccessAt": last,
            "today": last is not None and format_utc_time(last)[:10] == rows.day,
            "timezone": "UTC",
        },
    }


@router.get("/host/crews", response_model=CrewList)
async def crews(host: ConsoleHostDep, admin: AdminDep) -> CrewList:
    reply = await admin.call_function("host_console_crews", {"p_host_id": host.id})
    return read_row(CrewList, reply)


@router.post("/host/crews/{crew_id}/close")
async def close(crew_id: UUID, body: CloseRequest, host: ConsoleHostDep, admin: AdminDep) -> dict:
    reply = read_row(
        CloseReply,
        await admin.call_function(
            "host_close_test_crew",
            {
                "p_host_id": host.id,
                "p_crew_id": str(crew_id),
                "p_action_uid": str(body.actionUid),
            },
        ),
    )
    if reply.status == "refused" and reply.reason:
        message = "This action cannot close that test crew. Refresh the list."
        raise ApiError(409, reply.reason, message)
    if reply.status != "closed" or reply.crewId != crew_id or reply.reason is not None:
        raise unreadable()
    return {"status": "closed", "crewId": str(crew_id)}
