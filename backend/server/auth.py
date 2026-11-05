"""Login check: turns "Authorization: Bearer <token>" into a Player.

The browser signs in with Supabase (GitHub sign-in) and receives a token. It sends that token
with every request that needs a player. This file asks Supabase "whose token is this?" and
returns the answer as a Player.

    No header, or a header that is not "Bearer <token>"  ->  401 unauthorized
    Supabase says the token is wrong or has expired      ->  401 unauthorized
    SUPABASE_URL or the publishable key is missing       ->  503 auth_not_configured
    Supabase cannot be reached or answers strangely      ->  503 auth_unavailable

A good answer is remembered for 60 seconds, so a busy player does not cause one Supabase call
per click. The memory is keyed by a SHA-256 hash of the token: the raw token is never stored
in the cache and never written to a log. (Side effect: a player who just signed out, whose
token just expired or whose account was deleted may still be accepted for up to 60 seconds.)

Every refused token leaves one log line with Supabase's HTTP status (never the token). If the
publishable key is wrong or was rotated, Supabase refuses EVERY token, and that line is the
only trace the team gets.

The Player is only the verified user id. The name that other players see is
profiles.display_name in the database, not a value from the token.

Used by: every route that needs a signed-in player. Write `player: PlayerDep` in the route.
"""

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Annotated

import httpx
from fastapi import Depends, Request

from server.clock import Clock, utc_now
from server.errors import ApiError
from server.settings import Settings

logger = logging.getLogger(__name__)

CACHE_SECONDS = 60
TIMEOUT_SECONDS = 3.0

# Supabase answers with one of these when the token itself is the problem.
TOKEN_REJECTED_STATUSES = (400, 401, 403)


@dataclass(frozen=True)
class Player:
    """A signed-in player: Supabase's verified user id.

    There is no name here on purpose. A player can edit their own login details in Supabase, so
    a name taken from the token would skip the rules of the profiles table (length, allowed
    characters) and could even show a real name. Other players see profiles.display_name, which
    is read from the database when it is needed.
    """

    id: str


@dataclass(frozen=True)
class CacheEntry:
    """A remembered answer and the moment it stops being valid."""

    player: Player
    expires_at: datetime


def unauthorized(message: str) -> ApiError:
    """The 401 error. The WWW-Authenticate header is what the HTTP rules ask for on a 401."""
    return ApiError(401, "unauthorized", message, headers={"WWW-Authenticate": "Bearer"})


def auth_unavailable() -> ApiError:
    return ApiError(503, "auth_unavailable", "Login is not available right now. Try again soon.")


def read_bearer_token(header: str | None) -> str:
    """Get the token out of a header like "Bearer abc123". Raises 401 if it is missing or odd."""
    if header is None or not header.strip():
        raise unauthorized("Sign in first: the Authorization header is missing.")
    parts = header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise unauthorized("The Authorization header must look like: Bearer <token>")
    token = parts[1]
    # A real token is plain ASCII. Refusing anything else also keeps odd bytes away from httpx,
    # which would otherwise fail with an error that looks like our fault instead of the caller's.
    if not token.isascii():
        raise unauthorized("The token contains characters that are not allowed.")
    return token


def hash_token(token: str) -> str:
    """A SHA-256 fingerprint of the token. The cache uses this instead of the token itself."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def player_from_response(response: httpx.Response) -> Player:
    """Understand Supabase's answer to "who owns this token?"."""
    if response.status_code in TOKEN_REJECTED_STATUSES:
        # The status only, never the token. A warning (not info) so it shows in production logs.
        logger.warning("Supabase refused a login token: HTTP %s", response.status_code)
        raise unauthorized("Your login is not valid or has expired. Please sign in again.")
    if not response.is_success:
        logger.warning("Supabase login check answered HTTP %s", response.status_code)
        raise auth_unavailable()

    try:
        user = response.json()
    except ValueError as error:
        raise auth_unavailable() from error
    if not isinstance(user, dict) or not isinstance(user.get("id"), str) or not user["id"]:
        raise auth_unavailable()
    return Player(id=user["id"])


class PlayerVerifier:
    """Asks Supabase who owns a token and remembers good answers for CACHE_SECONDS.

    `transport` and `clock` can be replaced in tests: a fake transport answers without any
    network, and a fake clock lets a test move time forward instantly.
    """

    def __init__(
        self,
        settings: Settings,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Clock = utc_now,
    ) -> None:
        self.settings = settings
        self.transport = transport
        self.clock = clock
        # Keys are token hashes (see hash_token). Never the raw token.
        self.cache: dict[str, CacheEntry] = {}

    async def verify(self, token: str) -> Player:
        """Return the player who owns this token, or raise an ApiError."""
        self.check_configured()
        key = hash_token(token)
        player = self.find_in_cache(key)
        if player is not None:
            return player
        player = await self.ask_supabase(token)
        self.remember(key, player)
        return player

    def check_configured(self) -> None:
        if not self.settings.supabase_url or not self.settings.supabase_publishable_key:
            raise ApiError(503, "auth_not_configured", "Login is not set up on this server yet.")

    def find_in_cache(self, key: str) -> Player | None:
        entry = self.cache.get(key)
        if entry is None:
            return None
        if self.clock() >= entry.expires_at:
            del self.cache[key]
            return None
        return entry.player

    def remember(self, key: str, player: Player) -> None:
        now = self.clock()
        self.forget_expired(now)
        self.cache[key] = CacheEntry(player, now + timedelta(seconds=CACHE_SECONDS))

    def forget_expired(self, now: datetime) -> None:
        """Remove old entries so the cache cannot grow forever."""
        expired = [key for key, entry in self.cache.items() if now >= entry.expires_at]
        for key in expired:
            del self.cache[key]

    async def ask_supabase(self, token: str) -> Player:
        """GET {SUPABASE_URL}/auth/v1/user. The token goes in Authorization, the key in apikey."""
        url = f"{self.settings.supabase_url}/auth/v1/user"
        headers = {
            "apikey": self.settings.supabase_publishable_key,
            "Authorization": f"Bearer {token}",
        }
        try:
            async with httpx.AsyncClient(
                transport=self.transport, timeout=TIMEOUT_SECONDS
            ) as client:
                response = await client.get(url, headers=headers)
        except (httpx.RequestError, httpx.InvalidURL) as error:
            # Log only the kind of error. Never the token, and never the error text.
            logger.warning("Supabase login check failed: %s", type(error).__name__)
            raise auth_unavailable() from error
        return player_from_response(response)


def get_verifier(request: Request) -> PlayerVerifier:
    """FastAPI dependency: the verifier that create_app() stored on the app."""
    return request.app.state.verifier


VerifierDep = Annotated[PlayerVerifier, Depends(get_verifier)]


async def get_current_player(request: Request, verifier: VerifierDep) -> Player:
    """FastAPI dependency: the signed-in player, or a 401/503 error."""
    token = read_bearer_token(request.headers.get("Authorization"))
    return await verifier.verify(token)


# Write `player: PlayerDep` in a route and FastAPI checks the login for you.
PlayerDep = Annotated[Player, Depends(get_current_player)]
