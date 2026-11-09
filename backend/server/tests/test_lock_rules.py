"""Tests for the pure parts of the Keeper's Lock: skies, verdicts, the words file and the place.

No network, no database.
"""

import json

import pytest
from starlette.datastructures import Headers

from server.lock.content import LOCK_PATH, lock_content, read_lock_content
from server.lock.place import UNKNOWN_CITY, default_place, find_place, place_from_headers
from server.lock.places import parse_places
from server.lock.sky import NEIGHBOURS, SKIES, History, history_of, judge, sky_of, sky_of_code
from server.lock.weather import place_key
from server.settings import Settings
from server.weather.mapping import WEATHER_CODES, WeatherReading

CLUE = ("beam", "smoke", "song", "flags")


# --- skies ---


@pytest.mark.parametrize(
    ("code", "sky"),
    [
        (0, "clear"),
        (1, "clear"),
        (2, "cloudy"),
        (3, "cloudy"),
        (45, "fog"),
        (48, "fog"),
        (51, "rain"),
        (57, "rain"),
        (61, "rain"),
        (67, "rain"),
        (80, "rain"),
        (82, "rain"),
        (95, "rain"),
        (99, "rain"),
        (71, "snow"),
        (77, "snow"),
        (85, "snow"),
        (86, "snow"),
    ],
)
def test_wmo_codes_map_to_the_five_skies(code, sky):
    assert sky_of_code(code) == sky


def test_every_code_the_game_knows_has_a_sky():
    assert all(sky_of_code(code) in SKIES for code in WEATHER_CODES)


def test_without_a_code_the_other_numbers_decide():
    assert sky_of(WeatherReading(precipitation_mm_per_hour=1.0)) == "rain"
    assert sky_of(WeatherReading(visibility_m=400)) == "fog"
    assert sky_of(WeatherReading(cloud_cover_percent=10)) == "clear"
    assert sky_of(WeatherReading(cloud_cover_percent=80)) == "cloudy"
    assert sky_of(WeatherReading(weather_code=12345, cloud_cover_percent=80)) == "cloudy"
    assert sky_of(WeatherReading(is_day=True)) is None


def test_close_enough_is_symmetric_and_never_the_sky_itself():
    for sky, neighbours in NEIGHBOURS.items():
        assert sky not in neighbours
        for other in neighbours:
            assert sky in NEIGHBOURS[other]
    assert set(NEIGHBOURS) == set(SKIES)
    assert "clear" not in NEIGHBOURS["rain"]


# --- verdicts ---


FRESH = History()


def weather(answer, sky="rain", history=FRESH):
    return judge(answer, "weather", sky, CLUE, "beam", history)


def test_weather_verdicts():
    assert weather("rain") == "exact"
    assert weather("cloudy") == "close"
    assert weather("snow") == "close"
    assert weather("clear") == "wrong"
    assert weather("beam") == "question_changed"


def test_clue_verdicts():
    assert judge("beam", "clue", None, CLUE, "beam", History()) == "clue"
    assert judge("song", "clue", None, CLUE, "beam", History()) == "wrong"
    assert judge("rain", "clue", None, CLUE, "beam", History()) == "question_changed"


def test_the_hint_path_needs_an_honest_try_then_a_confirmation():
    assert weather("hint") == "hint_too_early"
    assert weather("hint_confirm") == "hint_too_early"
    after_wrong = History(wrong=1)
    assert weather("hint", history=after_wrong) == "hint_offered"
    assert weather("hint_confirm", history=after_wrong) == "hint_too_early"
    assert weather("hint_confirm", history=History(wrong=1, hint_offered=True)) == "hint"


def test_history_from_stored_rows():
    rows = [("wrong", False), ("hint_offered", False), ("wrong", False)]
    assert history_of(rows) == History(opened=False, wrong=2, hint_offered=True)
    assert history_of([*rows, ("hint", True)]).opened is True


# --- the words file ---


def test_the_real_words_file_loads():
    content = lock_content()
    assert [choice.id for choice in content.skies] == list(SKIES)
    assert content.clue_answer in {choice.id for choice in content.clue_choices}
    assert "{place}" in content.weather_question


def test_a_clue_choice_that_looks_like_a_sky_is_refused(tmp_path):
    data = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    data["clue"]["choices"][0]["id"] = "rain"
    data["clue"]["answer"] = "rain"
    path = tmp_path / "keeper_lock.json"
    path.write_text(json.dumps(data))

    with pytest.raises(ValueError, match="differ from the skies"):
        read_lock_content(path)


# --- the place ---


SETTINGS = Settings()


def test_the_ip_headers_give_a_city_level_place():
    headers = Headers(
        {
            "x-vercel-ip-city": "S%C3%A3o%20Paulo",
            "x-vercel-ip-latitude": "-23.5475",
            "x-vercel-ip-longitude": "-46.6361",
        }
    )

    place = place_from_headers(headers)

    assert (place.name, place.latitude, place.longitude, place.source) == (
        "São Paulo",
        -23.5475,
        -46.6361,
        "ip",
    )


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"x-vercel-ip-latitude": "38.7"},
        {"x-vercel-ip-latitude": "91", "x-vercel-ip-longitude": "0"},
        {"x-vercel-ip-latitude": "nan", "x-vercel-ip-longitude": "0"},
        {"x-vercel-ip-latitude": "38.7", "x-vercel-ip-longitude": "east"},
    ],
)
def test_odd_or_missing_coordinates_fall_back_to_the_default_place(headers):
    place = find_place(None, Headers(headers), SETTINGS)

    assert place == default_place(SETTINGS)
    assert place.source == "default"


@pytest.mark.parametrize("city", [None, "%FF%FE", "Line%0Abreak", "x" * 61])
def test_an_odd_city_name_becomes_your_area(city):
    values = {"x-vercel-ip-latitude": "38.7", "x-vercel-ip-longitude": "-9.1"}
    if city is not None:
        values["x-vercel-ip-city"] = city

    assert place_from_headers(Headers(values)).name == UNKNOWN_CITY


def test_coordinates_share_a_cache_key_within_about_ten_kilometres():
    assert place_key(38.7167, -9.1333) == place_key(38.72, -9.14) == (38.7, -9.1)


# --- the place search answer ---


def test_the_geocoding_answer_keeps_good_places_only():
    body = {
        "results": [
            {
                "name": "Lisbon",
                "latitude": 38.71667,
                "longitude": -9.13333,
                "country": "Portugal",
                "admin1": "Lisbon",
            },
            {"name": "Nowhere", "latitude": 200, "longitude": 0},
            {"name": "", "latitude": 1, "longitude": 1},
            "junk",
            {"name": "Lisboa", "latitude": 1, "longitude": True},
        ]
    }

    places = parse_places(body)

    assert [place.name for place in places] == ["Lisbon"]
    assert parse_places({}) == ()
    with pytest.raises(ValueError):
        parse_places([])
