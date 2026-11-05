"""Health route: GET /api/health answers "is the API alive?".

Used by: teammates (open /api/health in a browser), uptime checks and the game client.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from server import __version__
from server.settings import SettingsDep

router = APIRouter()


class HealthResponse(BaseModel):
    """What /api/health returns. It contains no secrets."""

    status: str
    version: str
    env: str


@router.get("/health")
async def get_health(settings: SettingsDep) -> HealthResponse:
    return HealthResponse(status="ok", version=__version__, env=settings.app_env)
