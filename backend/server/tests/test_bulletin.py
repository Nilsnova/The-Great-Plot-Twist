"""Tests for routes/bulletin.py and daily/bulletin.py: GET /api/bulletin, the harbor bulletin.

The bulletin is public and the same for everyone. Its lines come from the weather (one fake
Open-Meteo), the world stage (a fake reader), the Island Exchange (a fake price feed) and the
content file bulletin.json. The "now" of every test is written out on a fake clock. Nothing here
uses the network.

Fixed numbers used again and again:
  * the clock starts at Monday 16 Nov 2026, 09:00 UTC (Day 1 of the game, an hour after the first
    bulletin). 16 Nov is a night of the harbor's almanac (one fog night in every three from Day 1),
  * a foggy hour or a clear hour comes from weather_helpers (FOGGY_HOUR, CLEAR_HOUR),
  * the first solve (RELIT_AT) is on Friday 20 Nov 2026 at 21:30 UTC.
"""

from dataclasses import replace
from datetime import timedelta

import httpx
import pytest

from server.errors import ApiError
from server.tests.bulletin_helpers import (
    MARKET_ON,
    RELIT_AT,
    URL,
    FixedStage,
    World,
    make_market,
    relit_at,
    spoilers_in,
    utc,
)
from server.tests.helpers import assert_error, fail_with, make_admin
from server.tests.weather_helpers import (
    CLEAR_HOUR,
    FOGGY_HOUR,
    LISBON_SETTINGS,
    answer_with_hours,
    hours_of,
    reply_with_answer,
)
from server.weather import nights
from server.weather.source import ATTRIBUTION

# --- the answer and who may ask ---


def test_the_bulletin_answers_without_signing_in_and_may_be_cached_for_five_minutes():
    response = World().get()

    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=300"


def test_bulletin_is_the_same_for_everyone_except_the_next_lead():
    world = World()
    world.get()  # the first ask fetches the weather ("live"); the next ones read the cache

    anonymous = world.get()
    ann = world.get(headers={"Authorization": "Bearer token-of-ann"})
    ben = world.get(headers={"Authorization": "Bearer token-of-ben"})

    assert anonymous.json() == ann.json() == ben.json()
    assert "lead" not in world.kinds()  # the next-lead line is served signed in, by package S3


def test_a_query_string_is_ignored():
    world = World()
    plain = world.body()  # the first ask fetches the weather; the next ones read the cache

    assert world.get(params={"place": "Paris", "day": "2030-01-01"}).json() == world.body()
    assert plain["day"] == world.body()["day"]


def test_only_get_is_allowed():
    client = World().client

    assert_error(client.post(URL), 405, "method_not_allowed")
    assert_error(client.put(URL), 405, "method_not_allowed")
    assert_error(client.delete(URL), 405, "method_not_allowed")


def test_bulletin_is_listed_in_the_api_docs_as_a_get_route():
    paths = World().client.get("/api/openapi.json").json()["paths"]

    assert list(paths["/api/bulletin"]) == ["get"]


def test_the_other_routes_still_never_touch_open_meteo():
    world = World()

    assert world.client.get("/api/health").status_code == 200
    assert world.client.get("/api/config").status_code == 200
    assert world.seen == []


# --- the shape of the answer ---


def test_the_fields_come_in_the_documented_order():
    body = World().body()

    assert list(body) == ["day", "lines", "weather", "exchange", "chapterTwoHook"]
    assert list(body["day"]) == [
        "id",
        "startedAt",
        "nextDayAt",
        "bulletinDay",
        "publishedAt",
        "nextBulletinAt",
        "harborWeek",
        "nextHarborWeekAt",
        "resets",
    ]
    assert list(body["weather"]) == ["tonight", "tomorrow", "source", "fetchedAt", "attribution"]
    assert list(body["weather"]["tonight"]) == [
        "date",
        "startsAt",
        "endsAt",
        "isNow",
        "state",
        "isFogNight",
        "fogNightKind",
    ]
    assert list(body["weather"]["tomorrow"]) == ["date", "startsAt", "endsAt", "state"]
    assert list(body["lines"][0]) == ["kind", "text"]


