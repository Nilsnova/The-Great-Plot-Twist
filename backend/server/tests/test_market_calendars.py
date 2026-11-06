"""Tests for market/calendars.py and the real file backend/content/market/calendars.json.

The calendar says when each stock market is open (New York, Euronext, Xetra), with holidays and
short days, from 6 Nov to 31 Dec 2026. Island companies are always open. Every "now" is written
out, and the tests use no clock and no network.

Dates of November and December 2026 used below: Fri 6 Nov, Mon 9 Nov, Wed 25 Nov, Thu 26 Nov
(Thanksgiving Day in New York), Fri 27 Nov, Thu 24 Dec, Fri 25 Dec, Sat 26 Dec, Mon 28 Dec,
Wed 30 Dec, Thu 31 Dec.
"""

import json
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import pytest

from server.market import calendars as calendars_module
from server.market.calendars import (
    ALWAYS,
    CALENDARS_FILE,
    CalendarError,
    load_calendars,
)

CALENDARS = load_calendars()


def utc(month: int, day: int, hour: int = 12, minute: int = 0, second: int = 0) -> datetime:
    """A moment in 2026, in UTC."""
    return datetime(2026, month, day, hour, minute, second, tzinfo=UTC)


def session(market_id: str, moment: datetime):
    return CALENDARS.session_at(market_id, moment)


# --- the real file ---


def test_the_real_file_covers_6_november_to_31_december_2026():
    assert CALENDARS.valid_from == date(2026, 11, 6)
    assert CALENDARS.valid_to == date(2026, 12, 31)
    assert CALENDARS.checked_on == date(2026, 11, 5)


def test_the_real_file_has_new_york_euronext_and_xetra():
    assert list(CALENDARS.markets) == ["us", "euronext", "xetra"]


def test_every_market_has_a_name_a_source_and_a_fixed_utc_offset():
    offsets = {market.id: market.utc_offset for market in CALENDARS.markets.values()}

    assert offsets == {
        "us": timedelta(hours=-5),
        "euronext": timedelta(hours=1),
        "xetra": timedelta(hours=1),
    }
    assert CALENDARS.markets["us"].name == "New York (NYSE and Nasdaq)"
    assert all(market.source.startswith("https://") for market in CALENDARS.markets.values())


def test_the_utc_offsets_of_the_file_match_the_timezone_database_on_every_day_of_the_window():
    try:
        zones = {m.id: ZoneInfo(m.time_zone) for m in CALENDARS.markets.values()}
    except ZoneInfoNotFoundError:
        pytest.skip("this computer has no timezone database")
    days = [CALENDARS.valid_from + timedelta(days=n) for n in range(56)]

    for market in CALENDARS.markets.values():
        offsets = {
            datetime(day.year, day.month, day.day, 12, tzinfo=zones[market.id]).utcoffset()
            for day in days
        }
        assert offsets == {market.utc_offset}, market.id


# --- an island company is always open ---


def test_an_island_company_is_always_open_with_no_times():
    for moment in (utc(11, 7, 3), utc(12, 25, 12), utc(1, 1, 0)):
        look = session(ALWAYS, moment)

        assert look.is_open is True
        assert (look.reason, look.opens_at, look.closes_at, look.opened_at) == (None,) * 4


def test_the_name_of_the_always_open_market_is_around_the_clock():
    assert CALENDARS.market_name(ALWAYS) == "Around the clock"
    assert CALENDARS.market_name("us") == "New York (NYSE and Nasdaq)"


# --- New York ---


@pytest.mark.parametrize(
    ("moment", "is_open"),
    [
        (utc(11, 9, 14, 29, 59), False),
        (utc(11, 9, 14, 30, 0), True),
        (utc(11, 9, 20, 59, 59), True),
        (utc(11, 9, 21, 0, 0), False),
    ],
)
def test_new_york_is_open_from_14_30_to_21_00_utc_on_a_normal_weekday(moment, is_open):
    assert session("us", moment).is_open is is_open


