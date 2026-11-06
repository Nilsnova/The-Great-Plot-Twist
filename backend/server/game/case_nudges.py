"""Best-effort case hints through the app's shared A4 sender, after committed writes only."""

import asyncio

NUDGE_KINDS = {
    "search": "case_changed",
    "accuse": "case_changed",
    "clock": "case_changed",
    "pin": "board_changed",
    "pair": "board_changed",
    "nightfall": "board_changed",
    "post": "board_changed",
    "signal": "board_changed",
    "order": "partner_changed",
}
NUDGE_TIMEOUT_SECONDS = 1.0


async def nudge(broadcaster, crew_id: str, kind: str, version: int) -> None:
    """A hint has one second; transport failures never change the completed write's outcome."""
    if broadcaster is None:
        return
    try:
        async with asyncio.timeout(NUDGE_TIMEOUT_SECONDS):
            await broadcaster.send(crew_id, NUDGE_KINDS[kind], {"version": version})
    except Exception:
        # Cancellation remains visible to the caller; no ids, payload or error prose is logged.
        return
