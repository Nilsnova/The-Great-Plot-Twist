"""Sign-in code exchange: swaps the one-time code from the GitHub sign-in for a login token.

Why it exists: the sign-in check page uses the PKCE flow of Supabase. After GitHub, Supabase
sends the browser back with a one-time CODE in the address (...?code=...), not with tokens. The
code is useless alone: it works once, for 5 minutes, and only together with a secret that the
page made before it left and kept in its own tab. Somebody has to swap code and secret for a
token. This server does it, for two reasons:
  * The browser never sees the refresh token (it never expires on the free plan) or GitHub's own
    token. It only gets the access token, which stops working after about an hour.
  * The page can stay locked to its own address (its Content-Security-Policy allows no other
    site) and needs no key.

What it asks Supabase:
    POST {SUPABASE_URL}/auth/v1/token?grant_type=pkce
    header  apikey: <the publishable key>
    body    {"auth_code": <the code>, "code_verifier": <the secret>}

    Supabase says the code does not work  ->  401 unauthorized
    SUPABASE_URL or the publishable key is missing  ->  503 auth_not_configured
    Supabase cannot be reached or answers strangely  ->  503 auth_unavailable

Supabase counts requests per address. Our server calls it from Vercel's addresses, so sign-ins
through this file share one budget. That is fine for a team check page. The game's own sign-in
(package A2) runs in the browser instead, so every player has their own address.

The code, the secret and the tokens never go into a log line or an error message. Log lines
carry only the HTTP status or the kind of network error.

Used by: routes/auth_exchange.py.
"""

import logging
from typing import Annotated

import httpx
from fastapi import Depends, Request

from server.auth import auth_unavailable, unauthorized
from server.errors import ApiError
from server.settings import Settings

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 5.0

# Supabase answers with one of these when the code is the problem: it never existed, it was
# used before, it is older than 5 minutes, or the secret does not fit it.
CODE_REFUSED_STATUSES = (400, 401, 403, 404, 410, 422)


def access_token_from_response(response: httpx.Response) -> str:
    """Take the access token out of Supabase's answer. Raises 401 or 503 if there is none."""
    if response.status_code in CODE_REFUSED_STATUSES:
        # The status only, never the code or the secret. A warning (not info) so it shows in
        # production logs.
        logger.warning("Supabase refused a sign-in code: HTTP %s", response.status_code)
        raise unauthorized("This sign-in code does not work any more. Please sign in again.")
    if not response.is_success:
        logger.warning("Supabase code exchange answered HTTP %s", response.status_code)
        raise auth_unavailable()

    try:
        session = response.json()
    except ValueError as error:
        raise auth_unavailable() from error
    token = session.get("access_token") if isinstance(session, dict) else None
    if not isinstance(token, str) or not token:
        raise auth_unavailable()
    # The session also holds a refresh token and GitHub's own token. They stop here.
    return token


class CodeExchanger:
    """Swaps a one-time sign-in code for an access token by asking Supabase.

    `transport` can be replaced in tests: a fake transport answers without any network.
    create_app() makes one and stores it.
    """

    def __init__(
        self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self.settings = settings
        self.transport = transport

    async def exchange(self, code: str, code_verifier: str) -> str:
        """Return the access token for this code and secret, or raise an ApiError."""
        self.check_configured()
        url = f"{self.settings.supabase_url}/auth/v1/token"
        headers = {"apikey": self.settings.supabase_publishable_key}
        body = {"auth_code": code, "code_verifier": code_verifier}
        try:
            async with httpx.AsyncClient(
                transport=self.transport, timeout=TIMEOUT_SECONDS
            ) as client:
                response = await client.post(
                    url, params={"grant_type": "pkce"}, headers=headers, json=body
                )
        except (httpx.RequestError, httpx.InvalidURL) as error:
            # Log only the kind of error. Never the code, the secret or the error text.
            logger.warning("Supabase code exchange failed: %s", type(error).__name__)
            raise auth_unavailable() from error
        return access_token_from_response(response)

    def check_configured(self) -> None:
        """Stop before any network call if the address or the publishable key is missing."""
        if not self.settings.supabase_url or not self.settings.supabase_publishable_key:
            raise ApiError(503, "auth_not_configured", "Login is not set up on this server yet.")


def get_exchanger(request: Request) -> CodeExchanger:
    """FastAPI dependency: the exchanger that create_app() stored on the app."""
    return request.app.state.exchanger


# Write `exchanger: ExchangerDep` in a route and FastAPI hands you the exchanger.
ExchangerDep = Annotated[CodeExchanger, Depends(get_exchanger)]
