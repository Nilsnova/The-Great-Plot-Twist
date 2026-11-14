"""The FastAPI app: creates the API and plugs in the routes and the error handlers.

Every URL lives under /api, because Vercel serves the game's web page and this API from the
same project. This file only defines create_app(). It does NOT build an app when it is
imported, so the tests can import it without reading the real environment. The ready-made app
that Vercel serves is built in main.py, by calling create_app() with no arguments.

Run it on your laptop with: uv run --env-file ../.env uvicorn main:app --reload --port 8000

Used by: main.py (Vercel) and the tests (they call create_app with their own settings).
"""

import logging

from fastapi import FastAPI

from server import __version__
from server.adapters.base import CachedSource
from server.auth import PlayerVerifier
from server.clock import Clock, utc_now
from server.crew_broadcast import CrewBroadcaster, broadcaster_from_settings
from server.daily.content import load_daily_content
from server.demo.gate import DemoGate
from server.demo.guests import AutoCleanup
from server.duels.service import DuelService
from server.errors import register_error_handlers
from server.festival.cache import FestivalCacheControl
from server.game.building_catalogue import BuildingCatalogue, catalogue_or_none
from server.game.case_cache import CaseCacheControl
from server.game.case_service import CaseService, case_or_none
from server.game.station_lookup import IsletStations, NoStations
from server.game.world_state import DatabaseWorldStage, relit_check
from server.host_console_cache import HostConsoleHeaders
from server.island.catalogue import IslandCatalogue, island_or_none
from server.lock.limits import PlayerBudget
from server.lock.places import PlaceSearch
from server.lock.weather import PlaceWeather
from server.market.exchange import MarketService, market_or_none
from server.predictions.desk import PredictionDesk, desk_or_none
from server.request_policy import RequestPolicy
from server.routes import (
    auth_exchange,
    board,
    bulletin,
    captain_name,
    case,
    config,
    content,
    crew_orders,
    crews,
    delete_me,
    demo,
    duels,
    festival,
    finale,
    games,
    health,
    host_case,
    host_console,
    intro,
    island,
    islet,
    keepalive,
    lock,
    market,
    market_calls,
    me,
    pirate_point,
    predictions,
    save,
    sports,
    wall_recovery,
    waves,
    weather,
    world,
)
from server.settings import Settings, settings_from_environment
from server.sign_in_code import CodeExchanger
from server.sports.cache import SportsCacheControl
from server.sports.service import SportsService, sports_from_settings
from server.supabase_admin import SupabaseAdmin, admin_from_settings
from server.weather.source import make_weather_source
from server.weather.state_rules import load_state_rules
from server.world_stage import WorldStageReader

# Requests per player and minute on the island and wave routes, per server instance. A player
# builds or rings the bell a few times a minute at most; the budgets stop a runaway loop and make
# guessing island codes slow.
ISLAND_BUILDS_PER_MINUTE = 30
ISLAND_VISITS_PER_MINUTE = 30
WAVE_CALLS_PER_MINUTE = 20
WAVE_READS_PER_MINUTE = 30
GAME_CALLS_PER_MINUTE = 30
# Up-or-down market calls (routes/market_calls.py).
MARKET_CALLS_PER_MINUTE = 20
MARKET_CALL_READS_PER_MINUTE = 60


def new_fastapi_app(settings: Settings) -> FastAPI:
    """An empty FastAPI app with our title and version.

    The interactive docs list every route and what it accepts, so production does not serve
    them. Local and preview copies do.
    """
    # FastAPI would put its docs at /docs. We put them under /api, so every URL starts there.
    docs_url = None
    openapi_url = None
    if settings.app_env != "production":
        docs_url = "/api/docs"
        openapi_url = "/api/openapi.json"

    app = FastAPI(
        title="The Great Plot Twist API",
        description="Game rules, wallet and live data. Every URL starts with /api.",
        version=__version__,
        docs_url=docs_url,
        redoc_url=None,
        openapi_url=openapi_url,
        swagger_ui_oauth2_redirect_url=None,
    )
    app.add_middleware(RequestPolicy)
    return app


