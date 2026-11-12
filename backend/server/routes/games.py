"""Game routes (docs/GAME-V3.md section 2, lane R): create a game, join one by its code, list
yours for Continue, read its lobby, leave it. Also the friend invite of TOWER-DEFENSE.md section 6,
POST /api/island/invite/join, which is now an alias of POST /api/games/join.

A game is an island (backend/server/island/games.py): your own island is the game you host, its
code ISLE-K7Q2M is the game's code, and you can be a member of other players' games. The database
part is supabase/migrations/20261112040000_game_rooms.sql. Coins stay in each player's own wallet.

Every route needs a signed-in player and the flag "islands" (404 feature_off), like
routes/island.py; join checks the login itself, because a guest comes there to get through the
guest gate (like POST /api/demo/join). Answers carry `Cache-Control: private, no-store`.

The game shape:
    {"code": "ISLE-K7Q2M", "hostName": "Captain Gull", "role": "host" | "member",
     "waveBest": 3, "members": 2, "maxMembers": 10}
    role is the caller's; members counts the active members, the host included.

POST /api/games  {} or {"actionUid": "..."}
    -> {"game": <game>, "created": true | false}
    Your own game: your island, made on first use with a new code (and the starting coins once,
    like GET /api/island). A player who hosts a game already gets that game (created false).
    Errors: 404 player_not_set_up, 422 validation_error, 429, 502, 503

POST /api/games/join  {"code": "ISLE-K7Q2M" | "K7Q2M", "actionUid": "..."}
POST /api/island/invite/join  (the same, kept for older links and clients)
    -> {"admitted": true, "game": <game>, "island": {"code": "ISLE-K7Q2M", "ownerName": "..."}}
    Joins the game for good (until you leave it). An anonymous guest who presents a valid game
    code is admitted like with a class code (demo_guest_admit) and passes the guest gate from then
    on, but only once the game took them: a guest refused (409 game_full) is not admitted. At most
    10 active members, the host included. Joining a game you are in again only moves
    it to the top of Continue. A code you are not in yet spends the code budget (10 tries in 10
    minutes per player); a code that names no game also spends the budget of the address, so
    guessing codes stays slow while ten friends on one home network can all join.
    Errors: 401, 403 demo_closed (a guest while the flag demo is off), 404 feature_off,
            404 no_such_game (404 no_such_island on the alias), 409 game_full ("This game has 10
            players already"), 404 player_not_set_up, 422 validation_error, 429

GET /api/games
    -> {"games": [<game>, ...]}  your own game and every game you are a member of, newest first
    (at most 20). Errors: 429, and the errors of GET /api/island

GET /api/games/{code}
    -> {"game": <game>, "members": [{"id": "<player id>", "name": "Captain Gull",
        "role": "host", "you": false}, ...]}  the lobby: the host first, then the members by when
    they joined; "you" marks the caller.
    Who is online is not here: the client reads it from the presence of the island's room
    (live:place:isle_<code>:1), whose ids are these ids.
    Errors: 403 not_member, 404 no_such_game, 429

POST /api/games/leave  {"code": "ISLE-K7Q2M"}
    -> {"left": true | false}  false when you were not in that game (nothing changed).
    Errors: 404 no_such_game, 409 host_cannot_leave, 422, 429

Being a member is the rule on the game's island: POST /api/island/build and /upgrade with
"code", POST /api/waves/start with an island code, POST /api/waves/join of a wave on that
island and GET /api/island/visit/{code} answer 403 not_member to a player who is not in that
game (the host is always in). Joining (this route or the invite alias) is the way in.

Used by: the front door's games card (Create, Join, Continue), the lobby and the Menu's Leave.
"""

from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Path, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from server.auth import Player, VerifierDep, read_bearer_token
from server.demo.code import admit
from server.demo.gate import demo_closed
from server.errors import ApiError
from server.flags import is_enabled
from server.island import games, store
from server.island.codes import read_code
from server.island.games import Game
from server.island.service import IslandCatalogueDep, no_such_island
from server.routes.demo import address_key
from server.routes.island import (
    ACTION_UID_PATTERN,
    CODE_MAX_LENGTH,
    NO_STORE,
    IslandPlayerDep,
)
from server.settings import SettingsDep
from server.supabase_admin import AdminDep

router = APIRouter()


class GameOut(BaseModel):
    code: str
    hostName: str
    role: str
    waveBest: int
    members: int
    maxMembers: int


class CreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actionUid: str | None = Field(default=None, pattern=ACTION_UID_PATTERN)


class CreateResponse(BaseModel):
    game: GameOut
    created: bool


class JoinRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(max_length=CODE_MAX_LENGTH)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)


class InviteIslandOut(BaseModel):
    code: str
    ownerName: str