def test_the_day_object_has_the_agreed_values():
    day = World().body()["day"]

    assert day == {
        "id": "2026-11-16",
        "startedAt": "2026-11-16T00:00:00Z",
        "nextDayAt": "2026-11-17T00:00:00Z",
        "bulletinDay": "2026-11-16",
        "publishedAt": "2026-11-16T08:00:00Z",
        "nextBulletinAt": "2026-11-17T08:00:00Z",
        "harborWeek": "2026-11-16",
        "nextHarborWeekAt": "2026-11-23T00:00:00Z",
        "resets": [
            {"when": "Every day at 00:00", "what": "A new game day begins."},
            {"when": "Every day at 08:00", "what": "The harbor bulletin is published."},
            {"when": "Every Monday at 00:00", "what": "A new harbor week begins."},
            {"when": "Never", "what": "Coins, buildings, shares and titles never reset."},
        ],
    }


def test_the_example_of_the_contract_real_fog_on_day_1():
    # The answer shown in docs/INTERFACES.md: real fog tonight, a clear day tomorrow.
    night = hours_of(utc(2026, 11, 16, 20), 3, FOGGY_HOUR)
    day = hours_of(utc(2026, 11, 17, 6), 12, CLEAR_HOUR)
    world = World(now=utc(2026, 11, 16, 8, 55), hours={**night, **day})

    body = world.body()

    assert body["lines"] == [
        {"kind": "weather", "text": "Tonight: fog. Tomorrow: calm and clear."},
        {"kind": "fog", "text": "Fog tonight. Watch for the false light."},
        {
            "kind": "calendar",
            "text": "Day 1. From today the harbor bulletin comes out every morning at 8.",
        },
    ]
    assert body["weather"] == {
        "tonight": {
            "date": "2026-11-16",
            "startsAt": "2026-11-16T18:00:00Z",
            "endsAt": "2026-11-17T06:00:00Z",
            "isNow": False,
            "state": "fog",
            "isFogNight": True,
            "fogNightKind": "real",
        },
        "tomorrow": {
            "date": "2026-11-17",
            "startsAt": "2026-11-17T06:00:00Z",
            "endsAt": "2026-11-17T18:00:00Z",
            "state": "calm",
        },
        "source": "live",
        "fetchedAt": "2026-11-16T08:55:00Z",
        "attribution": "Weather data by Open-Meteo.com, adapted for the game",
    }
    assert body["exchange"] is None
    assert body["chapterTwoHook"] is None


# --- the lines ---

LINE_ORDER = ["weather", "fog", "exchange", "relit", "hook", "calendar"]


def exchange_world(feed_options: dict | None = None, **world_options) -> World:
    """A world with the flag "market" on and an Island Exchange on a fake price feed."""
    world = World(settings=MARKET_ON, **world_options)
    world.app.state.market = make_market(world.clock, **(feed_options or {}))
    return world


def in_the_fixed_order(kinds: list[str]) -> bool:
    return kinds == sorted(kinds, key=LINE_ORDER.index)


def test_the_lines_come_in_the_fixed_order():
    kinds = exchange_world().kinds()

    assert kinds == ["weather", "fog", "exchange", "calendar"]
    assert in_the_fixed_order(kinds)


def test_the_lines_of_a_relit_world_come_in_the_fixed_order():
    # Night 1 after the solve is the night of 21 Nov. It is clear, so the hook fires at 06:00 on
    # 22 Nov, and the bulletin of that morning has every line that a relit world can have.
    now = utc(2026, 11, 22, 9, 0)
    clear_night = hours_of(utc(2026, 11, 21, 18), 12, CLEAR_HOUR)
    world = exchange_world(now=now, hours=clear_night, stage=relit_at())
    content = world.app.state.daily_content
    notice = replace(content.bulletin.calendar[0], on=now.date(), text="A notice for today.")
    world.app.state.daily_content = replace(
        content, bulletin=replace(content.bulletin, calendar=(notice,))
    )

    kinds = world.kinds()

    assert kinds == ["weather", "exchange", "relit", "hook", "calendar"]
    assert in_the_fixed_order(kinds)


