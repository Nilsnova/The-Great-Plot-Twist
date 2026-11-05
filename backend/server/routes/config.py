"""Config route: GET /api/config tells the browser how the server is set up.

It returns the environment, whether demo mode is on, which feature flags are on and how to
sign in: the sign-in provider (always github) and the address of our Supabase project.

Everything in it is public. The Supabase address is not a secret: the browser needs it to start
the GitHub sign-in, and it is visible in the browser's address bar during sign-in anyway. This
route never returns a key. Not the secret key, not the publishable key (the sign-in check does
not need it) and not the keep-alive secret (CRON_SECRET).

Used by: the game client at start-up (to show or hide features) and the sign-in check page
(frontend/public/auth-check.html), which needs the Supabase address to start the sign-in.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from server.settings import SettingsDep

router = APIRouter()

# The one way to sign in. Email and anonymous sign-in are switched off in Supabase.
AUTH_PROVIDER = "github"


class AuthConfig(BaseModel):
    """How the browser signs in. Both values are public."""

    provider: str
    supabaseUrl: str  # camelCase on purpose. Empty text while SUPABASE_URL is not set.


class ConfigResponse(BaseModel):
    """What /api/config returns."""

    env: str
    demoMode: bool  # camelCase on purpose: this is the exact JSON key the browser reads
    flags: dict[str, bool]
    auth: AuthConfig


@router.get("/config")
async def get_config(settings: SettingsDep) -> ConfigResponse:
    auth = AuthConfig(provider=AUTH_PROVIDER, supabaseUrl=settings.supabase_url)
    return ConfigResponse(
        env=settings.app_env, demoMode=settings.demo_mode, flags=settings.flags, auth=auth
    )