class JoinResponse(BaseModel):
    admitted: bool
    game: GameOut
    island: InviteIslandOut


class GamesResponse(BaseModel):
    games: list[GameOut]


class MemberOut(BaseModel):
    id: str
    name: str
    role: str
    you: bool


class LobbyResponse(BaseModel):
    game: GameOut
    members: list[MemberOut]


class LeaveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(max_length=CODE_MAX_LENGTH)


class LeaveResponse(BaseModel):
    left: bool


def game_out(game: Game) -> GameOut:
    return GameOut(
        code=game.code,
        hostName=game.host_name,
        role=game.role,
        waveBest=game.wave_best,
        members=game.members,
        maxMembers=games.MAX_MEMBERS,
    )


@router.post("/games")
async def post_create(
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
    body: CreateRequest | None = None,
) -> CreateResponse:
    request.app.state.games_budget.spend(player.id)
    game, created = await games.create(admin, catalogue.starting_coins, player.id)
    return CreateResponse(game=game_out(game), created=created)


async def join_game(
    body: JoinRequest,
    request: Request,
    response: Response,
    verifier,
    settings,
    admin,
    missing: Callable[[], ApiError],
) -> JoinResponse:
    # The login check without the guest gate: a guest comes here to get through it.
    player: Player = await verifier.verify(read_bearer_token(request.headers.get("Authorization")))
    if not is_enabled("islands", settings.flags):
        raise ApiError(404, "feature_off", "Islands are not open yet.")
    response.headers["Cache-Control"] = NO_STORE
    gate = request.app.state.demo_gate
    if player.is_anonymous and not gate.flag_on:
        raise demo_closed()
    request.app.state.games_budget.spend(player.id)
    code = read_code(body.code)
    island = await store.find_island(admin, code) if code is not None else None
    # A code you are not in yet spends the player's code budget; a code that names no game also
    # spends the address's, so guessing stays slow while ten friends on one home network can
    # still all join one real game.
    if island is None or not await games.is_member(admin, island, player.id):
        request.app.state.invite_budget.spend(player.id)
    if island is None:
        request.app.state.invite_budget.spend(address_key(request))
        raise missing()
    # The door first (game_join counts the members under a lock of the island row and changes
    # nothing when it refuses), the guest gate after: a guest turned away with 409 game_full (or
    # any other refusal) is never admitted by a game they did not get into.
    game = await games.join(admin, island, player.id)
    if player.is_anonymous:
        if await admit(admin, player.id) == "missing":
            raise ApiError(
                404,
                "player_not_set_up",
                "Your guest login is gone. Reload the page and join again.",
            )
        gate.remember(player.id)
    return JoinResponse(
        admitted=True,
        game=game_out(game),
        island=InviteIslandOut(code=game.code, ownerName=game.host_name),
    )


@router.post("/games/join")
async def post_join(
    body: JoinRequest,
    request: Request,
    response: Response,
    verifier: VerifierDep,
    settings: SettingsDep,
    admin: AdminDep,
) -> JoinResponse:
    return await join_game(body, request, response, verifier, settings, admin, games.no_such_game)


@router.post("/island/invite/join")
async def post_invite_join(
    body: JoinRequest,
    request: Request,
    response: Response,
    verifier: VerifierDep,
    settings: SettingsDep,
    admin: AdminDep,
) -> JoinResponse:
    """The friend invite of TOWER-DEFENSE.md section 6: the same as POST /api/games/join."""
    return await join_game(body, request, response, verifier, settings, admin, no_such_island)


@router.get("/games")
async def get_games(player: IslandPlayerDep, admin: AdminDep, request: Request) -> GamesResponse:
    request.app.state.games_budget.spend(player.id)
    return GamesResponse(games=[game_out(game) for game in await games.mine(admin, player.id)])


@router.post("/games/leave")
async def post_leave(
    body: LeaveRequest, player: IslandPlayerDep, admin: AdminDep, request: Request
) -> LeaveResponse:
    request.app.state.games_budget.spend(player.id)
    return LeaveResponse(left=await games.leave(admin, body.code, player.id))


@router.get("/games/{code}")
async def get_lobby(
    code: Annotated[str, Path(max_length=CODE_MAX_LENGTH)],
    player: IslandPlayerDep,
    admin: AdminDep,
    request: Request,
) -> LobbyResponse:
    # A code lookup: the visit budget, so guessing codes stays slow.
    request.app.state.island_visit_budget.spend(player.id)
    lobby = await games.lobby(admin, code, player.id)
    return LobbyResponse(
        game=game_out(lobby.game),
        members=[
            MemberOut(id=m.id, name=m.name, role=m.role, you=m.id == player.id)
            for m in lobby.members
        ],
    )
