"""Bulletin route: GET /api/bulletin is the harbor bulletin, the same for every player.

    GET /api/bulletin
      404 feature_disabled while the bulletin flag is off (the default)
      200  {"day": {"id": "2026-11-16", "startedAt": "2026-11-16T00:00:00Z",
                     "nextDayAt": "2026-11-17T00:00:00Z", "bulletinDay": "2026-11-16",
                     "publishedAt": "2026-11-16T08:00:00Z",
                     "nextBulletinAt": "2026-11-17T08:00:00Z",
                     "harborWeek": "2026-11-16", "nextHarborWeekAt": "2026-11-23T00:00:00Z",
                     "resets": [{"when": "Every day at 00:00", "what": "A new game day begins."}]},
            "lines": [{"kind": "weather", "text": "Tonight: fog. Tomorrow: calm and clear."},
                      {"kind": "fog", "text": "Fog tonight. Watch for the false light."}],
            "weather": {"tonight": {...}, "tomorrow": {...}, "source": "live",
                        "fetchedAt": "2026-11-16T08:55:00Z",
                        "attribution": "Weather data by Open-Meteo.com, adapted for the game"},
            "exchange": null,
            "chapterTwoHook": null}
      503  bulletin_unavailable   bulletin.json, chapter_two_hook.json or weather_states.json could
                                  not be read when the server started (see the logs)

While the bulletin flag is on, anyone may call it: it needs no sign-in and holds no secret.
It takes no input: a query string and
an Authorization header are ignored. Every player gets the same answer. The one line that differs
by crew, the next lead, is served signed in by package S3 (a separate route), so this answer stays
public and cacheable. It is worked out when somebody asks: there is no timer and no table.

The fields:
    day         the Lisbon clock around now (daily/frame.py): the game day (00:00 to 24:00), the
                bulletin day (08:00 to 08:00, also the Island Exchange's market day) and the harbor
                week (from Monday 00:00), each with the time the next one begins, in UTC. `resets`
                says what resets when, from bulletin.json, for a help box.
    lines       the text lines, in this fixed order, at most one of each kind: "weather", "fog"
                (only while the coast is dark and tonight is a fog night), "exchange", "relit" (for
                48 hours after the first solve), "hook" (the Chapter 2 hook, in the bulletin of
                the morning it fires) and "calendar" (the dated notice of the bulletin day).
    weather     tonight (the same object as `tonight` in GET /api/weather) and tomorrow (the
                daytime after tonight: date, startsAt, endsAt, state), and where the weather comes
                from: source, fetchedAt and the credit line `attribution`. The licence asks for
                the credit wherever the data is shown. If Open-Meteo is down and nothing is
                recorded, source, fetchedAt and attribution are null, the states are null (the
                lines say "no forecast") and the harbor's almanac still decides the fog nights.
    exchange    {"feed": "live", "pausedCompanies": [{"id", "name"}]} while the feature flag
                "market" is on and the price board can be made, otherwise null. The bulletin only
                looks at the Exchange: it saves nothing.
    chapterTwoHook  null while the coast is dark and until the hook fires (06:00 Lisbon time at the
                end of the first calm night among the first three after the first solve, or the
                third). After that the Board notice and the beam for the sea chart, for good:
                {"id", "notice": {"title", "text"},
                 "beam": {"chart": {"x", "y"}, "pattern": ["short", "long"],
                          "flash": {"shortSeconds", "longSeconds", "gapSeconds", "pauseSeconds"}}}

If the stage of the world cannot be read (package L3 will read it from the database), the answer is
still 200 but without the "fog", "relit" and "hook" lines, and chapterTwoHook is null. If the
Island Exchange has no service, is switched off or cannot make its board, exchange is null.

The answer is sent with "Cache-Control: public, max-age=300", so a browser may reuse it for
5 minutes. An error answer carries no such header. Errors have the standard shape (errors.py).

The shape of the answer (the models and the functions that fill them) is in
routes/bulletin_answer.py. This file reads the inputs and puts the answer together.

Used by: the game client (the bulletin panel and the Saltreach Harbor notice board).
"""