def test_the_weather_line_names_tonight_and_tomorrow_in_words():
    night = hours_of(utc(2026, 11, 16, 18), 12, CLEAR_HOUR)
    day = hours_of(utc(2026, 11, 17, 6), 12, FOGGY_HOUR)
    world = World(hours={**night, **day})

    assert world.texts()["weather"] == "Tonight: calm and clear. Tomorrow: fog."


def test_without_any_hours_the_weather_line_says_no_forecast():
    assert World().texts()["weather"] == "Tonight: no forecast. Tomorrow: no forecast."


# --- the fog line: only while the coast is dark ---


def test_a_real_fog_night_gets_the_real_line_while_the_coast_is_dark():
    world = World(hours=hours_of(utc(2026, 11, 16, 20), 3, FOGGY_HOUR))

    assert world.texts()["fog"] == "Fog tonight. Watch for the false light."


def test_an_almanac_fog_night_gets_the_almanac_line():
    # 16 Nov is a night of the harbor's almanac, and no hour is known, so only the rule calls it.
    world = World()

    assert world.texts()["fog"] == (
        "The harbor's almanac calls fog tonight. Watch for the false light."
    )


def test_a_night_that_is_not_a_fog_night_has_no_fog_line():
    world = World(now=utc(2026, 11, 17, 9, 0))  # the night after the almanac night

    assert "fog" not in world.kinds()


def test_after_the_relighting_there_is_no_false_light_line():
    # 22 Nov is a night of the almanac (6 days after Day 1), so a dark world would show the line.
    world = World(now=utc(2026, 11, 22, 9, 0), stage=relit_at(utc(2026, 11, 16, 12, 0)))

    assert world.body()["weather"]["tonight"]["isFogNight"] is True  # the verdict is still sent
    assert "fog" not in world.kinds()


def test_when_the_world_stage_cannot_be_read_the_stage_lines_are_left_out():
    stage = FixedStage(error=ApiError(503, "database_unavailable", "Down."))
    world = World(stage=stage)

    body = world.body()

    assert [line["kind"] for line in body["lines"]] == ["weather", "calendar"]
    assert body["chapterTwoHook"] is None


# --- the relit line: 48 hours after the Relighting ---


def test_the_relit_line_shows_for_48_hours():
    just_inside = World(now=RELIT_AT + timedelta(hours=47, minutes=59), stage=relit_at())
    at_the_end = World(now=RELIT_AT + timedelta(hours=48), stage=relit_at())

    assert just_inside.texts()["relit"] == (
        "The coast is relit. The false light is out. A crew found it."
    )
    assert "relit" not in at_the_end.kinds()


def test_there_is_no_relit_line_before_the_relighting_or_while_it_is_dark():
    assert "relit" not in World().kinds()


def test_the_relit_line_is_there_at_the_moment_of_the_relighting():
    world = World(now=RELIT_AT, stage=relit_at())

    assert "relit" in world.kinds()


def test_the_relit_line_is_not_there_a_second_before_the_relighting():
    # For example when this server's clock is a little behind the clock that wrote the time.
    world = World(now=RELIT_AT - timedelta(seconds=1), stage=relit_at())

    assert "relit" not in world.kinds()


def test_the_number_of_hours_comes_from_the_content_file():
    world = World(now=RELIT_AT + timedelta(hours=10), stage=relit_at())
    content = world.app.state.daily_content
    world.app.state.daily_content = replace(
        content, bulletin=replace(content.bulletin, relit_line_hours=6)
    )

    assert "relit" not in world.kinds()


# --- the calendar notice ---


def test_day_1_has_its_calendar_notice():
    assert World().texts()["calendar"] == (
        "Day 1. From today the harbor bulletin comes out every morning at 8."
    )


@pytest.mark.parametrize(
    ("now", "has_notice"),
    [
        (utc(2026, 11, 15, 9, 0), False),
        (utc(2026, 11, 16, 7, 59), False),  # the bulletin of 16 Nov is not out yet
        (utc(2026, 11, 16, 8, 0), True),
        (utc(2026, 11, 17, 7, 59), True),  # still the bulletin of 16 Nov
        (utc(2026, 11, 17, 8, 0), False),
    ],
)
def test_a_calendar_notice_belongs_to_one_bulletin_day(now, has_notice):
    assert ("calendar" in World(now=now).kinds()) is has_notice