def create_app(
    settings: Settings | None = None,
    verifier: PlayerVerifier | None = None,
    admin: SupabaseAdmin | None = None,
    *,
    weather_source: CachedSource | None = None,
    exchanger: CodeExchanger | None = None,
    market_service: MarketService | None = None,
    broadcaster: CrewBroadcaster | None = None,
    islet_catalogue: BuildingCatalogue | None = None,
    world_stage: WorldStageReader | None = None,
    clock: Clock | None = None,
    prediction_desk: PredictionDesk | None = None,
    duel_service: DuelService | None = None,
    case_service: CaseService | None = None,
    sports_service: SportsService | None = None,
    lock_weather: PlaceWeather | None = None,
    place_search: PlaceSearch | None = None,
    island_catalogue: IslandCatalogue | None = None,
) -> FastAPI:
    """Build the API. With no arguments it uses the real environment (what Vercel does).

    Tests pass their own settings, a verifier, an admin client, a weather source, an exchanger
    and a crew broadcaster that use fake transports, an Island Exchange service whose price feed
    and clock are fakes, and a catalogue of home islet buildings (the real one is read from
    buildings.json). They also pass a reader for the world stage (dark or relit) and the clock
    that the routes use to say what day it is. Every service after `admin` is keyword-only.
    The Keeper's Lock gets its weather and place search with fake transports too.
    """
    if settings is None:
        settings = settings_from_environment()
    if verifier is None:
        verifier = PlayerVerifier(settings)
    if admin is None:
        admin = admin_from_settings(settings)
    if weather_source is None:
        weather_source = make_weather_source(settings)
    if exchanger is None:
        exchanger = CodeExchanger(settings)
    if market_service is None:
        market_service = market_or_none(settings, relit_check=relit_check)
    if broadcaster is None:
        broadcaster = broadcaster_from_settings(settings)
    if islet_catalogue is None:
        islet_catalogue = catalogue_or_none()  # None if buildings.json is broken
    if clock is None:
        clock = utc_now
    if world_stage is None:
        world_stage = DatabaseWorldStage(admin, clock=clock)
    if prediction_desk is None:
        prediction_desk = desk_or_none(settings)  # None if its questions file is broken
    if duel_service is None:
        duel_service = DuelService()  # it has no data files, so it always starts
    if sports_service is None:
        sports_service = sports_from_settings(settings, clock=clock)
    if lock_weather is None:
        # Demo mode never calls outside services: the lock then asks its riddle.
        lock_weather = PlaceWeather(enabled=not settings.demo_mode, clock=clock)
    if place_search is None:
        place_search = PlaceSearch(clock=clock)
    if island_catalogue is None:
        island_catalogue = island_or_none()  # None if islands.json is broken

    if case_service is None:
        stations = IsletStations(islet_catalogue) if islet_catalogue is not None else NoStations()
        case_service = case_or_none(settings, broadcaster=broadcaster, stations=stations)

    # The httpx library writes the full address of every request to the log at INFO level. Our
    # database reads put the player id in that address (see routes/me.py), so keep those lines
    # out of the log, even if someone switches INFO logging on to debug something else.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpx2").setLevel(logging.WARNING)
    # Uvicorn's access logger includes raw paths and query strings. Use safe templates instead.
    logging.getLogger("uvicorn.access").disabled = True

    app = new_fastapi_app(settings)
    app.add_middleware(CaseCacheControl)
    app.add_middleware(FestivalCacheControl)
    app.add_middleware(HostConsoleHeaders)
    app.add_middleware(SportsCacheControl)

    # Routes find these through the dependencies in settings.py, auth.py, supabase_admin.py,
    # routes/weather.py, sign_in_code.py, market/exchange.py, crew_broadcast.py,
    # game/islet_service.py, world_stage.py, clock.py, predictions/desk.py and duels/service.py.
    app.state.settings = settings
    app.state.verifier = verifier
    app.state.admin = admin
    app.state.weather_source = weather_source
    app.state.exchanger = exchanger
    app.state.market = market_service
    app.state.broadcaster = broadcaster
    app.state.islet_catalogue = islet_catalogue
    app.state.world_stage = world_stage
    app.state.clock = clock
    # The weather state rules (weather_states.json). None if the file cannot be read: the weather
    # route then leaves out `state` and `tonight`, and the bulletin answers 503.
    app.state.weather_rules = load_state_rules()
    # The words of the harbor bulletin and the Chapter 2 hook (bulletin.json and
    # chapter_two_hook.json). None if a file cannot be read: the bulletin then answers 503.
    app.state.daily_content = load_daily_content()
    app.state.predictions = prediction_desk
    app.state.duels = duel_service
    app.state.sports = sports_service

    app.state.case = case_service
    # The class demo (D029): the guest gate, and the Keeper's Lock with its two budgets.
    app.state.demo_gate = DemoGate(settings, admin, clock)
    # The class code (D030): the join budget and the automatic guest clean-up.
    app.state.join_budget = PlayerBudget(
        demo.JOIN_TRIES,
        demo.JOIN_SECONDS,
        clock=clock,
        message="Too many tries with a class code. Wait a few minutes, then try again.",
    )
    app.state.auto_cleanup = AutoCleanup(admin, clock, settings.host_player_ids)
    app.state.lock_weather = lock_weather
    app.state.place_search = place_search
    app.state.lock_budget = PlayerBudget(30, 60, clock=clock)
    app.state.search_budget = PlayerBudget(10, 60, clock=clock)
    # The island and its waves (BUILD-PLAN 3.4): the catalogue (islands.json) and four budgets.
    app.state.island = island_catalogue
    app.state.island_build_budget = PlayerBudget(
        ISLAND_BUILDS_PER_MINUTE, 60, clock=clock, message="Too many builds at once. Wait a moment."
    )
    app.state.island_visit_budget = PlayerBudget(
        ISLAND_VISITS_PER_MINUTE, 60, clock=clock, message="Too many visits at once. Wait a moment."
    )
    # The friend invite (TOWER-DEFENSE 6): tries per player and per address, like the class code.
    app.state.invite_budget = PlayerBudget(
        demo.JOIN_TRIES,
        demo.JOIN_SECONDS,
        clock=clock,
        message="Too many tries with an island code. Wait a few minutes, then try again.",
    )
    # The games of GAME-V3 section 2 (routes/games.py): create, join, list, lobby, leave.
    app.state.games_budget = PlayerBudget(
        GAME_CALLS_PER_MINUTE, 60, clock=clock, message="Too many game requests. Wait a moment."
    )
    app.state.wave_budget = PlayerBudget(
        WAVE_CALLS_PER_MINUTE, 60, clock=clock, message="Too many bells at once. Wait a moment."
    )
    # The market stall's up-or-down calls (D034): POST and GET budgets per player.
    app.state.call_budget = PlayerBudget(
        MARKET_CALLS_PER_MINUTE, 60, clock=clock, message="Too many calls at once. Wait a moment."
    )
    app.state.call_read_budget = PlayerBudget(
        MARKET_CALL_READS_PER_MINUTE, 60, clock=clock, message="Too many reads. Wait a moment."
    )
    app.state.wave_read_budget = PlayerBudget(
        WAVE_READS_PER_MINUTE, 60, clock=clock, message="Too many wave checks. Wait a moment."
    )

    register_error_handlers(app)
    app.include_router(health.router, prefix="/api")
    app.include_router(content.router, prefix="/api")
    app.include_router(config.router, prefix="/api")
    app.include_router(keepalive.router, prefix="/api")
    app.include_router(weather.router, prefix="/api")
    app.include_router(bulletin.router, prefix="/api")
    app.include_router(me.router, prefix="/api")
    app.include_router(captain_name.router, prefix="/api")
    app.include_router(save.router, prefix="/api")
    app.include_router(delete_me.router, prefix="/api")
    app.include_router(intro.router, prefix="/api")
    app.include_router(auth_exchange.router, prefix="/api")
    app.include_router(market_calls.router, prefix="/api")
    app.include_router(market.router, prefix="/api")
    app.include_router(crews.router, prefix="/api")
    app.include_router(crew_orders.router, prefix="/api")
    app.include_router(islet.router, prefix="/api")
    app.include_router(island.router, prefix="/api")
    app.include_router(games.router, prefix="/api")
    app.include_router(waves.router, prefix="/api")
    app.include_router(wall_recovery.router, prefix="/api")
    app.include_router(pirate_point.router, prefix="/api")
    app.include_router(predictions.router, prefix="/api")
    app.include_router(duels.router, prefix="/api")
    app.include_router(festival.router, prefix="/api")
    app.include_router(sports.router, prefix="/api")

    app.include_router(case.router, prefix="/api")
    app.include_router(board.router, prefix="/api")
    app.include_router(finale.router, prefix="/api")
    app.include_router(world.router, prefix="/api")
    app.include_router(host_case.router, prefix="/api")
    app.include_router(host_console.router, prefix="/api")
    app.include_router(demo.router, prefix="/api")
    app.include_router(lock.router, prefix="/api")
    return app
