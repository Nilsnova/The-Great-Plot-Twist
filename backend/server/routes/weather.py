"""Weather route: GET /api/weather sends the real weather of one place, ready for the game.

The place comes from the settings (WEATHER_PLACE_NAME, WEATHER_LATITUDE, WEATHER_LONGITUDE, by
default Torshavn in the Faroe Islands). The weather comes from Open-Meteo, through the cached
source in weather/source.py, so Open-Meteo is called at most once per 10 minutes by this server
instance, however many players ask.

    GET /api/weather
      200  {"cloudCover": 1.0, "rain": 0.6, "fog": 0.22, "wind": 0.52, "isDay": true,
            "summary": "Rain, windy", "place": "Torshavn, Faroe Islands", "source": "live",
            "fetchedAt": "2026-11-05T12:05:00Z",
            "attribution": "Weather data by Open-Meteo.com, adapted for the game"}
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

The answer is sent with "Cache-Control: public, max-age=300", so a browser may reuse it for
5 minutes. An error answer carries no such header. Errors have the standard shape (errors.py).

Used by: the game client (frontend/src/net/weather.js asks for it every 10 minutes).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from server.adapters.base import CachedSource, SourceKind
from server.weather.mapping import format_utc_time, map_reading
from server.weather.source import ATTRIBUTION, PlaceReading

router = APIRouter()

CACHE_CONTROL = "public, max-age=300"


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


def get_weather_source(request: Request) -> CachedSource:
    """FastAPI dependency: the weather source that create_app() stored on the app."""
    return request.app.state.weather_source


# Write `source: WeatherSourceDep` in a route and FastAPI hands you the weather source.
WeatherSourceDep = Annotated[CachedSource, Depends(get_weather_source)]


@router.get("/weather")
async def get_weather(source: WeatherSourceDep, response: Response) -> WeatherResponse:
    result = await source.get()
    snapshot: PlaceReading = result.data
    game = map_reading(snapshot.reading)
    # Set only after the source answered. An error answer is built elsewhere (errors.py) and
    # never gets this header.
    response.headers["Cache-Control"] = CACHE_CONTROL
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
    )
