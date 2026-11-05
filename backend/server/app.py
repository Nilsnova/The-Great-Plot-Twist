"""The FastAPI app: creates the API and plugs in the routes and the error handlers.

Every URL lives under /api, because Vercel serves the game's web page and this API from the
same project. This file only defines create_app(). It does NOT build an app when it is
imported, so the tests can import it without reading the real environment. The ready-made app
that Vercel serves is built in main.py, by calling create_app() with no arguments.

Run it on your laptop with: uv run --env-file ../.env uvicorn main:app --reload --port 8000

Used by: main.py (Vercel) and the tests (they call create_app with their own settings).
"""

from fastapi import FastAPI

from server import __version__
from server.auth import PlayerVerifier
from server.errors import register_error_handlers
from server.routes import config, health
from server.settings import Settings, settings_from_environment
from server.supabase_admin import SupabaseAdmin, admin_from_settings


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
) -> FastAPI:
    """Build the API. With no arguments it uses the real environment (what Vercel does).

    Tests pass their own settings, a verifier and an admin client that use fake transports.
    """
    if settings is None:
        settings = settings_from_environment()
    if verifier is None:
        verifier = PlayerVerifier(settings)
    if admin is None:
        admin = admin_from_settings(settings)

    app = new_fastapi_app(settings)

    # Routes find these through the dependencies in settings.py, auth.py and supabase_admin.py.
    app.state.settings = settings
    app.state.verifier = verifier
    app.state.admin = admin

    register_error_handlers(app)
    app.include_router(health.router, prefix="/api")
    app.include_router(config.router, prefix="/api")
    return app