def test_an_open_session_says_when_today_s_session_began_and_when_it_ends():
    look = session("us", utc(11, 9, 16, 0))

    assert look.is_open is True
    assert look.reason is None
    assert look.opened_at == utc(11, 9, 14, 30)
    assert look.closes_at == utc(11, 9, 21, 0)


def test_new_york_is_closed_on_thanksgiving_day_and_the_calendar_says_so_by_name():
    look = session("us", utc(11, 26, 16, 0))

    assert look.is_open is False
    assert look.reason == "holiday"
    assert look.holiday == "Thanksgiving Day"
    assert look.opens_at == utc(11, 27, 14, 30)


@pytest.mark.parametrize("day", [(11, 27), (12, 24)])
def test_new_york_closes_at_18_00_utc_on_a_short_day(day):
    month, number = day

    assert session("us", utc(month, number, 17, 59, 59)).is_open is True
    assert session("us", utc(month, number, 18, 0, 0)).is_open is False


def test_a_short_day_is_open_from_the_normal_time():
    assert session("us", utc(11, 27, 14, 30)).is_open is True
    assert session("us", utc(11, 27, 14, 29)).is_open is False


def test_new_york_is_closed_on_christmas_day():
    look = session("us", utc(12, 25, 16, 0))

    assert (look.is_open, look.reason, look.holiday) == (False, "holiday", "Christmas Day")


# --- Euronext and Xetra ---


@pytest.mark.parametrize("market_id", ["euronext", "xetra"])
def test_the_european_markets_are_open_from_08_00_to_16_30_utc(market_id):
    assert session(market_id, utc(11, 9, 7, 59, 59)).is_open is False
    assert session(market_id, utc(11, 9, 8, 0, 0)).is_open is True
    assert session(market_id, utc(11, 9, 16, 29, 59)).is_open is True
    assert session(market_id, utc(11, 9, 16, 30, 0)).is_open is False


def test_at_the_class_time_the_european_markets_are_open_and_new_york_is_closed():
    class_time = utc(11, 9, 11, 0)

    assert session("euronext", class_time).is_open is True
    assert session("xetra", class_time).is_open is True
    assert session("us", class_time).is_open is False


@pytest.mark.parametrize("day", [24, 25, 31])
def test_xetra_is_closed_on_24_25_and_31_december(day):
    look = session("xetra", utc(12, day, 12, 0))

    assert (look.is_open, look.reason) == (False, "holiday")


@pytest.mark.parametrize("day", [24, 31])
def test_euronext_closes_at_13_05_utc_on_24_and_31_december(day):
    assert session("euronext", utc(12, day, 13, 4, 59)).is_open is True
    assert session("euronext", utc(12, day, 13, 5, 0)).is_open is False


def test_euronext_is_closed_on_christmas_day():
    look = session("euronext", utc(12, 25, 12, 0))

    assert (look.is_open, look.reason) == (False, "holiday")


# --- weekends and the next opening ---


@pytest.mark.parametrize("moment", [utc(11, 7, 12, 0), utc(11, 8, 12, 0)])
def test_saturdays_and_sundays_are_closed(moment):
    look = session("us", moment)

    assert (look.is_open, look.reason) == (False, "weekend")


def test_a_weekend_opens_again_on_monday():
    assert session("us", utc(11, 7, 12, 0)).opens_at == utc(11, 9, 14, 30)
    assert session("us", utc(11, 8, 23, 59)).opens_at == utc(11, 9, 14, 30)


def test_before_the_opening_the_market_is_closed_outside_its_hours_and_opens_today():
    look = session("us", utc(11, 9, 9, 0))

    assert (look.is_open, look.reason) == (False, "outside_hours")
    assert look.opens_at == utc(11, 9, 14, 30)


def test_after_the_close_the_next_opening_skips_the_weekend():
    look = session("us", utc(11, 6, 21, 30))  # Friday evening

    assert (look.is_open, look.reason) == (False, "outside_hours")
    assert look.opens_at == utc(11, 9, 14, 30)


def test_the_next_opening_skips_a_holiday():
    look = session("us", utc(11, 25, 22, 0))  # Wednesday evening, Thursday is Thanksgiving Day

    assert look.opens_at == utc(11, 27, 14, 30)


