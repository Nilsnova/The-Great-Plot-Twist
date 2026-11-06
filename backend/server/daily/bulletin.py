"""The harbor bulletin: the lines that every player reads in the morning, in their fixed order.

The bulletin is the same for everyone (the next-lead line for a crew is served signed in by package
S3, so this stays public and cacheable). At most one line of each kind, always in this order:

    weather   "Tonight: {tonight}. Tomorrow: {tomorrow}." with a word for each state, or
              "no forecast" when no hour is known
    fog       only while the coast is dark, and only if tonight is a fog night: one text for a
              "real" fog night and one for a night the harbor's almanac calls
    exchange  the price feed, and the companies that are paused, from the Island Exchange
    relit     for relitLineHours after the first solve: the coast is relit
    hook      the Chapter 2 hook, in the bulletin of the morning it fires (H1)
    calendar  the dated notice of this bulletin day, if there is one

If the stage of the world cannot be read (`stage` is None), the fog, relit and hook lines are left
out. No text names the culprit or the case's answers, before or after the solve (CASE-FILE 14.3):
the texts are in bulletin.json and chapter_two_hook.json, and a test scans them.

Pure functions: no network, no clock of their own. routes/bulletin.py gathers the inputs.

Used by: routes/bulletin.py and the tests.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from server.daily.bulletin_content import BulletinContent
from server.daily.content import DailyContent
from server.daily.exchange_summary import ExchangeSummary
from server.daily.frame import DayFrame
from server.lisbon_time import game_day
from server.weather.outlook import Outlook
from server.world_stage import DARK, RELIT, WorldStage

# The kinds of line, in the order in which the lines appear.
KIND_WEATHER = "weather"
KIND_FOG = "fog"
KIND_EXCHANGE = "exchange"
KIND_RELIT = "relit"
KIND_HOOK = "hook"
KIND_CALENDAR = "calendar"


@dataclass(frozen=True)
class BulletinLine:
    """One line of the bulletin. `kind` says what it is about, `text` is what the player reads."""

    kind: str
    text: str


def state_word(state: str | None, content: BulletinContent) -> str:
    """The word for a weather state, or "no forecast" if the state is not known."""
    if state is None:
        return content.no_forecast
    return content.state_words[state]


def weather_line(outlook: Outlook, content: BulletinContent) -> BulletinLine:
    text = content.weather_line.replace(
        "{tonight}", state_word(outlook.tonight.state, content)
    ).replace("{tomorrow}", state_word(outlook.tomorrow.state, content))
    return BulletinLine(KIND_WEATHER, text)


def fog_line(
    outlook: Outlook, stage: WorldStage | None, content: BulletinContent
) -> BulletinLine | None:
    """The false-light warning. Only while the coast is dark: afterwards fog is just weather."""
    fog_night = outlook.tonight.fog_night
    if stage is None or stage.stage != DARK or not fog_night.is_fog_night:
        return None
    return BulletinLine(KIND_FOG, content.fog_night_lines[fog_night.kind])


def exchange_line(summary: ExchangeSummary | None, content: BulletinContent) -> BulletinLine | None:
    if summary is None:
        return None
    feed = content.feed_words.get(summary.feed, summary.feed)
    if not summary.paused:
        return BulletinLine(KIND_EXCHANGE, content.exchange_all_open.replace("{feed}", feed))
    names = ", ".join(company.name for company in summary.paused)
    text = content.exchange_some_paused.replace("{feed}", feed).replace("{companies}", names)
    return BulletinLine(KIND_EXCHANGE, text)


def relit_line(
    now: datetime, stage: WorldStage | None, content: BulletinContent
) -> BulletinLine | None:
    """The line for the first days after the first solve (half open: S up to S plus the hours)."""
    if stage is None or stage.stage != RELIT or stage.relit_at is None:
        return None
    until = stage.relit_at + timedelta(hours=content.relit_line_hours)
    if not stage.relit_at <= now < until:
        return None
    return BulletinLine(KIND_RELIT, content.relit_line)


def hook_line(
    frame: DayFrame, fired_at: datetime | None, content: DailyContent
) -> BulletinLine | None:
    """The hook line, only in the bulletin of the morning the hook fired (at 06:00)."""
    if fired_at is None or frame.bulletin_day != game_day(fired_at):
        return None
    return BulletinLine(KIND_HOOK, content.hook.bulletin_line)


def calendar_line(frame: DayFrame, content: BulletinContent) -> BulletinLine | None:
    """The notice that is dated for this bulletin day."""
    for notice in content.calendar:
        if notice.on == frame.bulletin_day:
            return BulletinLine(KIND_CALENDAR, notice.text)
    return None


def build_lines(
    *,
    now: datetime,
    frame: DayFrame,
    outlook: Outlook,
    stage: WorldStage | None,
    exchange: ExchangeSummary | None,
    hook_fired_at: datetime | None,
    content: DailyContent,
) -> list[BulletinLine]:
    """All the lines of the bulletin, in the fixed order. Kinds that do not apply are left out."""
    lines = [
        weather_line(outlook, content.bulletin),
        fog_line(outlook, stage, content.bulletin),
        exchange_line(exchange, content.bulletin),
        relit_line(now, stage, content.bulletin),
        hook_line(frame, hook_fired_at, content),
        calendar_line(frame, content.bulletin),
    ]
    return [line for line in lines if line is not None]
