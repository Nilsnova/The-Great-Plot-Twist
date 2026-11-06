"""Hosts: the check that keeps presenter-only routes for the people who run the class.

A host is a signed-in player whose id is listed in the setting HOST_PLAYER_IDS (settings.py).
Nils puts his own id there in the Vercel settings. A presenter route asks for a host by writing
`host: HostDep` instead of `player: PlayerDep`:

    @router.post("/something-only-a-host-may-do")
    async def do_it(host: HostDep) -> ...: ...

    no token, or a token that Supabase refuses   ->  403 forbidden
    signed in, but not in HOST_PLAYER_IDS        ->  403 forbidden
    HOST_PLAYER_IDS is empty                     ->  403 forbidden for everybody

The id always comes from the verified login (auth.py), never from the address, a header or the
body, so nobody can name themselves a host. A host is an ordinary player in every other way.

Used by G14's host console and future presenter routes.

Used by: the presenter routes, and the tests in server/tests/test_hosts.py.
"""

from typing import Annotated

from fastapi import Depends, Request

from server.auth import Player, VerifierDep, read_bearer_token
from server.errors import ApiError
from server.settings import Settings, SettingsDep


def require_host(player: Player, settings: Settings) -> Player:
    """Give the player back if they are a host. Raises 403 forbidden if they are not."""
    if player.id not in settings.host_player_ids:
        raise ApiError(403, "forbidden", "Only a host can do this.")
    return player


async def get_current_host(
    request: Request, verifier: VerifierDep, settings: SettingsDep
) -> Player:
    """Host pages reveal nothing to visitors or refused logins: both answer 403."""
    try:
        player = await verifier.verify(read_bearer_token(request.headers.get("Authorization")))
    except ApiError as error:
        if error.status_code != 401:
            raise
        raise ApiError(403, "forbidden", "Only a host can do this.") from error
    return require_host(player, settings)


# Write `host: HostDep` in a route and FastAPI checks the login and the host list for you.
HostDep = Annotated[Player, Depends(get_current_host)]
