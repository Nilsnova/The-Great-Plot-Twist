"""Weather route: GET /api/weather sends the real weather of one place, ready for the game.

The place comes from the settings (WEATHER_PLACE_NAME, WEATHER_LATITUDE, WEATHER_LONGITUDE, by
default Torshavn in the Faroe Islands). The weather comes from Open-Meteo, through the cached
source in weather/source.py, so Open-Meteo is called at most once per 10 minutes by this server
instance, however many players ask.

    GET /api/weather
      200  {"cloudCover": 1.0, "rain": 0.6, "fog": 0.22, "wind": 0.52, "isDay": true,
            "summary": "Rain, windy", "place": "Torshavn, Faroe Islands", "source": "live",
            "fetchedAt": "2026-11-05T12:05:00Z",
            "attribution": "Weather data by Open-Meteo.com, adapted for the game",
            "state": "rain",
            "tonight": {"date": "2026-11-05", "startsAt": "2026-11-05T18:00:00Z",
                        "endsAt": "2026-11-06T06:00:00Z", "isNow": false, "state": null,
                        "isFogNight": false, "fogNightKind": null}}
      503  source_unavailable   Open-Meteo is down and there is no older or recorded answer either

Anyone may call it: it needs no sign-in and holds no secret. It takes no input. A query string
such as ?place=Paris is ignored, because only the settings choose the place. That keeps players
from making the server call Open-Meteo for places we did not pick.

The fields:
    cloudCover, rain, fog, wind   each from 0 to 1, ready for setWeather in the browser
                                  (frontend/src/world/weather.js). 0 = none, 1 = the most.
    isDay                         true by day, false by night, at the place
    summary                       the weather in plain words, for example "Light rain, windy"
    place                         the name of the place the weather belongs to
    source                        "live" (just fetched), "cache" (fetched less than 10 minutes
                                  ago), "stale" (Open-Meteo is down, this is the last good
                                  answer), or "fallback" (a real answer recorded earlier, shown
                                  when nothing newer exists or in demo mode)
    fetchedAt                     when the numbers were fetched, in UTC. For "fallback" it is
                                  the time the answer was recorded.
    attribution                   the credit Open-Meteo asks for, with the note that we changed the
                                  data. Show it next to the weather as a link to
                                  https://open-meteo.com/, and add the licence name CC BY 4.0 as a
                                  link to https://creativecommons.org/licenses/by/4.0/ (the licence
                                  asks for all three: credit, licence link, note about changes).
                                  weatherAttribution() in frontend/src/net/weather.js gives both
                                  links.
    state                         the weather state now, from the four values above: "storm",
                                  "fog", "rain" or "calm" (weather/states.py). null only if the
                                  rules file backend/content/weather_states.json could not be read.
    tonight                       the night in progress, or the next one, or null if that rules file
                                  could not be read:
        date                      the date the night starts on (Lisbon time)
        startsAt, endsAt          the night, from 18:00 to 06:00 Lisbon time, in UTC
        isNow                     true while the night is going on
        state                     the state of the whole night, or null when the answer has no
                                  hours for it (the recorded fallback and demo mode have none)
        isFogNight                the fog-night rule (weather/fog_nights.py): the night is in the
                                  fog state, or neither of the last two nights was a fog night
        fogNightKind              "real" (the weather made it), "almanac" (only the rule did) or
                                  null when it is not a fog night
    The screens show the false light on a fog night only before the first solve, and the bulletin
    does the same: this route always sends the verdict, because fog is only weather afterwards.

The answer is sent with "Cache-Control: public, max-age=300", so a browser may reuse it for
5 minutes. An error answer carries no such header. Errors have the standard shape (errors.py).

Used by: the game client (frontend/src/net/weather.js asks for it every 10 minutes).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from server.adapters.base import CachedSource, SourceKind
from server.clock import ClockDep
from server.weather.mapping import format_utc_time, map_reading
from server.weather.outlook import Tonight, make_outlook
from server.weather.source import ATTRIBUTION, PlaceReading
from server.weather.state_rules import StateRules
from server.weather.states import state_of

router = APIRouter()

CACHE_CONTROL = "public, max-age=300"


class TonightOut(BaseModel):
    """Tonight as the API sends it. The bulletin sends the same object (bulletin_answer.py)."""

    # camelCase on purpose: these are the exact JSON keys the browser reads.
    date: str
    startsAt: str
    endsAt: str
    isNow: bool
    state: str | None
    isFogNight: bool
    fogNightKind: str | None


class WeatherResponse(BaseModel):
    """What /api/weather returns. It contains no secrets and no coordinates."""

    # camelCase on purpose: these are the exact JSON keys the browser reads.
    cloudCover: float
    rain: float
    fog: float
    wind: float
    isDay: bool
    summary: str
    place: str
    source: SourceKind
    fetchedAt: str
    attribution: str
    state: str | None
    tonight: TonightOut | None


def get_weather_source(request: Request) -> CachedSource:
    """FastAPI dependency: the weather source that create_app() stored on the app."""
    return request.app.state.weather_source


# Write `source: WeatherSourceDep` in a route and FastAPI hands you the weather source.
WeatherSourceDep = Annotated[CachedSource, Depends(get_weather_source)]


def get_weather_rules(request: Request) -> StateRules | None:
    """FastAPI dependency: the state rules that create_app() loaded, or None if the file is bad."""
    return request.app.state.weather_rules


# Write `rules: WeatherRulesDep` in a route and FastAPI hands you the state rules (or None).
WeatherRulesDep = Annotated[StateRules | None, Depends(get_weather_rules)]


def tonight_out(tonight: Tonight) -> TonightOut:
    """Turn tonight into the JSON object. Used by this route and by the bulletin."""
    window = tonight.window
    return TonightOut(
        date=window.date.isoformat(),
        startsAt=format_utc_time(window.starts_at),
        endsAt=format_utc_time(window.ends_at),
        isNow=tonight.is_now,
        state=tonight.state,
        isFogNight=tonight.fog_night.is_fog_night,
        fogNightKind=tonight.fog_night.kind,
    )


@router.get("/weather")
async def get_weather(
    source: WeatherSourceDep, rules: WeatherRulesDep, now: ClockDep, response: Response
) -> WeatherResponse:
    result = await source.get()
    snapshot: PlaceReading = result.data
    game = map_reading(snapshot.reading)
    # Set only after the source answered. An error answer is built elsewhere (errors.py) and
    # never gets this header.
    response.headers["Cache-Control"] = CACHE_CONTROL
    state = None
    tonight = None
    if rules is not None:  # without the rules file the four values still answer
        state = state_of(game, rules)
        tonight = tonight_out(make_outlook(now(), snapshot.hours, rules).tonight)
    return WeatherResponse(
        cloudCover=game.cloud_cover,
        rain=game.rain,
        fog=game.fog,
        wind=game.wind,
        isDay=game.is_day,
        summary=game.summary,
        place=snapshot.place,
        source=result.source,
        fetchedAt=format_utc_time(result.fetched_at),
        attribution=ATTRIBUTION,
        state=state,
        tonight=tonight,
    )
