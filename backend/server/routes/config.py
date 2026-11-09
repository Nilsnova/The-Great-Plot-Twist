"""Config route: GET /api/config tells the browser how the server is set up.

It returns the environment, whether demo mode is on, which feature flags are on, how to sign in
(the sign-in providers and the address of our Supabase project) and whether guests may join the
class demo with a class code.

    "auth": {"provider": "github", "providers": ["github", "email"], "supabaseUrl": "https://..."}
        providers   the setting AUTH_PROVIDERS (github and/or email; default github), in order.
                    "email" is the 6-digit email code sign-in.
        provider    the old single field, kept for older pages such as the sign-in check, which
                    start an OAuth redirect with it: always "github", the only OAuth provider
    "demo": {"guestsByCode": true}
        guestsByCode  guests (Supabase anonymous sign-in) may join with the class code: the feature
                      flag demo is on. The browser offers guest play only then, and only to a
                      player who has a class code (decision D030). It says nothing about the code
                      itself: the code never appears here, and nothing is read from the database.

Everything in it is public. The Supabase address is not a secret: the browser needs it to start
the GitHub sign-in, and it is visible in the browser's address bar during sign-in anyway. This
route never returns a key. Not the secret key, not the publishable key (the sign-in check does
not need it) and not the keep-alive secret (CRON_SECRET).

Used by: the game client at start-up (to show or hide features) and the sign-in check page
(frontend/public/auth-check.html), which needs the Supabase address to start the sign-in.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel

from server.host_console import case_clock_available
from server.settings import Settings, SettingsDep

router = APIRouter()

# The provider older pages start an OAuth sign-in with. Email codes are not an OAuth redirect, so
# this field never names "email", even when it is the only provider listed.
AUTH_PROVIDER = "github"


class AuthConfig(BaseModel):
    """How the browser signs in. Every value is public."""

    provider: str
    providers: list[str]
    supabaseUrl: str  # camelCase on purpose. Empty text while SUPABASE_URL is not set.


class DemoConfig(BaseModel):
    """Whether guests may join with a class code. Public: one yes or no, never the code."""

    guestsByCode: bool


class ConfigResponse(BaseModel):
    """What /api/config returns."""

    env: str
    demoMode: bool  # camelCase on purpose: this is the exact JSON key the browser reads
    flags: dict[str, bool]
    auth: AuthConfig
    capabilities: dict[str, bool]
    demo: DemoConfig


def auth_config(settings: Settings) -> AuthConfig:
    providers = list(settings.auth_providers)
    return AuthConfig(
        provider=AUTH_PROVIDER, providers=providers, supabaseUrl=settings.supabase_url
    )


@router.get("/config")
async def get_config(settings: SettingsDep, request: Request) -> ConfigResponse:
    return ConfigResponse(
        env=settings.app_env,
        demoMode=settings.demo_mode,
        flags=settings.flags,
        auth=auth_config(settings),
        capabilities={"hostCaseClock": case_clock_available(request.app.openapi(), settings.flags)},
        demo=DemoConfig(guestsByCode=request.app.state.demo_gate.flag_on),
    )
