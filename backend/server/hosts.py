"""Hosts: the check that keeps presenter-only routes for the people who run the class.

A host is a signed-in player whose id is listed in the setting HOST_PLAYER_IDS (settings.py).
Nils puts his own id there in the Vercel settings. A presenter route asks for a host by writing
`host: HostDep` instead of `player: PlayerDep`:

    @router.post("/something-only-a-host-may-do")
    async def do_it(host: HostDep) -> ...: ...

    no token, or a token that Supabase refuses   ->  401 unauthorized  (the login is checked first)
    signed in, but not in HOST_PLAYER_IDS        ->  403 forbidden
    HOST_PLAYER_IDS is empty                     ->  403 forbidden for everybody

The id always comes from the verified login (auth.py), never from the address, a header or the
body, so nobody can name themselves a host. A host is an ordinary player in every other way.

The prediction desk settlement route uses this check. The later presenter routes use it too.

Used by: the presenter routes, and the tests in server/tests/test_hosts.py.
"""

from typing import Annotated

from fastapi import Depends

from server.auth import Player, PlayerDep
from server.errors import ApiError
from server.settings import Settings, SettingsDep


def require_host(player: Player, settings: Settings) -> Player:
    """Give the player back if they are a host. Raises 403 forbidden if they are not."""
    if player.id not in settings.host_player_ids:
        raise ApiError(403, "forbidden", "Only a host can do this.")
    return player


async def get_current_host(player: PlayerDep, settings: SettingsDep) -> Player:
    """FastAPI dependency: the signed-in host, or a 401 (not signed in) or 403 (not a host)."""
    return require_host(player, settings)


# Write `host: HostDep` in a route and FastAPI checks the login and the host list for you.
HostDep = Annotated[Player, Depends(get_current_host)]
