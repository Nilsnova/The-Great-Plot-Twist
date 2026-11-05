"""Config route: GET /api/config tells the browser how the server is set up.

It returns the environment, whether demo mode is on and which feature flags are on.
It never returns keys or other secrets, so it is safe for anyone to read.

Used by: the game client at start-up (to show or hide features).
"""

from fastapi import APIRouter
from pydantic import BaseModel

from server.settings import SettingsDep

router = APIRouter()


class ConfigResponse(BaseModel):
    """What /api/config returns."""

    env: str
    demoMode: bool  # camelCase on purpose: this is the exact JSON key the browser reads
    flags: dict[str, bool]


@router.get("/config")
async def get_config(settings: SettingsDep) -> ConfigResponse:
    return ConfigResponse(env=settings.app_env, demoMode=settings.demo_mode, flags=settings.flags)
