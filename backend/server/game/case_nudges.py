"""Send bounded change hints after case commits; polling remains the fallback."""

import asyncio
import logging

logger = logging.getLogger(__name__)
NUDGE_TIMEOUT_SECONDS = 1.0
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


async def nudge(broadcaster, crew_id: str, kind: str, revision: int) -> None:
    if broadcaster is None:
        return
    try:
        await asyncio.wait_for(
            broadcaster.send(crew_id, NUDGE_KINDS[kind], {"version": revision}),
            NUDGE_TIMEOUT_SECONDS,
        )
    except Exception as error:
        logger.warning("Case nudge skipped: %s", type(error).__name__)
