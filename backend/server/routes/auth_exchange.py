"""Exchange route: POST /api/auth/exchange swaps a one-time sign-in code for a login token.

Why it exists: the sign-in check page signs in with the PKCE flow. Supabase sends the browser
back to the page with a one-time code in the address, not with tokens, so nothing that lasts
ever lands in the browser history. The page gives the code, and the secret it made before it
left for GitHub, to this route. The route swaps them with Supabase (see sign_in_code.py) and
answers with the access token. The page then calls GET /api/me with it.

    POST /api/auth/exchange
    {"code": "<the one-time code from the address>", "codeVerifier": "<the secret from the tab>"}
      200  {"accessToken": "<login token>"}   with Cache-Control: private, no-store
      401  unauthorized          Supabase refused the code: used before, older than 5 minutes,
                                 unknown, or the secret does not fit it
      422  validation_error      a field is missing, not text or the wrong length
      503  auth_not_configured, auth_unavailable     Supabase is not set up or cannot be reached

Who may call it: anyone. Nobody has to be signed in, because this is how somebody signs in. The
proof is the pair of code and secret: the code alone is useless, and so is the secret alone.

What it never does: it never answers with the refresh token, with GitHub's own token or with
anything about the player. Those stop inside the server. The answer holds a login token, so it
carries `Cache-Control: private, no-store`: the hosting network and proxies must not keep a copy.

Temporary on purpose: this route exists for the check page. The game's own sign-in (package A2)
runs in the browser with Supabase's client library, which does the same exchange itself. Remove
this route together with the check page when A2 has shipped.

Used by: the sign-in check page (frontend/public/auth-check.html).
"""

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field

from server.sign_in_code import ExchangerDep

router = APIRouter()

# Supabase's one-time codes are UUIDs (36 characters). Anything much longer is not one.
MAX_CODE_LENGTH = 200

# The PKCE standard (RFC 7636) asks for a secret of 43 to 128 characters.
MIN_VERIFIER_LENGTH = 43
MAX_VERIFIER_LENGTH = 128


class ExchangeRequest(BaseModel):
    """What the page sends. The field names are the exact JSON keys the page uses."""

    code: str = Field(min_length=1, max_length=MAX_CODE_LENGTH)
    codeVerifier: str = Field(  # camelCase on purpose, like the other JSON keys
        min_length=MIN_VERIFIER_LENGTH, max_length=MAX_VERIFIER_LENGTH
    )


class ExchangeResponse(BaseModel):
    """What the route returns: the access token and nothing else."""

    accessToken: str  # camelCase on purpose: this is the exact JSON key the page reads


@router.post("/auth/exchange")
async def post_exchange(
    body: ExchangeRequest, exchanger: ExchangerDep, response: Response
) -> ExchangeResponse:
    # A login token: tell the hosting network and proxies not to keep a copy of the answer.
    response.headers["Cache-Control"] = "private, no-store"
    token = await exchanger.exchange(body.code, body.codeVerifier)
    return ExchangeResponse(accessToken=token)