# --- the Island Exchange line ---


def test_the_exchange_line_needs_the_market_flag():
    flag_off = World()  # LISBON_SETTINGS has every flag off
    flag_off.app.state.market = make_market(flag_off.clock)
    flag_on = exchange_world()

    assert "exchange" not in flag_off.kinds()
    assert flag_off.body()["exchange"] is None
    body = flag_on.body()
    assert (
        next(line["text"] for line in body["lines"] if line["kind"] == "exchange")
        == "Island Exchange: live. No company is paused."
    )
    assert body["exchange"] == {"feed": "live", "pausedCompanies": []}


def test_the_exchange_v2_has_no_pause_so_no_company_is_ever_paused():
    world = exchange_world()
    body = world.body()

    assert body["exchange"] == {
        "feed": "stale",
        "pausedCompanies": [{"id": "harbor-trust", "name": "Saltreach Harbor Trust"}],
    }
    assert (
        world.texts()["exchange"]
        == "Island Exchange: old prices (trading paused). Paused: Saltreach Harbor Trust."
    )


def test_two_paused_companies_are_listed_in_the_order_of_the_board():
    world = exchange_world()
    pause_company(world.app.state.market, "harbor-trust", world.clock)
    pause_company(world.app.state.market, "tidewright-works", world.clock)

    names = [company["name"] for company in world.body()["exchange"]["pausedCompanies"]]

    assert names == ["Saltreach Harbor Trust", "Tidewright Works"]


@pytest.mark.parametrize(
    ("feed", "words"),
    [
        ("live", "live"),
        ("cache", "recent prices"),
        ("stale", "old prices (trading paused)"),
        ("replay", "replay"),
    ],
)
def test_the_feed_is_named_in_words(feed, words):
    world = exchange_world({"source": feed})

    assert world.body()["exchange"]["feed"] == feed
    if feed == "stale":
        assert len(world.body()["exchange"]["pausedCompanies"]) == 7
    else:
        assert world.texts()["exchange"] == f"Island Exchange: {words}. No company is paused."


def test_a_failing_exchange_leaves_out_the_exchange_line():
    world = exchange_world({"failing": True})

    body = world.body()

    assert body["exchange"] is None
    assert "exchange" not in [line["kind"] for line in body["lines"]]


def test_the_bulletin_only_looks_at_the_exchange_it_saves_nothing():
    world = exchange_world()

    world.app.state.admin, seen = make_admin(lambda request: httpx.Response(500))

    world.body()

    assert world.app.state.market.feed.asked == 1


def test_a_missing_exchange_service_leaves_out_the_exchange_line():
    world = World(settings=MARKET_ON)
    world.app.state.market = None

    assert world.body()["exchange"] is None


# --- when the weather is not there ---


def test_with_open_meteo_down_and_no_recording_the_bulletin_still_answers(tmp_path):
    world = World(reply=fail_with(httpx.ConnectError), recorded_folder=tmp_path)

    body = world.body()

    assert body["weather"]["source"] is None
    assert body["weather"]["fetchedAt"] is None
    assert body["weather"]["attribution"] is None
    assert body["weather"]["tonight"]["state"] is None
    assert body["weather"]["tomorrow"]["state"] is None
    assert body["weather"]["tonight"]["fogNightKind"] == "almanac"  # the almanac still decides
    assert body["lines"][0]["text"] == "Tonight: no forecast. Tomorrow: no forecast."


def test_with_open_meteo_down_the_recorded_answer_gives_no_hours_but_the_credit():
    world = World(reply=fail_with(httpx.ConnectError))

    weather = world.body()["weather"]

    assert weather["source"] == "fallback"
    assert weather["attribution"] == ATTRIBUTION
    assert weather["tonight"]["state"] is None


@pytest.mark.parametrize(
    "reply", [None, fail_with(httpx.ConnectError)], ids=["open-meteo-up", "open-meteo-down"]
)
def test_the_bulletin_carries_the_weather_credit_whenever_it_shows_weather(reply):
    weather = World(reply=reply).body()["weather"]

    assert weather["source"] is not None
    assert weather["attribution"] == ATTRIBUTION
    assert weather["fetchedAt"] is not None


