"""GET /api/world: public shared coast, behind case, cached for 30 seconds.

No sign-in, body or query parameters. The answer contains captain names and solve order only.
A laptop without a database answers dark; database failure is 503 and is never cached.
"""

from fastapi import APIRouter, Request, Response

from server.errors import ApiError
from server.game.case_service import CaseDep
from server.game.world_state import build_world_view, read_world
from server.supabase_admin import AdminDep

router = APIRouter()


@router.get("/world")
async def get_world(request: Request, response: Response, case: CaseDep, admin: AdminDep) -> dict:
    if request.query_params:
        raise ApiError(422, "validation_error", "This address takes no query parameters.")
    state = await read_world(admin)
    line = case.data.raw["relighting"]["spoiler_rule"]["everyone_else_sees"]
    answer = build_world_view(state, line)
    response.headers["Cache-Control"] = "public, max-age=30, s-maxage=30"
    return answer
