"""GET /api/world exposes only the coast state and Wall names, with no sign-in.

The case flag gates the route before reads. Query parameters give 422, no database means
a dark world, database failures give a private generic 503, and successful views cache 30 s.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from server.errors import ApiError
from server.game.world_state import CACHE_SECONDS, PRIVATE_HEADERS, WorldReader
from server.settings import SettingsDep

router = APIRouter()


def get_world_reader(request: Request) -> WorldReader:
    return request.app.state.world_reader


WorldDep = Annotated[WorldReader, Depends(get_world_reader)]


@router.get("/world")
async def get_world(
    request: Request, response: Response, settings: SettingsDep, world: WorldDep
) -> dict:
    if not settings.flags.get("case", False):
        raise ApiError(404, "feature_off", "The case is not available yet.", PRIVATE_HEADERS)
    if request.query_params:
        raise ApiError(
            422, "validation_error", "This address takes no query parameters.", PRIVATE_HEADERS
        )
    result = await world.view()
    response.headers["Cache-Control"] = f"public, max-age={CACHE_SECONDS}, s-maxage={CACHE_SECONDS}"
    return result
