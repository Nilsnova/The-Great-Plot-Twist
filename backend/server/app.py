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
from server.duels.service import DuelService
from server.errors import register_error_handlers
from server.game.building_catalogue import BuildingCatalogue, catalogue_or_none
from server.game.case_cache import CaseCacheControl
from server.game.case_service import CaseService, case_or_none
from server.market.exchange import MarketService, market_or_none
from server.predictions.desk import PredictionDesk, desk_or_none
from server.routes import (
    auth_exchange,
    bulletin,
    captain_name,
    case,
    config,
    content,
    crews,
    delete_me,
    duels,
    health,
    host_case,
    intro,
    islet,
    keepalive,
    market,
    me,
    predictions,
    save,
    weather,
)
from server.settings import Settings, settings_from_environment
from server.sign_in_code import CodeExchanger
from server.supabase_admin import SupabaseAdmin, admin_from_settings
from server.weather.source import make_weather_source
from server.weather.state_rules import load_state_rules
from server.world_stage import AlwaysDark, WorldStageReader


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

    return FastAPI(
        title="The Great Plot Twist API",
        description="Game rules, wallet and live data. Every URL starts with /api.",
        version=__version__,
        docs_url=docs_url,
        redoc_url=None,
        openapi_url=openapi_url,
        swagger_ui_oauth2_redirect_url=None,
    )


def create_app(
    settings: Settings | None = None,
    verifier: PlayerVerifier | None = None,
    admin: SupabaseAdmin | None = None,
    *,
    weather_source: CachedSource | None = None,
    exchanger: CodeExchanger | None = None,
    market_service: MarketService | None = None,
    broadcaster: CrewBroadcaster | None = None,
    case_service: CaseService | None = None,
    islet_catalogue: BuildingCatalogue | None = None,
    world_stage: WorldStageReader | None = None,
    clock: Clock | None = None,
    prediction_desk: PredictionDesk | None = None,
    duel_service: DuelService | None = None,
) -> FastAPI:
    """Build the API. With no arguments it uses the real environment (what Vercel does).

    Tests pass their own settings, a verifier, an admin client, a weather source, an exchanger
    and a crew broadcaster that use fake transports, an Island Exchange service whose price feed
    and clock are fakes, and a catalogue of home islet buildings (the real one is read from
    buildings.json). They also pass a reader for the world stage (dark or relit) and the clock
    that the routes use to say what day it is. Every service after `admin` is keyword-only.
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
        market_service = market_or_none(settings)  # None if its data files are broken
    if broadcaster is None:
        broadcaster = broadcaster_from_settings(settings)
    if islet_catalogue is None:
        islet_catalogue = catalogue_or_none()  # None if buildings.json is broken
    if world_stage is None:
        world_stage = AlwaysDark()  # until package L3 builds world_state, the coast is dark
    if clock is None:
        clock = utc_now
    if case_service is None:
        case_service = case_or_none(settings, broadcaster=broadcaster, clock=clock)
    if prediction_desk is None:
        prediction_desk = desk_or_none(settings)  # None if its questions file is broken
    if duel_service is None:
        duel_service = DuelService()  # it has no data files, so it always starts

    # The httpx library writes the full address of every request to the log at INFO level. Our
    # database reads put the player id in that address (see routes/me.py), so keep those lines
    # out of the log, even if someone switches INFO logging on to debug something else.
    logging.getLogger("httpx").setLevel(logging.WARNING)

    app = new_fastapi_app(settings)
    app.add_middleware(CaseCacheControl)

    # Routes find these through the dependencies in settings.py, auth.py, supabase_admin.py,
    # routes/weather.py, sign_in_code.py, market/exchange.py, crew_broadcast.py,
    # game/islet_service.py, world_stage.py and clock.py.
    # predictions/desk.py.
    # duels/service.py.
    app.state.settings = settings
    app.state.verifier = verifier
    app.state.admin = admin
    app.state.weather_source = weather_source
    app.state.exchanger = exchanger
    app.state.market = market_service
    app.state.case = case_service
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
    app.include_router(market.router, prefix="/api")
    app.include_router(crews.router, prefix="/api")
    app.include_router(case.router, prefix="/api")
    app.include_router(host_case.router, prefix="/api")
    app.include_router(islet.router, prefix="/api")
    app.include_router(predictions.router, prefix="/api")
    app.include_router(duels.router, prefix="/api")
    return app
