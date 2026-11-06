"""Best-effort crew-change hints after successful writes. Crew routes use the shared A4 sender."""

import asyncio

from server.crew_broadcast import CrewBroadcaster

TIMEOUT_SECONDS = 1.0


async def crew_changed(broadcaster: CrewBroadcaster, crew_id: str, version: int) -> None:
    """A hint may fail; the completed write and its HTTP answer must still succeed."""
    try:
        async with asyncio.timeout(TIMEOUT_SECONDS):
            await broadcaster.send(crew_id, "crew_changed", {"version": version})
    except Exception:
        # The client can still refetch. No payload, room id or transport error is logged here.
        return
