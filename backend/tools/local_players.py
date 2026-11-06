"""Public, disposable test identities. These tokens have no meaning outside this tool."""

from dataclasses import dataclass
from uuid import UUID

from server.auth import Player, unauthorized, validate_token


@dataclass(frozen=True)
class LocalPlayer:
    name: str
    id: str
    token: str


PLAYERS = tuple(
    LocalPlayer(name, str(UUID(int=index)), f"local.{name}.fixture")
    for index, name in enumerate(("host", "friend", "other", "fourth"), start=1)
)
HOST_ID = PLAYERS[0].id


class LocalVerifier:
    """Only the four fixture tokens work, and a deleted player stays deleted."""

    def __init__(self, database):
        self.database = database

    async def verify(self, token: str) -> Player:
        validate_token(token)
        for player in PLAYERS:
            if token == player.token and self.database.player_exists(player.id):
                return Player(player.id)
        raise unauthorized("Choose an existing local test player.")