def test_after_christmas_eve_the_next_opening_skips_christmas_day_and_the_weekend():
    assert session("us", utc(12, 24, 19, 0)).opens_at == utc(12, 28, 14, 30)
    assert session("xetra", utc(12, 23, 17, 0)).opens_at == utc(12, 28, 8, 0)
    assert session("euronext", utc(12, 24, 14, 0)).opens_at == utc(12, 28, 8, 0)


def test_when_the_next_opening_is_beyond_the_calendar_there_is_no_opening_time():
    look = session("xetra", utc(12, 30, 17, 0))  # 31 Dec is a holiday, 1 Jan is not covered

    assert (look.is_open, look.reason) == (False, "outside_hours")
    assert look.opens_at is None


# --- outside the calendar ---


def test_after_the_calendar_the_reason_is_no_calendar_with_no_opening_time():
    look = session("us", datetime(2027, 1, 4, 15, 0, tzinfo=UTC))

    assert (look.is_open, look.reason, look.opens_at) == (False, "no_calendar", None)


def test_before_the_calendar_the_reason_is_no_calendar_too():
    look = session("us", utc(11, 5, 15, 0))

    assert (look.is_open, look.reason) == (False, "no_calendar")


def test_the_last_moment_of_the_calendar_still_counts():
    assert session("xetra", utc(12, 30, 12, 0)).is_open is True
    assert session("us", utc(12, 31, 15, 0)).is_open is True
    assert session("us", utc(12, 31, 23, 59, 59)).reason == "outside_hours"
    assert session("us", utc(12, 31, 23, 59, 59)).opens_at is None


# --- the latest close, for the rule about calls while a market is closed ---


def test_a_closed_market_says_when_its_latest_session_ended():
    assert session("us", utc(11, 7, 12, 0)).last_close == utc(11, 6, 21, 0)  # Saturday
    assert session("us", utc(11, 9, 9, 0)).last_close == utc(11, 6, 21, 0)  # Monday before open
    assert session("us", utc(11, 9, 22, 0)).last_close == utc(11, 9, 21, 0)  # Monday evening


def test_the_latest_close_of_a_holiday_is_the_session_before_it():
    assert session("us", utc(11, 26, 16, 0)).last_close == utc(11, 25, 21, 0)


def test_the_latest_close_of_a_short_day_is_the_early_close():
    assert session("us", utc(11, 27, 19, 0)).last_close == utc(11, 27, 18, 0)


def test_after_the_calendar_the_latest_close_is_the_last_session_of_the_calendar():
    look = session("us", datetime(2027, 1, 4, 15, 0, tzinfo=UTC))

    assert look.last_close == utc(12, 31, 21, 0)


def test_before_the_calendar_there_is_no_latest_close():
    assert session("us", utc(11, 5, 15, 0)).last_close is None


# --- an unknown market ---


def test_asking_for_a_market_that_is_not_in_the_file_is_an_error():
    with pytest.raises(KeyError):
        session("mars", utc(11, 9, 12, 0))


# --- bad calendar files are refused with the market and the field named ---

GOOD_MARKET = {
    "id": "us",
    "name": "New York (NYSE and Nasdaq)",
    "timeZone": "America/New_York",
    "utcOffset": "-05:00",
    "opens": "09:30",
    "closes": "16:00",
    "closedDays": [{"date": "2026-11-26", "name": "Thanksgiving Day"}],
    "shortDays": [{"date": "2026-11-27", "closes": "13:00", "name": "Day after Thanksgiving"}],
    "source": "https://www.nyse.com/markets/hours-calendars",
}


def write_calendars(tmp_path, market_changes=None, **file_changes):
    market = {**GOOD_MARKET, **(market_changes or {})}
    data = {
        "about": "A test calendar.",
        "validFrom": "2026-11-06",
        "validTo": "2026-12-31",
        "checkedOn": "2026-11-05",
        "markets": [market],
    }
    data.update(file_changes)
    path = tmp_path / "calendars.json"
    path.write_text(json.dumps(data))
    return path


