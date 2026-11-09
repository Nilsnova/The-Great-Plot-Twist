"""Config route: GET /api/config tells the browser how the server is set up.

It returns the environment, whether demo mode is on, which feature flags are on, how to sign in
(the sign-in providers and the address of our Supabase project) and whether the class demo is open
for guests.

    "auth": {"provider": "github", "providers": ["github", "email"], "supabaseUrl": "https://..."}
        providers   the setting AUTH_PROVIDERS (github and/or email; default github), in order.
                    "email" is the 6-digit email code sign-in.
        provider    the old single field, kept for older pages such as the sign-in check, which
                    start an OAuth redirect with it: always "github", the only OAuth provider
    "demo": {"open": true, "openUntil": "2026-11-09T15:00:00Z"}
        open        guests (Supabase anonymous sign-in) may play now: the feature flag demo is on
                    and the host's demo window is open. The browser shows guest play only then.
        openUntil   the end of the window, or null while closed
        Read through the demo gate (10-second memory); a window that cannot be read shows as
        closed here and never makes this route fail. With the flag off nothing is read.

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
from server.weather.mapping import format_utc_time

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
    """Whether guests may play now. Public: an end time, nothing else."""

    open: bool
    openUntil: str | None


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
    window = await request.app.state.demo_gate.public_window()
    until = format_utc_time(window.open_until) if window.open and window.open_until else None
    return ConfigResponse(
        env=settings.app_env,
        demoMode=settings.demo_mode,
        flags=settings.flags,
        auth=auth_config(settings),
        capabilities={"hostCaseClock": case_clock_available(request.app.openapi(), settings.flags)},
        demo=DemoConfig(open=window.open, openUntil=until),
    )
