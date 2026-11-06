"""Crew broadcast: tells a crew's browsers that something changed, through Supabase Realtime.

The browsers of a crew listen to one private Realtime room per crew ("live:crew:<crew id>").
Players can only listen there. Only this server sends into it, with the secret key, so no
player can fake an event. An event carries no game data. It only says "something changed,
fetch it": a kind such as board_changed and a small JSON object, usually {"version": 7}. The
browser then asks the API for the new state. The room, its rules and the browser side are
described in docs/INTERFACES.md, section 7, and in specs/A4-live-presence.md.

    !!! THIS MODULE MUST NEVER RUN IN THE BROWSER !!!  It holds the secret key. See
    supabase_admin.py for what that key can do.

What it does:
  * send(crew_id, kind, data) posts ONE message to Supabase's Broadcast REST API
    (POST {SUPABASE_URL}/realtime/v1/api/broadcast). It never opens a WebSocket and never joins
    a room: a server that joined would count as one more receiver and hold a connection.
  * It sends nothing while the feature flag live_presence is off.
  * A wrong argument is a bug in the caller, so send() raises ValueError. A problem with the
    network or with Supabase is not: send() logs a short warning, returns False and the game
    goes on. A crew event is a hint, never the only way to learn about a change.
  * One server instance sends at most 20 events per crew in any 10 seconds, and at most 5
    events in any second over all crews together, so a loop bug (even one that walks over
    every crew) cannot burn the shared Realtime budget.
  * The whole call, from connecting to the answer, takes at most 2 seconds.
  * It never logs the key, the crew id, the payload or what Supabase answered.

Used by: app.py (builds one and keeps it). Later the routes of L3 (the board), S3 (the case),
S4 (NPC partners) and A6 (crews) ask for it with BroadcasterDep and call send() after their
database change worked.
"""

import asyncio
import json
import logging
import uuid
from collections import deque
from datetime import datetime, timedelta
from typing import Annotated, Any

import httpx
from fastapi import Depends, Request

from server.clock import Clock, utc_now
from server.flags import is_enabled
from server.settings import Settings
from server.supabase_admin import build_headers

logger = logging.getLogger(__name__)

# The kinds of crew event, and the package that sends each one. The browser has the same list in
# frontend/src/net/live-rules.js, and a test (test_crew_broadcast.py) keeps the two equal.
CREW_EVENT_KINDS = (
    "board_changed",  # L3: a pin, a deduction, nightfall, a change of post, a beam lock change
    "finale_changed",  # L3: the Relighting
    "case_changed",  # S3: a card was found or an accusation was made
    "partner_changed",  # S4: an NPC partner finished an errand
    "crew_changed",  # A6: someone joined or left the crew
)

# Supabase Realtime's Broadcast REST API, and the shape of what we send into it.
BROADCAST_PATH = "/realtime/v1/api/broadcast"
EVENT_NAME = "crew_event"
PROTOCOL_VERSION = 1  # the "v" in every payload, so a browser can refuse a newer shape
ROOM_PREFIX = "live:crew:"  # the topic of a crew's room is this plus the crew id

# The limits that keep an event small and rare.
MAX_DATA_BYTES = 1024
NOT_JSON_MESSAGE = "data must be plain JSON: text, numbers, true/false, lists and dicts."
TIMEOUT_SECONDS = 2.0  # for the whole call, and again for each of its phases
EVENTS_PER_WINDOW = 20  # per crew and server instance, in WINDOW
WINDOW = timedelta(seconds=10)
EVENTS_PER_SECOND = 5  # over all crews together, per server instance, in SECOND
SECOND = timedelta(seconds=1)


def check_crew_id(crew_id: str) -> str:
    """The crew id as lowercase text with hyphens, or ValueError if it is not a UUID.

    The result goes into the name of the room, so it must be exactly a UUID and nothing else.
    """
    try:
        return str(uuid.UUID(str(crew_id)))
    except ValueError as error:
        raise ValueError("crew_id must be a UUID.") from error


def check_kind(kind: str) -> None:
    """ValueError unless the kind is one of CREW_EVENT_KINDS (a typo is a bug)."""
    if kind not in CREW_EVENT_KINDS:
        raise ValueError(f"Unknown crew event kind {kind!r}. Known kinds: {CREW_EVENT_KINDS}.")


def check_data(data: dict[str, Any] | None) -> None:
    """ValueError unless data is None or a dict that fits in 1024 bytes of compact JSON."""
    if data is None:
        return
    if not isinstance(data, dict):
        raise ValueError("data must be None or a dict.")
    try:
        text = json.dumps(data, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError) as error:
        raise ValueError(NOT_JSON_MESSAGE) from error
    if len(text.encode("utf-8")) > MAX_DATA_BYTES:
        raise ValueError(f"data must be at most {MAX_DATA_BYTES} bytes of compact JSON.")


