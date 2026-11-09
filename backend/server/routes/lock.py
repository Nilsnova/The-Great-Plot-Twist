"""The Keeper's Lock routes: the weather question, the answer, and the "Change place" search.

The lock asks what the sky over the player's own place looks like right now, and the server checks
the answer against the real weather there (decision D029). The rules are in lock/sky.py, the place
in lock/place.py, the words in backend/content/keeper_lock.json.

Who may call: signed-in players (GitHub, email, or a guest while the demo is open, see
demo/gate.py). The player id comes from the verified login, never from the request. Every answer
carries "Cache-Control: private, no-store": it holds the player's place. The place is never stored
and never logged.

    GET /api/lock
    GET /api/lock?name=Lisbon&latitude=38.72&longitude=-9.14     (a chosen place: all three or none)
      200  {"question": "What does the sky over Lisbon look like right now?",
            "note": "This lock uses the real weather of your place right now ...",
            "place": {"name": "Lisbon", "latitude": 38.72, "longitude": -9.14, "source": "chosen"},
            "weatherSource": "live",
            "choices": [{"id": "clear", "label": "Sunny or clear"}, {"id": "cloudy", ...},
                        {"id": "rain", ...}, {"id": "fog", ...}, {"id": "snow", ...}],
            "opened": false, "hintReady": false,
            "attribution": "Weather data by Open-Meteo.com, adapted for the game"}
      place.source    "chosen" (the request named it), "ip" (Vercel's city-level geo headers) or
                      "default" (the WEATHER_* settings place)
      weatherSource   "live" (a reading at most 10 minutes old), "cache" (Open-Meteo is down; the
                      last good reading of that place, at most 6 hours old) or "clue" (no reading:
                      the question is a riddle and the choices are the riddle's; attribution null)
      hintReady       true after a wrong answer: the browser may show "That's not what I see
                      outside"
      The reading itself is never sent before the answer.

    POST /api/lock/answer
    {"answer": "cloudy", "actionUid": "lock0001", "place": {"name": "Lisbon", "latitude": 38.72,
     "longitude": -9.14}}                                                  (place is optional)
      answer      a choice id of the current question, "hint" or "hint_confirm"
      actionUid   8 to 64 of A-Z a-z 0-9 _ -, made once per click
      200  {"accepted": true, "reason": null, "match": "close",
            "message": "Close enough: the reading says Rain, one step from your answer. ...",
            "lock": {<the GET view, now with "opened": true>}}
      200  {"accepted": false, "reason": "wrong", "match": null, "message": "Not quite. ...",
            "lock": {...}}
      match (accepted)   exact, close (one step away), hint (the hint path) or clue (the riddle)
      reason (refused)   wrong, hint_too_early ("hint" before a wrong answer), hint_offered (the
                         second prompt: the answer also has "prompt": "I looked outside"; send
                         "hint_confirm" with a new actionUid to open the lock) or question_changed
                         (the answer belongs to the other question: the weather came or went)
      A repeat of an actionUid answers its STORED verdict first, with "repeat": true. An answer
      after the lock is open is accepted with "alreadyOpen": true and is not stored. No coins move.
      404 player_not_set_up, 409 too_many_tries (40 stored answers), 422 validation_error (an odd
      answer id, uid or place, or an extra field)

    GET /api/places/search?q=lisb
      q   2 to 60 printable characters
      200  {"places": [{"name": "Lisbon", "region": "Lisbon", "country": "Portugal",
                        "latitude": 38.71667, "longitude": -9.13333}],
            "attribution": "Place search by Open-Meteo.com, data from GeoNames"}
      At most 5 places. 503 places_unavailable when the search fails (nothing is cached then).

Budgets per player and server instance: 30 lock requests and 10 searches a minute (429
too_many_requests with Retry-After). Common errors: 401 unauthorized, 403 demo_closed (a guest while
the demo is closed), 502/503 database_* and auth_*, 503 lock_unavailable (the words file is broken).

Used by: the game client (the Keeper's Lock screen, checkpoint C3).
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from server.auth import PlayerDep
from server.errors import ApiError
from server.lock.content import LockContent, lock_content
from server.lock.limits import PlayerBudget
from server.lock.place import MAX_NAME_LENGTH, Place, clean_name, find_place
from server.lock.places import ATTRIBUTION as PLACES_ATTRIBUTION
from server.lock.places import PlaceSearch
from server.lock.sky import HINT, HINT_CONFIRM, History, Mode, history_of, judge, sky_of
from server.lock.store import Stored, find_attempt, read_history, record
from server.lock.weather import PlaceWeather
from server.settings import SettingsDep
from server.supabase_admin import AdminDep, SupabaseAdmin
from server.weather.source import ATTRIBUTION as WEATHER_ATTRIBUTION

logger = logging.getLogger(__name__)

router = APIRouter()

ANSWER_PATTERN = r"^[a-z_]{2,20}$"
ACTION_UID_PATTERN = r"^[A-Za-z0-9_-]{8,64}$"
PRIVATE = "private, no-store"


class ChosenPlace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=MAX_NAME_LENGTH)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)


class AnswerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer: str = Field(pattern=ANSWER_PATTERN)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)
    place: ChosenPlace | None = None


class PlaceView(BaseModel):
    name: str
    latitude: float
    longitude: float
    source: str


class ChoiceView(BaseModel):
    id: str
    label: str


class LockView(BaseModel):
    question: str
    note: str
    place: PlaceView
    weatherSource: str
    choices: list[ChoiceView]
    opened: bool
    hintReady: bool
    attribution: str | None


class FoundPlaceView(BaseModel):
    name: str
    region: str | None
    country: str | None
    latitude: float
    longitude: float


class PlacesResponse(BaseModel):
    places: list[FoundPlaceView]
    attribution: str


def get_lock_weather(request: Request) -> PlaceWeather:
    return request.app.state.lock_weather


def get_place_search(request: Request) -> PlaceSearch:
    return request.app.state.place_search


def get_lock_budget(request: Request) -> PlayerBudget:
    return request.app.state.lock_budget


def get_search_budget(request: Request) -> PlayerBudget:
    return request.app.state.search_budget


LockWeatherDep = Annotated[PlaceWeather, Depends(get_lock_weather)]
PlaceSearchDep = Annotated[PlaceSearch, Depends(get_place_search)]
LockBudgetDep = Annotated[PlayerBudget, Depends(get_lock_budget)]
SearchBudgetDep = Annotated[PlayerBudget, Depends(get_search_budget)]


def load_content() -> LockContent:
    try:
        return lock_content()
    except (OSError, ValueError) as error:
        logger.warning("The Keeper's Lock words could not be read: %s", type(error).__name__)
        raise ApiError(503, "lock_unavailable", "The lock cannot be opened right now.") from error


def chosen_place(chosen: ChosenPlace | None) -> Place | None:
    if chosen is None:
        return None
    name = clean_name(chosen.name)
    if name is None:
        raise ApiError(422, "validation_error", "The request is not valid. place.name: odd text")
    return Place(name, chosen.latitude, chosen.longitude, "chosen")


def query_place(
    name: str | None, latitude: float | None, longitude: float | None
) -> ChosenPlace | None:
    given = [value is not None for value in (name, latitude, longitude)]
    if not any(given):
        return None
    if not all(given):
        message = "The request is not valid. Send name, latitude and longitude together, or none."
        raise ApiError(422, "validation_error", message)
    return ChosenPlace(name=name, latitude=latitude, longitude=longitude)


class Question:
    """The question the lock asks now, for one place."""

    def __init__(self, content: LockContent, place: Place, kind: str, sky: str | None) -> None:
        self.content = content
        self.place = place
        self.kind = kind  # live, cache or clue
        self.sky = sky

    @property
    def mode(self) -> Mode:
        return "clue" if self.kind == "clue" else "weather"

    def view(self, history: History) -> LockView:
        content = self.content
        weather = self.mode == "weather"
        choices = content.skies if weather else content.clue_choices
        return LockView(
            question=content.weather_question.replace("{place}", self.place.name)
            if weather
            else content.clue_question,
            note=content.weather_note if weather else content.clue_note,
            place=PlaceView(
                name=self.place.name,
                latitude=self.place.latitude,
                longitude=self.place.longitude,
                source=self.place.source,
            ),
            weatherSource=self.kind,
            choices=[ChoiceView(id=choice.id, label=choice.label) for choice in choices],
            opened=history.opened,
            hintReady=history.wrong >= 1,
            attribution=WEATHER_ATTRIBUTION if weather else None,
        )

    def message(self, outcome: str) -> str:
        messages = self.content.messages
        if outcome == "close":
            if self.sky is None:
                return messages["exact"].replace("{place}", self.place.name)
            return messages["close"].replace("{sky}", self.content.sky_label(self.sky))
        key = {
            "exact": "exact",
            "hint": "hint",
            "clue": "clue",
            "wrong": "wrong",
            "hint_too_early": "hintTooEarly",
            "hint_offered": "hintOffered",
            "question_changed": "questionChanged",
        }[outcome]
        return messages[key].replace("{place}", self.place.name)


async def ask(content: LockContent, place: Place, weather: PlaceWeather) -> Question:
    reading = await weather.reading(place.latitude, place.longitude)
    sky = sky_of(reading.reading) if reading is not None else None
    if reading is None or sky is None:
        return Question(content, place, "clue", None)
    return Question(content, place, reading.kind, sky)


async def player_history(admin: SupabaseAdmin, player_id: str) -> History:
    return history_of(await read_history(admin, player_id))


def check_answer_id(answer: str, content: LockContent) -> None:
    known = {choice.id for choice in (*content.skies, *content.clue_choices)} | {HINT, HINT_CONFIRM}
    if answer not in known:
        raise ApiError(422, "validation_error", "The request is not valid. answer: unknown choice")


def answer_body(
    question: Question, stored: Stored, history: History, *, repeat: bool = False
) -> dict:
    accepted = stored.accepted
    body: dict = {
        "accepted": accepted,
        "reason": None if accepted else stored.outcome,
        "match": stored.outcome if accepted else None,
        "message": question.message(stored.outcome),
    }
    if stored.outcome == "hint_offered":
        body["prompt"] = question.content.messages["hintPrompt"]
    if repeat:
        body["repeat"] = True
    body["lock"] = question.view(history).model_dump()
    return body


def player_not_set_up() -> ApiError:
    message = "Your player record is not set up yet. Ask the team to reset your account."
    return ApiError(404, "player_not_set_up", message)


@router.get("/lock")
async def get_lock(
    request: Request,
    response: Response,
    player: PlayerDep,
    admin: AdminDep,
    settings: SettingsDep,
    weather: LockWeatherDep,
    budget: LockBudgetDep,
    name: Annotated[str | None, Query(min_length=1, max_length=MAX_NAME_LENGTH)] = None,
    latitude: Annotated[float | None, Query(ge=-90, le=90, allow_inf_nan=False)] = None,
    longitude: Annotated[float | None, Query(ge=-180, le=180, allow_inf_nan=False)] = None,
) -> LockView:
    response.headers["Cache-Control"] = PRIVATE
    budget.spend(player.id)
    content = load_content()
    place = find_place(
        chosen_place(query_place(name, latitude, longitude)), request.headers, settings
    )
    question = await ask(content, place, weather)
    return question.view(await player_history(admin, player.id))


@router.post("/lock/answer")
async def post_answer(
    body: AnswerRequest,
    request: Request,
    response: Response,
    player: PlayerDep,
    admin: AdminDep,
    settings: SettingsDep,
    weather: LockWeatherDep,
    budget: LockBudgetDep,
) -> dict:
    response.headers["Cache-Control"] = PRIVATE
    budget.spend(player.id)
    content = load_content()
    check_answer_id(body.answer, content)
    place = find_place(chosen_place(body.place), request.headers, settings)
    question = await ask(content, place, weather)

    # A stored result answers first, before the current rules (the house rule for actionUid).
    stored = await find_attempt(admin, player.id, body.actionUid)
    if stored is not None:
        history = await player_history(admin, player.id)
        return answer_body(question, stored, history, repeat=True)

    history = await player_history(admin, player.id)
    if history.opened:
        return {
            "accepted": True,
            "reason": None,
            "match": None,
            "message": content.messages["alreadyOpen"],
            "alreadyOpen": True,
            "lock": question.view(history).model_dump(),
        }

    outcome = judge(
        body.answer,
        question.mode,
        question.sky,
        tuple(choice.id for choice in content.clue_choices),
        content.clue_answer,
        history,
    )
    stored = await record(admin, player.id, body.actionUid, body.answer, outcome)
    if stored.status == "missing":
        raise player_not_set_up()
    if stored.status == "full":
        raise ApiError(409, "too_many_tries", "This lock has had enough answers from you.")
    history = await player_history(admin, player.id)
    return answer_body(question, stored, history, repeat=stored.status == "repeat")


@router.get("/places/search")
async def search_places(
    response: Response,
    player: PlayerDep,
    search: PlaceSearchDep,
    budget: SearchBudgetDep,
    q: Annotated[str, Query(min_length=2, max_length=MAX_NAME_LENGTH)],
) -> PlacesResponse:
    response.headers["Cache-Control"] = PRIVATE
    if clean_name(q) is None:
        raise ApiError(422, "validation_error", "The request is not valid. query.q: odd text")
    budget.spend(player.id)
    places = await search.search(q)
    return PlacesResponse(
        places=[
            FoundPlaceView(
                name=place.name,
                region=place.region,
                country=place.country,
                latitude=place.latitude,
                longitude=place.longitude,
            )
            for place in places
        ],
        attribution=PLACES_ATTRIBUTION,
    )