from collections.abc import Sequence
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from server.adapters.base import CachedSource, SourceResult, SourceUnavailable
from server.clock import ClockDep
from server.daily.bulletin import build_lines
from server.daily.chapter_two_hook import hook_fired_at
from server.daily.content import DailyContent
from server.daily.exchange_summary import ExchangeSummary, read_exchange
from server.daily.frame import day_frame
from server.errors import ApiError
from server.flags import is_enabled
from server.routes.bulletin_answer import (
    BulletinResponse,
    LineOut,
    day_out,
    exchange_out,
    hook_out,
    weather_out,
)
from server.routes.weather import WeatherRulesDep, WeatherSourceDep
from server.settings import Settings, SettingsDep
from server.supabase_admin import AdminDep, SupabaseAdmin
from server.weather.mapping import HourReading
from server.weather.outlook import make_outlook
from server.weather.state_rules import StateRules
from server.world_stage import WorldStage, WorldStageDep, WorldStageReader

router = APIRouter()

CACHE_CONTROL = "public, max-age=300"


def get_daily_content(request: Request) -> DailyContent | None:
    """FastAPI dependency: the content that create_app() loaded, or None if a file is bad."""
    return request.app.state.daily_content


# Write `content: DailyContentDep` in a route and FastAPI hands you the content (or None).
DailyContentDep = Annotated[DailyContent | None, Depends(get_daily_content)]


async def read_weather(source: CachedSource) -> SourceResult | None:
    """The weather answer, or None if there is nothing at all (the bulletin still answers)."""
    try:
        return await source.get()
    except SourceUnavailable:
        return None


async def read_stage(reader: WorldStageReader) -> WorldStage | None:
    """The stage of the world, or None if it cannot be read (then the stage lines are left out).

    Only an ApiError counts as "cannot be read" (the rule of WorldStageReader). Any other error is
    a bug, and it becomes a 500 instead of being hidden.
    """
    try:
        return await reader.read()
    except ApiError:
        return None


async def read_open_exchange(
    request: Request, settings: Settings, admin: SupabaseAdmin
) -> ExchangeSummary | None:
    """What the Exchange looks like, but only while the feature flag "market" is on."""
    if not is_enabled("market", settings.flags):
        return None
    return await read_exchange(request.app.state.market, admin)


def make_bulletin(
    now: datetime,
    weather: SourceResult | None,
    stage: WorldStage | None,
    exchange: ExchangeSummary | None,
    rules: StateRules,
    content: DailyContent,
) -> BulletinResponse:
    """Put the answer together from what the route read. Nothing here waits for a network."""
    hours: Sequence[HourReading] = () if weather is None else weather.data.hours
    frame = day_frame(now)
    outlook = make_outlook(now, hours, rules)
    fired_at = None
    if stage is not None:
        # The outlook has already sorted the hours into nights: the hook reuses that result.
        fired_at = hook_fired_at(
            now, stage, outlook.night_states, rules, content.hook.fires_by_night
        )
    lines = build_lines(
        now=now,
        frame=frame,
        outlook=outlook,
        stage=stage,
        exchange=exchange,
        hook_fired_at=fired_at,
        content=content,
    )
    return BulletinResponse(
        day=day_out(frame, content),
        lines=[LineOut(kind=line.kind, text=line.text) for line in lines],
        weather=weather_out(outlook, weather),
        exchange=exchange_out(exchange),
        chapterTwoHook=None if fired_at is None else hook_out(content),
    )


@router.get("/bulletin")
async def get_bulletin(
    request: Request,
    response: Response,
    settings: SettingsDep,
    admin: AdminDep,
    source: WeatherSourceDep,
    rules: WeatherRulesDep,
    content: DailyContentDep,
    stage_reader: WorldStageDep,
    clock: ClockDep,
) -> BulletinResponse:
    if not is_enabled("bulletin", settings.flags):
        raise ApiError(404, "feature_disabled", "The harbor bulletin is not available.")
    if rules is None or content is None:
        raise ApiError(503, "bulletin_unavailable", "The harbor bulletin is not available now.")
    now = clock()
    weather = await read_weather(source)
    stage = await read_stage(stage_reader)
    exchange = await read_open_exchange(request, settings, admin)
    # Set only after everything was read. An error answer never gets this header.
    response.headers["Cache-Control"] = CACHE_CONTROL
    return make_bulletin(now, weather, stage, exchange, rules, content)