class CrewBroadcaster:
    """Sends crew events to Supabase Realtime. create_app() makes one and stores it."""

    def __init__(
        self,
        base_url: str,
        secret_key: str,
        enabled: bool,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Clock = utc_now,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.enabled = enabled  # False while the feature flag live_presence is off
        self._secret_key = secret_key  # private on purpose: nothing else should read it
        self.transport = transport  # tests pass a fake transport here, so no network is used
        self._clock = clock  # tests pass a fake clock, so they never wait for real seconds
        # When this instance sent events: for each crew (the last 10 seconds are kept) and for
        # all crews together (the last second is kept).
        self._recent_by_crew: dict[str, deque[datetime]] = {}
        self._recent_all: deque[datetime] = deque()

    async def send(self, crew_id: str, kind: str, data: dict[str, Any] | None = None) -> bool:
        """Tell the crew's browsers that `kind` happened. True if Supabase took the message.

        Call it after the database change worked, with data={"version": n}. It returns False
        (and the game goes on) when the flag is off, when Supabase is not set up, when this
        crew or all crews together have used up their limit, and when Supabase or the network
        fails. It raises ValueError only for a wrong argument.
        """
        crew = check_crew_id(crew_id)
        check_kind(kind)
        check_data(data)

        if not self.enabled:
            return False
        if not self.base_url or not self._secret_key:
            logger.warning("Crew broadcast skipped: Supabase is not set up on this server.")
            return False
        reason = self._count_event(crew)
        if reason:
            logger.warning("Crew broadcast skipped: %s.", reason)
            return False
        return await self._post(crew, kind, data or {})

    def _count_event(self, crew: str) -> str | None:
        """Count one more event, or say why it must not go out (None means it may).

        Two limits apply: 20 events per crew in 10 seconds, and 5 events in one second over all
        crews together (a loop that walks over every crew is bounded too). An event that is
        skipped is not counted anywhere, so waiting always brings the crews back.
        """
        now = self._clock()
        self._forget_old_events(now)
        if len(self._recent_all) >= EVENTS_PER_SECOND:
            return "too many events in one second over all crews"
        recent = self._recent_by_crew.setdefault(crew, deque())
        if len(recent) >= EVENTS_PER_WINDOW:
            return "too many events for one crew in 10 seconds"
        recent.append(now)
        self._recent_all.append(now)
        return None

    def _forget_old_events(self, now: datetime) -> None:
        """Drop events older than their window, and crews with none left (no list grows forever)."""
        while self._recent_all and now - self._recent_all[0] >= SECOND:
            self._recent_all.popleft()
        for crew, recent in list(self._recent_by_crew.items()):
            while recent and now - recent[0] >= WINDOW:
                recent.popleft()
            if not recent:
                del self._recent_by_crew[crew]

    async def _post(self, crew: str, kind: str, data: dict[str, Any]) -> bool:
        """Send the one message. Never raises for network trouble; never logs what it sent."""
        message = {
            "topic": f"{ROOM_PREFIX}{crew}",
            "event": EVENT_NAME,
            "payload": {"v": PROTOCOL_VERSION, "kind": kind, "data": data},
            "private": True,  # only players that the room's rules let in may listen
        }
        try:
            # httpx counts its timeout for each phase (connect, write, read, pool), so a slow
            # Supabase could hold the calling route for several seconds. This bounds the whole call.
            async with asyncio.timeout(TIMEOUT_SECONDS):
                async with httpx.AsyncClient(
                    transport=self.transport, timeout=TIMEOUT_SECONDS
                ) as client:
                    response = await client.post(
                        f"{self.base_url}{BROADCAST_PATH}",
                        json={"messages": [message]},
                        headers=build_headers(self._secret_key),
                    )
        except (httpx.HTTPError, httpx.InvalidURL, TimeoutError) as error:
            logger.warning("Crew broadcast failed: %s", type(error).__name__)
            return False

        if response.is_success:
            return True
        # Only the status. What Supabase answered could repeat what we sent.
        logger.warning("Crew broadcast failed: HTTP %s", response.status_code)
        return False


def broadcaster_from_settings(
    settings: Settings,
    transport: httpx.AsyncBaseTransport | None = None,
    clock: Clock = utc_now,
) -> CrewBroadcaster:
    """Make the broadcaster from the settings. In this module the secret key is read only here."""
    return CrewBroadcaster(
        settings.supabase_url,
        settings.supabase_secret_key.get_secret_value(),
        is_enabled("live_presence", settings.flags),
        transport,
        clock,
    )


def get_broadcaster(request: Request) -> CrewBroadcaster:
    """FastAPI dependency: the broadcaster that create_app() stored on the app."""
    return request.app.state.broadcaster


# Write `crew_broadcaster: BroadcasterDep` in a route and FastAPI hands you the broadcaster.
BroadcasterDep = Annotated[CrewBroadcaster, Depends(get_broadcaster)]
