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

The Player is the verified user id and whether Supabase calls the user anonymous (a guest of the
class demo, signed in with Supabase's anonymous sign-in). The name that other players see is
profiles.display_name in the database, not a value from the token.

Guests (decision D029): a guest is let in only while the host's demo window is open and the feature
flag demo is on. get_current_player asks the demo gate (server/demo/gate.py) about every guest, and
the gate answers 403 demo_closed otherwise. The gate also gives a guest a captain name and the
default kit on the first call it lets through. GitHub and Google users never reach the gate. One
route is never gated: DELETE /api/me, so a guest can always delete their own data.

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
MAX_TOKEN_LENGTH = 4096

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
    # True for a Supabase anonymous user (a demo guest). Read from Supabase's answer, never from
    # the request. A guest who links GitHub becomes a normal user at their next login check.
    is_anonymous: bool = False


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
    """Get a three-part login token from its header. Raises 401 if it is missing or odd."""
    if header is None or not header.strip():
        raise unauthorized("Sign in first: the Authorization header is missing.")
    parts = header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise unauthorized("The Authorization header must look like: Bearer <token>")
    token = parts[1]
    validate_token(token)
    return token


def validate_token(token: str) -> None:
    """Refuse oversized or incomplete login tokens before caching or any outside request."""
    # A real token is plain ASCII. Refusing anything else also keeps odd bytes away from httpx,
    # which would otherwise fail with an error that looks like our fault instead of the caller's.
    if len(token) > MAX_TOKEN_LENGTH:
        raise unauthorized("The login token is too long.")
    if not token.isascii():
        raise unauthorized("The token contains characters that are not allowed.")
    parts = token.split(".")
    if len(parts) != 3 or not all(parts):
        raise unauthorized("The login token must have three nonempty parts.")


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
    return Player(id=user["id"], is_anonymous=is_anonymous_user(user))


def is_anonymous_user(user: dict) -> bool:
    """True if Supabase's user object says this is an anonymous (guest) user.

    Supabase sets "is_anonymous": true on such users, and their app_metadata names the provider
    "anonymous". When the answer has the "is_anonymous" field, it alone decides: a guest who linked
    GitHub or Google gets false there, even if an older provider name is still in app_metadata.
    Only an answer without that field falls back to the provider name.
    """
    flag = user.get("is_anonymous")
    if isinstance(flag, bool):
        return flag
    metadata = user.get("app_metadata")
    return isinstance(metadata, dict) and metadata.get("provider") == "anonymous"


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
        validate_token(token)
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


async def admit_guest(request: Request, player: Player) -> Player:
    """Let a guest through only while the demo is open (403 demo_closed). Others pass untouched.

    The gate lives on the app (create_app stores it as app.state.demo_gate). Routes that verify a
    token themselves instead of using PlayerDep call this too.
    """
    if player.is_anonymous and not is_own_deletion(request):
        await request.app.state.demo_gate.admit(player)
    return player


def is_own_deletion(request: Request) -> bool:
    """DELETE /api/me ("Delete my data") stays open to a guest even while the demo is closed."""
    return request.method == "DELETE" and request.url.path == "/api/me"


async def get_current_player(request: Request, verifier: VerifierDep) -> Player:
    """FastAPI dependency: the signed-in player, or a 401/403/503 error."""
    token = read_bearer_token(request.headers.get("Authorization"))
    return await admit_guest(request, await verifier.verify(token))


# Write `player: PlayerDep` in a route and FastAPI checks the login for you.
PlayerDep = Annotated[Player, Depends(get_current_player)]
