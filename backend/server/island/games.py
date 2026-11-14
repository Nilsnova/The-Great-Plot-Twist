"""Games (docs/GAME-V3.md section 2, lane R): create one, join one by its code, list yours, leave.

A GAME IS AN ISLAND. Every player has one island (islands, made by island_open); that island is
the game the player HOSTS, and its code (ISLE-K7Q2M) is the game's code. A player can be a MEMBER
of any number of other players' games (island_members). So a player's existing island, its
buildings and its best wave are their first game, and nothing moves.

    create()      POST /api/games: your own game (made on first use), stamped for Continue
    join()        POST /api/games/join (and the alias POST /api/island/invite/join): become a
                  member; at most MAX_MEMBERS active members, the host included (409 game_full)
    mine()        GET /api/games: your games for Continue, newest first
    lobby()       GET /api/games/{code}: the host and the members, for the lobby card
    leave()       POST /api/games/leave: a member leaves (the host cannot)
    require_member()  the rule of the co-op build, upgrade, bell, wave join and visit: only a
                  member of a game (or its host) builds, upgrades, rings the bell, joins a
                  wave or reads the island by its code (403 not_member)

The database part is supabase/migrations/20261112040000_game_rooms.sql: game_join (the cap,
under a lock of the island row), game_leave, game_list and game_members. Who is online is not
stored: it comes from the presence of the island's room on the client.

Used by: routes/games.py, routes/island.py (the invite alias), service.py (co-op build,
upgrade and the visit), waves.py (the bell and the wave join) and the tests.
"""

import logging
from dataclasses import dataclass, replace
from typing import Literal

from pydantic import BaseModel, StrictInt, StrictStr, ValidationError

from server.errors import ApiError
from server.game.islet_store import player_not_set_up
from server.island import store
from server.island.codes import read_code, shown
from server.island.store import Island
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

logger = logging.getLogger(__name__)

# GAME-V3 section 2: the creator plus up to 9 friends.
MAX_MEMBERS = 10
# Continue shows at most this many games.
LIST_LIMIT = 20


@dataclass(frozen=True)
class Game:
    """One game as the routes answer it."""

    code: str  # as people see it: ISLE-K7Q2M
    host_id: str
    host_name: str
    role: str  # "host" or "member": the caller's role
    wave_best: int
    members: int  # active members, the host included


@dataclass(frozen=True)
class Member:
    id: str
    name: str
    role: str
    captain_role: str | None = None  # medic, engineer, gunner or None (captain tree)


@dataclass(frozen=True)
class Lobby:
    game: Game
    members: tuple[Member, ...]


class JoinedRow(BaseModel):
    status: Literal["joined"]
    role: Literal["host", "member"]
    members: StrictInt
    repeat: bool


class RefusedRow(BaseModel):
    status: Literal["refused"]
    reason: StrictStr
    members: StrictInt = 0


class LeftRow(BaseModel):
    status: Literal["left"]
    repeat: bool


class GameRow(BaseModel):
    code: StrictStr
    hostId: StrictStr
    hostName: StrictStr
    role: Literal["host", "member"]
    waveBest: StrictInt
    members: StrictInt
    openedAt: StrictStr


class MemberRow(BaseModel):
    id: StrictStr
    name: StrictStr
    role: Literal["host", "member"]


class CaptainRoleRow(BaseModel):
    player_id: StrictStr
    captain_role: StrictStr | None = None


class MembershipRow(BaseModel):
    player_id: StrictStr


def no_such_game() -> ApiError:
    return ApiError(404, "no_such_game", "There is no game with that code. Check the code.")


def game_full() -> ApiError:
    return ApiError(409, "game_full", f"This game has {MAX_MEMBERS} players already.")


def not_member() -> ApiError:
    return ApiError(403, "not_member", "Join this game first: open its link or type its code.")


def host_cannot_leave() -> ApiError:
    return ApiError(409, "host_cannot_leave", "You host this game, so you cannot leave it.")


def read(model: type[BaseModel], value: object):
    try:
        return model.model_validate(value)
    except ValidationError as error:
        logger.warning("The database sent a %s that we could not read.", model.__name__)
        raise store.unreadable() from error


async def find(admin: SupabaseAdmin, typed_code: str) -> Island:
    """The island (the game) of a typed code, with or without ISLE-, any case. 404 if none."""
    code = read_code(typed_code)
    island = await store.find_island(admin, code) if code is not None else None
    if island is None:
        raise no_such_game()
    return island


async def is_member(admin: SupabaseAdmin, island: Island, player_id: str) -> bool:
    """True for the host and for every active member of the game of `island`."""
    return await is_member_of(admin, island.owner, player_id)


async def is_member_of(admin: SupabaseAdmin, owner: str, player_id: str) -> bool:
    """The same by the island owner's id (the game of a wave names only its owner)."""
    if owner == player_id:
        return True
    query = {
        "select": "player_id",
        "island_owner": f"eq.{owner}",
        "player_id": f"eq.{player_id}",
        "left_at": "is.null",
        "limit": "1",
    }
    rows = await admin.select_rows("island_members", query)
    return any(read(MembershipRow, row).player_id == player_id for row in rows)


