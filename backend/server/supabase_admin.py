"""Server-only Supabase client: calls database functions with the SECRET key.

    !!! THIS MODULE MUST NEVER RUN IN THE BROWSER !!!

SUPABASE_SECRET_KEY skips every row-level-security rule. Whoever holds it can read and change
every player's data and coins. So:
  * only server code (backend/main.py and backend/server/) may import this file,
  * never copy the key into a VITE_ variable, browser code, a log line, an error message or
    a commit,
  * errors from this file are plain sentences. They never repeat what the database said.

What it does:
  * call_function(name, params) runs a Postgres function through Supabase's REST API
    (POST {SUPABASE_URL}/rest/v1/rpc/<name>). The wallet uses it to run the atomic database
    function apply_wallet_transaction.
  * select_rows(table, query) reads rows from a table
    (GET {SUPABASE_URL}/rest/v1/<table>?<query>). It can only read, never change anything.
    The keep-alive route uses it.

Used by: wallet.py, routes/keepalive.py, and later any server module that must change data
players may not touch.
"""

import logging
import re
from typing import Annotated, Any

import httpx
from fastapi import Depends, Request

from server.errors import ApiError
from server.settings import Settings

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 5.0

# New-style Supabase secret keys start with this. Old-style keys are JWTs (long dotted text).
NEW_STYLE_KEY_PREFIX = "sb_secret_"

# Database function names are lowercase words joined by underscores. Anything else is refused,
# so a name can never add extra pieces to the URL.
FUNCTION_NAME = re.compile(r"[a-z][a-z0-9_]*")

# Table names follow the same rule, for the same reason.
TABLE_NAME = re.compile(r"[a-z][a-z0-9_]*")

# Postgres error codes (the "code" in the JSON that Supabase sends back).
RAISED_BY_SQL_FUNCTION = "P0001"  # a `raise exception` inside one of our SQL functions
UNIQUE_VIOLATION = "23505"  # a row with the same unique values exists already


class SupabaseAdminError(ApiError):
    """Base class: anything that goes wrong while the server talks to the database."""


class SupabaseNotConfigured(SupabaseAdminError):
    """SUPABASE_URL or SUPABASE_SECRET_KEY is missing."""

    def __init__(self) -> None:
        super().__init__(
            503, "database_not_configured", "The database is not set up on this server yet."
        )


class SupabaseUnavailable(SupabaseAdminError):
    """The database could not be reached, took too long or had an internal problem.

    Careful with money: a call that timed out may already have been saved by the database. For
    a coin change this error means "outcome unknown", not "nothing happened".
    """

    def __init__(self) -> None:
        super().__init__(
            503, "database_unavailable", "The database is not available right now. Try again soon."
        )


class SupabaseRejected(SupabaseAdminError):
    """The database refused the call or answered with something we did not expect."""

    def __init__(self, message: str = "The database could not do that.") -> None:
        super().__init__(502, "database_error", message)


class InsufficientFunds(SupabaseAdminError):
    """The database raised insufficient_funds: the player cannot afford this."""

    def __init__(self) -> None:
        super().__init__(409, "insufficient_funds", "You do not have enough coins for that.")


class AlreadyApplied(SupabaseAdminError):
    """The database refused a repeat: this player + reason + ref is in the ledger already.

    Nothing changed. For a coin change it means the first request went through.
    """

    def __init__(self) -> None:
        super().__init__(409, "already_applied", "This was already done.")


def build_headers(secret_key: str) -> dict[str, str]:
    """The HTTP headers that prove to Supabase that the server is calling.

    New-style keys (sb_secret_...) are NOT JWTs, so they go in the apikey header only.
    Old-style keys (the "service_role" JWT) go in apikey AND in Authorization: Bearer.

    TODO: verify this against the live Supabase project before the first real deploy.
    Supabase has changed how its keys work before, so check the current docs and try one call.
    """
    headers = {"apikey": secret_key, "Content-Type": "application/json"}
    if not secret_key.startswith(NEW_STYLE_KEY_PREFIX):
        headers["Authorization"] = f"Bearer {secret_key}"
    return headers


def read_error_body(response: httpx.Response) -> dict:
    """The JSON error Supabase sent, or an empty dictionary if there is none."""
    try:
        body = response.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


def is_insufficient_funds(body: dict) -> bool:
    """True if our SQL function raised exactly insufficient_funds (code P0001).

    The check is exact on purpose. The text of other database errors can contain the whole
    failing row, including a ref that a player chose, so searching the text would be fooled.
    """
    raised_by_our_function = body.get("code") == RAISED_BY_SQL_FUNCTION
    return raised_by_our_function and body.get("message") == "insufficient_funds"