def test_a_good_small_file_loads(tmp_path):
    loaded = load_calendars(write_calendars(tmp_path))

    assert list(loaded.markets) == ["us"]
    assert loaded.markets["us"].closed_days == {date(2026, 11, 26): "Thanksgiving Day"}


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"id": "Us"}, r"markets\[0\].*'id'"),
        ({"id": "always"}, r"'id'.*always"),
        ({"name": ""}, r"market 'us'.*'name'"),
        ({"timeZone": ""}, r"market 'us'.*'timeZone'"),
        ({"utcOffset": "-5"}, r"market 'us'.*'utcOffset'"),
        ({"utcOffset": "-05:60"}, r"market 'us'.*'utcOffset'"),
        ({"opens": "9:30"}, r"market 'us'.*'opens'"),
        ({"closes": "25:00"}, r"market 'us'.*'closes'"),
        ({"opens": "16:00", "closes": "09:30"}, r"market 'us'.*'opens'.*before.*'closes'"),
        ({"source": "http://example.org"}, r"market 'us'.*'source'"),
        ({"closedDays": "none"}, r"market 'us'.*'closedDays'"),
        ({"closedDays": [{"date": "2026-02-30", "name": "x"}]}, r"market 'us'.*closedDays.*date"),
        ({"closedDays": [{"date": "2027-01-01", "name": "x"}]}, r"closedDays.*inside"),
        ({"closedDays": [{"date": "2026-11-26", "name": ""}]}, r"closedDays.*'name'"),
        (
            {
                "closedDays": [
                    {"date": "2026-11-26", "name": "a"},
                    {"date": "2026-11-26", "name": "b"},
                ]
            },
            r"closedDays.*twice",
        ),
        ({"shortDays": [{"date": "2026-11-26", "closes": "13:00", "name": "x"}]}, r"both"),
        (
            {"shortDays": [{"date": "2026-11-27", "closes": "17:00", "name": "x"}]},
            r"shortDays.*'closes'.*before",
        ),
        (
            {"shortDays": [{"date": "2026-11-27", "closes": "09:00", "name": "x"}]},
            r"shortDays.*'closes'.*after",
        ),
        ({"shortDays": [{"date": "2026-11-27", "name": "x"}]}, r"shortDays.*'closes'"),
    ],
)
def test_a_bad_market_is_refused_and_the_message_names_the_market_and_the_field(
    tmp_path, changes, message
):
    with pytest.raises(CalendarError, match=message):
        load_calendars(write_calendars(tmp_path, market_changes=changes))


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"validFrom": "yesterday"}, "validFrom"),
        ({"validTo": "2026-02-30"}, "validTo"),
        ({"validFrom": "2027-01-01"}, "validFrom.*not after.*validTo"),
        ({"checkedOn": None}, "checkedOn"),
        ({"markets": []}, "markets"),
        ({"markets": "us"}, "markets"),
    ],
)
def test_a_bad_file_header_is_refused_and_the_message_names_the_field(tmp_path, changes, message):
    with pytest.raises(CalendarError, match=message):
        load_calendars(write_calendars(tmp_path, **changes))


def test_two_markets_cannot_share_an_id(tmp_path):
    path = write_calendars(tmp_path, markets=[GOOD_MARKET, GOOD_MARKET])

    with pytest.raises(CalendarError, match="same 'id'"):
        load_calendars(path)


def test_a_market_that_is_not_an_object_is_refused(tmp_path):
    with pytest.raises(CalendarError, match=r"markets\[0\] must be an object"):
        load_calendars(write_calendars(tmp_path, markets=["us"]))


def test_a_file_that_is_not_json_or_is_missing_is_refused(tmp_path):
    broken = tmp_path / "broken.json"
    broken.write_text("not json")

    with pytest.raises(CalendarError, match="Cannot read"):
        load_calendars(broken)
    with pytest.raises(CalendarError, match="Cannot read"):
        load_calendars(tmp_path / "missing.json")


def test_the_real_file_is_the_file_the_loader_reads_by_default():
    assert CALENDARS_FILE.name == "calendars.json"
    assert calendars_module.CALENDARS_FILE == CALENDARS_FILE
    assert json.loads(CALENDARS_FILE.read_text())["markets"][0]["id"] == "us"