def test_the_bulletin_and_the_weather_route_agree_on_tonight():
    night = hours_of(utc(2026, 11, 16, 20), 3, FOGGY_HOUR)
    world = World(hours=night)

    from_the_weather_route = world.client.get("/api/weather").json()["tonight"]
    from_the_bulletin = world.body()["weather"]["tonight"]

    assert from_the_bulletin == from_the_weather_route
    assert from_the_bulletin["fogNightKind"] == "real"


def test_the_bulletin_and_the_weather_route_share_one_open_meteo_request():
    world = World()

    world.client.get("/api/weather")
    world.get()
    world.get()

    assert len(world.seen) == 1


def test_the_outlook_follows_the_clock_and_not_the_time_the_weather_was_fetched():
    # The weather is fetched at 05:58, in the night of 16 Nov, and stays in the cache for ten
    # minutes. At 06:02 that night is over, so tonight is the coming night, the one of 17 Nov.
    world = World(now=utc(2026, 11, 17, 5, 58))
    before = world.body()["weather"]["tonight"]

    world.clock.advance(4 * 60)
    after = world.body()["weather"]

    assert (before["date"], before["isNow"]) == ("2026-11-16", True)
    assert (after["source"], after["fetchedAt"]) == ("cache", "2026-11-17T05:58:00Z")
    assert (after["tonight"]["date"], after["tonight"]["isNow"]) == ("2026-11-17", False)


def test_in_demo_mode_the_bulletin_never_calls_open_meteo():
    world = World(settings=replace(LISBON_SETTINGS, demo_mode=True))

    weather = world.body()["weather"]

    assert world.seen == []
    assert weather["source"] == "fallback"


def test_an_hour_in_the_year_1_in_the_weather_answer_does_not_break_the_bulletin():
    # A broken answer from Open-Meteo: one of the three foggy hours of tonight has the time
    # "0001-01-01T00:00". That hour is left out, so two foggy hours are left, which is not a fog.
    answer = answer_with_hours("rain", hours_of(utc(2026, 11, 16, 20), 3, FOGGY_HOUR))
    answer["hourly"]["time"][0] = "0001-01-01T00:00"
    world = World(reply=reply_with_answer(answer))

    weather = world.body()["weather"]

    assert weather["source"] == "live"
    assert weather["tonight"]["state"] == "calm"


def test_a_request_sorts_the_hours_into_nights_only_once(monkeypatch):
    # Sorting about 800 hours is the costly part of the bulletin. The weather part and the
    # Chapter 2 hook must share one pass, so a request does it once.
    passes = []
    sort_hours = nights.sort_hours

    def counting_sort_hours(hours, rules):
        passes.append(len(hours))
        return sort_hours(hours, rules)

    monkeypatch.setattr(nights, "sort_hours", counting_sort_hours)
    world = World(hours=hours_of(utc(2026, 11, 16, 6), 24, CLEAR_HOUR), stage=relit_at())

    world.body()

    assert passes == [24]


# --- when the content is not there ---


@pytest.mark.parametrize("state_name", ["daily_content", "weather_rules"])
def test_without_its_content_the_bulletin_answers_503_bulletin_unavailable(state_name):
    world = World()
    setattr(world.app.state, state_name, None)

    response = world.get()

    assert_error(response, 503, "bulletin_unavailable")
    assert "max-age" not in response.headers.get("cache-control", "")


# --- no spoilers ---


@pytest.mark.parametrize(
    "world_options",
    [
        {},
        {"hours": hours_of(utc(2026, 11, 16, 20), 3, FOGGY_HOUR)},
        {"now": utc(2026, 11, 22, 9, 0), "stage": relit_at()},
        {"now": utc(2026, 11, 23, 9, 0), "stage": relit_at(utc(2026, 11, 1, 12, 0))},
    ],
)
def test_the_bulletin_never_names_the_culprit(world_options):
    assert spoilers_in(World(**world_options).get().text) == []