async def require_member(admin: SupabaseAdmin, island: Island, player_id: str) -> None:
    """The co-op rule (GAME-V3 section 2): only members build, upgrade, ring the bell, join a
    wave or look at the island there (the host always)."""
    await require_member_of(admin, island.owner, player_id)


async def require_member_of(admin: SupabaseAdmin, owner: str, player_id: str) -> None:
    if not await is_member_of(admin, owner, player_id):
        raise not_member()


async def run_join(admin: SupabaseAdmin, island: Island, player_id: str) -> JoinedRow:
    reply = await admin.call_function(
        "game_join",
        {"p_player_id": player_id, "p_island_owner": island.owner, "p_max_members": MAX_MEMBERS},
    )
    if isinstance(reply, dict) and reply.get("status") == "refused":
        refused = read(RefusedRow, reply)
        if refused.reason == "game_full":
            raise game_full()
        if refused.reason == "no_such_game":
            raise no_such_game()
        if refused.reason == "player_not_set_up":
            raise player_not_set_up()
        raise SupabaseRejected()
    return read(JoinedRow, reply)


async def game_of(admin: SupabaseAdmin, island: Island, role: str, members: int) -> Game:
    host_name = await store.read_display_name(admin, island.owner)
    return Game(shown(island.code), island.owner, host_name, role, island.wave_best, members)


async def create(admin: SupabaseAdmin, starting_coins: int, player_id: str) -> tuple[Game, bool]:
    """Your own game: the island is made on first use (and the starting coins paid once), the
    host row written or stamped. Answers (the game, whether it was made just now)."""
    island, created = await store.open_island_made(admin, player_id, starting_coins)
    joined = await run_join(admin, island, player_id)
    return await game_of(admin, island, "host", joined.members), created


async def join(admin: SupabaseAdmin, island: Island, player_id: str) -> Game:
    """Become a member of the game of `island` (the host just opens it). 409 game_full."""
    joined = await run_join(admin, island, player_id)
    return await game_of(admin, island, joined.role, joined.members)


async def mine(admin: SupabaseAdmin, player_id: str) -> tuple[Game, ...]:
    """Your games for Continue, newest first (your own island first when it is the newest)."""
    reply = await admin.call_function(
        "game_list", {"p_player_id": player_id, "p_limit": LIST_LIMIT}
    )
    if not isinstance(reply, list):
        raise store.unreadable()
    games = []
    for value in reply:
        row = read(GameRow, value)
        code = read_code(row.code)
        if code is None:
            raise store.unreadable()
        game = Game(shown(code), row.hostId, row.hostName, row.role, row.waveBest, row.members)
        games.append(game)
    return tuple(games)


async def captain_roles(admin: SupabaseAdmin, ids: list[str]) -> dict[str, str]:
    """{player: role} of the members who picked a captain role (docs/GAME-V3.md, Captain tree
    and roles): the lobby shows it so the crew sees who does what."""
    query = {"select": "player_id,captain_role", "player_id": f"in.({','.join(ids)})"}
    rows = await admin.select_rows("islands", query)
    roles = (read(CaptainRoleRow, row) for row in rows if isinstance(row, dict))
    return {row.player_id: row.captain_role for row in roles if row.captain_role}


async def lobby(admin: SupabaseAdmin, typed_code: str, player_id: str) -> Lobby:
    """The lobby of a game you are in: its host and members (who is online: the room's
    presence). 404 no_such_game, 403 not_member."""
    island = await find(admin, typed_code)
    await require_member(admin, island, player_id)
    reply = await admin.call_function("game_members", {"p_island_owner": island.owner})
    if not isinstance(reply, list) or not reply:
        raise store.unreadable()
    members = tuple(Member(**read(MemberRow, value).model_dump()) for value in reply)
    roles = await captain_roles(admin, [member.id for member in members])
    members = tuple(replace(member, captain_role=roles.get(member.id)) for member in members)
    host = members[0]
    if host.role != "host" or host.id != island.owner:
        raise store.unreadable()
    role = "host" if player_id == island.owner else "member"
    game = Game(shown(island.code), island.owner, host.name, role, island.wave_best, len(members))
    return Lobby(game, members)


async def leave(admin: SupabaseAdmin, typed_code: str, player_id: str) -> bool:
    """A member leaves the game. Answers whether they were in it. 409 host_cannot_leave."""
    island = await find(admin, typed_code)
    reply = await admin.call_function(
        "game_leave", {"p_player_id": player_id, "p_island_owner": island.owner}
    )
    if isinstance(reply, dict) and reply.get("status") == "refused":
        refused = read(RefusedRow, reply)
        if refused.reason == "host_cannot_leave":
            raise host_cannot_leave()
        if refused.reason == "no_such_game":
            raise no_such_game()
        raise SupabaseRejected()
    return not read(LeftRow, reply).repeat
