"""Question sources: the latest Manifold state of each question, cached, with a recorded backup.

make_question_sources() builds one CachedSource (see server/adapters/base.py) for every question
in the list. Each get() tries these steps in order and stops at the first that works:

    1. cache      an answer fetched less than 2 minutes ago                -> source "cache"
    2. live       ask Manifold (cut off after 3 seconds)                   -> source "live"
    3. stale      the last good answer, however old                        -> source "stale"
    4. fallback   the recorded real answer in backend/content/predictions/recorded/  -> "fallback"
    5. nothing    raise SourceUnavailable (HTTP 503), if there is no recording either

After a failed call the source waits 2 minutes before it asks Manifold again. So however many
players ask, this server instance calls Manifold at most once per 2 minutes for each question:
5 questions are 2.5 calls a minute, and even 40 questions would be 20 a minute, far below the
limit of 500 a minute per IP address (see manifold.py). Vercel may run several instances at once,
and a cold start begins with an empty cache, so "once per 2 minutes" holds per instance only. It
also shares IP addresses with other customers, so Manifold can answer HTTP 429 even when we are
quiet. Then the source shows the last good answer (stale) or the recording (fallback). A stale
answer has no age limit here; state.py decides that nobody may stake on one that is older than
15 minutes (it is still shown, and it still limits what a host may settle).

The data in the cache is a MarketState (manifold.py): when the market closes and whether it is
decided. It holds no price.

Demo mode (DEMO_MODE=true): Manifold is never called. The source is a RecordedOnlySource, which
goes straight to step 4 and answers with the recording, labelled "fallback". It makes no failed
call, so the log stays quiet. The desk then treats the recording as the reading (state.py).

A recording has three keys: recordedAt (when it was saved, in UTC), source (the address that was
called) and answer (Manifold's JSON, trimmed to the fields in manifold.py). A missing or broken
recording is logged as a warning, and that question has no backup. A test checks that every
listed question has a good one.

Used by: desk.py (builds the sources once at start-up and asks them) and the tests.
"""

import json
import logging
from collections.abc import Sequence
from datetime import datetime
from pathlib import Path

import httpx

from server.adapters.base import CachedSource, Fetch, RecordedData
from server.clock import Clock, utc_now
from server.predictions.manifold import (
    TIMEOUT_SECONDS,
    ManifoldAnswerError,
    fetch_market,
    parse_market,
)
from server.predictions.questions import CONTENT_FOLDER, Question
from server.settings import Settings

logger = logging.getLogger(__name__)

# How long an answer counts as fresh: 2 minutes.
TTL_SECONDS = 120

RECORDED_FOLDER_NAME = "recorded"


class RecordedOnlySource(CachedSource):
    """The source for demo mode: it never asks Manifold, so it always answers "fallback".

    CachedSource asks can_call_outside() before every live call. Answering "no" here sends each
    get() straight to the recording, with no failed call and no warning in the log.
    """

    def can_call_outside(self) -> bool:
        return False


def read_recording_file(folder: Path, market_id: str) -> RecordedData:
    """Read recorded/<marketId>.json. Raises an error if the file or anything in it is bad."""
    path = folder / RECORDED_FOLDER_NAME / f"{market_id}.json"
    saved = json.loads(path.read_text(encoding="utf-8"))
    recorded_at = datetime.fromisoformat(saved["recordedAt"])
    if recorded_at.tzinfo is None:
        raise ValueError("The recording time has no timezone.")
    return RecordedData(data=parse_market(saved["answer"], market_id), recorded_at=recorded_at)


def load_recording(folder: Path, market_id: str) -> RecordedData | None:
    """The recorded real answer of one market, or None if the file is missing or broken.

    A broken file must not stop the whole API from starting, so the problem is logged and only
    that question has no backup. A test checks that every listed question has a good recording.
    """
    try:
        return read_recording_file(folder, market_id)
    except (OSError, ValueError, KeyError, TypeError, ManifoldAnswerError) as error:
        logger.warning(
            "The recording of market %s could not be used: %s", market_id, type(error).__name__
        )
        return None


def make_fetch(market_id: str, transport: httpx.AsyncBaseTransport | None) -> Fetch:
    """The function that asks Manifold about one market. Built here, so each source keeps its id."""

    async def fetch() -> object:
        return await fetch_market(market_id, transport)

    return fetch


def make_question_sources(
    questions: Sequence[Question],
    settings: Settings,
    transport: httpx.AsyncBaseTransport | None = None,
    clock: Clock = utc_now,
    folder: Path = CONTENT_FOLDER,
) -> dict[str, CachedSource]:
    """Build one source for each question, keyed by the question id. Nothing is fetched yet."""
    if settings.demo_mode:
        logger.info("Demo mode: the prediction desk uses the recorded Manifold answers only.")
        source_class = RecordedOnlySource
    else:
        source_class = CachedSource

    sources: dict[str, CachedSource] = {}
    for question in questions:
        sources[question.id] = source_class(
            f"manifold:{question.id}",
            make_fetch(question.market_id, transport),
            ttl_seconds=TTL_SECONDS,
            timeout_seconds=TIMEOUT_SECONDS,
            fallback=load_recording(folder, question.market_id),
            clock=clock,
        )
    return sources
