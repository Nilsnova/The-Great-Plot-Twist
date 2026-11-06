"""The shape of the answer of GET /api/bulletin, and the functions that fill it.

routes/bulletin.py reads the weather, the world stage and the Island Exchange. This file is the
other half: the Pydantic models that say which JSON fields the answer has, and one small function
for each part that turns a plain object (the day frame, the outlook, the exchange summary, the
hook content) into its model. The route stays short, and the shape of the answer is in one place.
The fields are explained in the header of routes/bulletin.py and in docs/INTERFACES.md.

The names are camelCase on purpose: they are the exact JSON keys that the browser reads.

Used by: routes/bulletin.py and the tests (through the route).
"""

from pydantic import BaseModel

from server.adapters.base import SourceKind, SourceResult
from server.daily.content import DailyContent
from server.daily.exchange_summary import ExchangeSummary
from server.daily.frame import DayFrame
from server.routes.weather import TonightOut, tonight_out
from server.weather.mapping import format_utc_time
from server.weather.outlook import Outlook, Tomorrow
from server.weather.source import ATTRIBUTION


class ResetOut(BaseModel):
    when: str
    what: str


class DayOut(BaseModel):
    """The Lisbon clock around now. camelCase on purpose: these are the keys the browser reads."""

    id: str
    startedAt: str
    nextDayAt: str
    bulletinDay: str
    publishedAt: str
    nextBulletinAt: str
    harborWeek: str
    nextHarborWeekAt: str
    resets: list[ResetOut]


class LineOut(BaseModel):
    kind: str
    text: str


class TomorrowOut(BaseModel):
    date: str
    startsAt: str
    endsAt: str
    state: str | None


class WeatherOut(BaseModel):
    tonight: TonightOut
    tomorrow: TomorrowOut
    source: SourceKind | None
    fetchedAt: str | None
    attribution: str | None


class PausedCompanyOut(BaseModel):
    id: str
    name: str


class ExchangeOut(BaseModel):
    feed: str
    pausedCompanies: list[PausedCompanyOut]


class NoticeOut(BaseModel):
    title: str
    text: str


class ChartPointOut(BaseModel):
    x: int
    y: int


class FlashOut(BaseModel):
    shortSeconds: float
    longSeconds: float
    gapSeconds: float
    pauseSeconds: float


class BeamOut(BaseModel):
    chart: ChartPointOut
    pattern: list[str]
    flash: FlashOut


class HookOut(BaseModel):
    id: str
    notice: NoticeOut
    beam: BeamOut


class BulletinResponse(BaseModel):
    """What /api/bulletin returns. It contains no secrets and nothing about a player."""

    day: DayOut
    lines: list[LineOut]
    weather: WeatherOut
    exchange: ExchangeOut | None
    chapterTwoHook: HookOut | None


def day_out(frame: DayFrame, content: DailyContent) -> DayOut:
    return DayOut(
        id=frame.day.isoformat(),
        startedAt=format_utc_time(frame.started_at),
        nextDayAt=format_utc_time(frame.next_day_at),
        bulletinDay=frame.bulletin_day.isoformat(),
        publishedAt=format_utc_time(frame.published_at),
        nextBulletinAt=format_utc_time(frame.next_bulletin_at),
        harborWeek=frame.harbor_week.isoformat(),
        nextHarborWeekAt=format_utc_time(frame.next_harbor_week_at),
        resets=[ResetOut(when=r.when, what=r.what) for r in content.bulletin.resets],
    )


def tomorrow_out(tomorrow: Tomorrow) -> TomorrowOut:
    window = tomorrow.window
    return TomorrowOut(
        date=window.date.isoformat(),
        startsAt=format_utc_time(window.starts_at),
        endsAt=format_utc_time(window.ends_at),
        state=tomorrow.state,
    )


def weather_out(outlook: Outlook, result: SourceResult | None) -> WeatherOut:
    """The weather part. Without a weather answer the three credit fields are null."""
    return WeatherOut(
        tonight=tonight_out(outlook.tonight),
        tomorrow=tomorrow_out(outlook.tomorrow),
        source=None if result is None else result.source,
        fetchedAt=None if result is None else format_utc_time(result.fetched_at),
        attribution=None if result is None else ATTRIBUTION,
    )


def exchange_out(summary: ExchangeSummary | None) -> ExchangeOut | None:
    if summary is None:
        return None
    paused = [PausedCompanyOut(id=company.id, name=company.name) for company in summary.paused]
    return ExchangeOut(feed=summary.feed, pausedCompanies=paused)


def hook_out(content: DailyContent) -> HookOut:
    hook = content.hook
    return HookOut(
        id=hook.id,
        notice=NoticeOut(title=hook.notice_title, text=hook.notice_text),
        beam=BeamOut(
            chart=ChartPointOut(x=hook.chart_x, y=hook.chart_y),
            pattern=list(hook.pattern),
            flash=FlashOut(
                shortSeconds=hook.flash.short_seconds,
                longSeconds=hook.flash.long_seconds,
                gapSeconds=hook.flash.gap_seconds,
                pauseSeconds=hook.flash.pause_seconds,
            ),
        ),
    )