def is_already_applied(body: dict) -> bool:
    """True if the ledger refused a repeat (unique violation, code 23505).

    The only unique rule the money function can break is "one ledger row per player, reason
    and ref" (the index wallet_transactions_one_row_per_ref in the migration).
    """
    return body.get("code") == UNIQUE_VIOLATION


def read_success_body(response: httpx.Response) -> Any:
    """The JSON value a database function returned. None if it returned nothing."""
    if not response.content:
        return None
    try:
        return response.json()
    except ValueError as error:
        raise SupabaseRejected("The database sent an answer we could not read.") from error


def read_reply(response: httpx.Response) -> Any:
    """Turn the database's HTTP answer into a Python value, or raise a typed error."""
    if response.is_success:
        return read_success_body(response)

    body = read_error_body(response)
    if is_already_applied(body):
        raise AlreadyApplied()
    if is_insufficient_funds(body):
        raise InsufficientFunds()

    # Log the status and the database's short error code. Never the key, never the body.
    logger.warning(
        "Database call failed: HTTP %s, database code %s", response.status_code, body.get("code")
    )
    if response.is_server_error:
        raise SupabaseUnavailable()
    raise SupabaseRejected()


def read_rows(reply: Any) -> list[dict[str, Any]]:
    """A table read answers with a JSON list of rows (an empty list if nothing matched)."""
    if not isinstance(reply, list):
        raise SupabaseRejected("The database sent an answer we could not read.")
    return reply


class SupabaseAdmin:
    """Talks to the database as the server: runs Postgres functions and reads rows.

    create_app() makes one and stores it.
    """

    def __init__(
        self,
        base_url: str,
        secret_key: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url
        self._secret_key = secret_key  # private on purpose: nothing else should read it
        self.transport = transport  # tests pass a fake transport here, so no network is used

    async def call_function(self, name: str, params: dict[str, Any]) -> Any:
        """Run the database function `name` with `params` and return its JSON result."""
        self.check_configured()
        if not FUNCTION_NAME.fullmatch(name):
            raise ValueError(f"Not a valid database function name: {name!r}")
        return await self._send("POST", f"{self.base_url}/rest/v1/rpc/{name}", body=params)

    async def select_rows(self, table: str, query: dict[str, str]) -> list[dict[str, Any]]:
        """Read rows from `table`. This only reads: it can never change anything.

        `query` holds the options for the address. For example {"select": "id", "limit": "1"}
        asks for the id column of at most one row. Returns the rows as a list of dictionaries.
        """
        self.check_configured()
        if not TABLE_NAME.fullmatch(table):
            raise ValueError(f"Not a valid database table name: {table!r}")
        reply = await self._send("GET", f"{self.base_url}/rest/v1/{table}", params=query)
        return read_rows(reply)

    def check_configured(self) -> None:
        """Stop before any network call if the address or the secret key is missing."""
        if not self.base_url or not self._secret_key:
            raise SupabaseNotConfigured()

    async def _send(
        self,
        method: str,
        url: str,
        params: dict[str, str] | None = None,
        body: dict[str, Any] | None = None,
    ) -> Any:
        """Send one request with the secret key. Returns the JSON answer or raises a typed error.

        The leading underscore means: only this class calls it. It can send any kind of request
        with the secret key, so the public methods above are the only doors to it.
        """
        try:
            async with httpx.AsyncClient(
                transport=self.transport, timeout=TIMEOUT_SECONDS
            ) as client:
                response = await client.request(
                    method, url, params=params, json=body, headers=build_headers(self._secret_key)
                )
        except (httpx.RequestError, httpx.InvalidURL) as error:
            logger.warning("Database call failed: %s", type(error).__name__)
            raise SupabaseUnavailable() from error
        return read_reply(response)


def admin_from_settings(
    settings: Settings, transport: httpx.AsyncBaseTransport | None = None
) -> SupabaseAdmin:
    """Make the admin client from the settings. This is the only place the secret key is read."""
    secret_key = settings.supabase_secret_key.get_secret_value()
    return SupabaseAdmin(settings.supabase_url, secret_key, transport)


def get_admin(request: Request) -> SupabaseAdmin:
    """FastAPI dependency: the admin client that create_app() stored on the app."""
    return request.app.state.admin


# Write `admin: AdminDep` in a route and FastAPI hands you the admin client.
AdminDep = Annotated[SupabaseAdmin, Depends(get_admin)]
