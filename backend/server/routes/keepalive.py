"""Keep-alive route: GET /api/keepalive stops the free Supabase project from pausing.

Why it exists: a free Supabase project pauses itself after 7 days with little activity, and
waking it up takes minutes. Once a day this route reads one row from each of three tables
(profiles, wallet_reasons and crews). That counts as real activity, so the project stays awake.

Who calls it: one trusted caller, with GET, once a day. Which one is still an open decision for
Nils (see docs/ARCHITECTURE.md, "The 7-day pause and the keep-alive"). It is NOT Vercel Cron: a
crons entry in vercel.json broke our deploys on 5 Nov 2026, so never add one while we use Vercel
Services. Nobody else may call it, because the route asks for a secret first.

How the caller proves itself: it sends the header
    Authorization: Bearer <CRON_SECRET>
CRON_SECRET is a server-only setting (see settings.py and .env.example). The Supabase secret key
must also be allowed to read the three tables (see the grants in supabase/migrations).

    GET /api/keepalive
      right secret                    ->  200  {"status": "ok", "reads": 3}
      no header, or a wrong secret    ->  401  unauthorized
      CRON_SECRET, SUPABASE_URL or SUPABASE_SECRET_KEY not set  ->  503  not_configured
      a read fails (database down, table missing, access refused)  ->  503  database_unavailable

An answer never contains a secret or the database's own error text. The details go to the
server log: which table failed, the HTTP status and the database code, never a key.

Try it on your laptop, with the API running and CRON_SECRET set in .env:
    curl -H "Authorization: Bearer <your CRON_SECRET>" http://127.0.0.1:8000/api/keepalive

Used by: the daily keep-alive caller (still to be chosen) and teammates who test it with curl.
"""

import hmac
import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel

from server.auth import unauthorized
from server.errors import ApiError
from server.settings import SettingsDep
from server.supabase_admin import (
    AdminDep,
    SupabaseAdmin,
    SupabaseAdminError,
    SupabaseNotConfigured,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# The three small reads, each as (table, column). One column of one row is enough to count as
# activity. wallet_reasons is keyed by `reason`, the other two tables by `id`.
KEEPALIVE_READS = (
    ("profiles", "id"),
    ("wallet_reasons", "reason"),
    ("crews", "id"),
)


class KeepAliveResponse(BaseModel):
    """What /api/keepalive returns when every read worked. It contains no secrets."""

    status: str
    reads: int  # how many reads worked


def not_configured(message: str) -> ApiError:
    """The 503 for a server that is missing a setting this route needs."""
    return ApiError(503, "not_configured", message)


def check_secret(authorization: str | None, cron_secret: str) -> None:
    """Let the request through only with the keep-alive secret (CRON_SECRET). Raises 503 or 401."""
    if not cron_secret:
        # With no secret set, nobody can prove who they are, so everybody is refused. We never
        # compare against an empty secret, because an empty token would match it.
        logger.warning("Keep-alive refused: CRON_SECRET is not set on this server.")
        raise not_configured("The keep-alive is not set up on this server yet.")

    expected = f"Bearer {cron_secret}".encode()
    sent = (authorization or "").encode()
    # compare_digest takes the same time however much of the secret is right, so nobody can
    # find the secret by timing the answers. It compares bytes, so odd characters cannot crash it.
    if not hmac.compare_digest(sent, expected):
        logger.warning("Keep-alive refused: the secret is missing or wrong.")
        raise unauthorized("The keep-alive secret is missing or wrong.")


async def read_one_row(admin: SupabaseAdmin, table: str, column: str) -> None:
    """Read one column of one row from one table. Any trouble becomes a plain 503."""
    try:
        await admin.select_rows(table, {"select": column, "limit": "1"})
    except SupabaseNotConfigured as error:
        logger.warning("Keep-alive failed: the Supabase address or secret key is not set.")
        raise not_configured("The database is not set up on this server yet.") from error
    except SupabaseAdminError as error:
        # supabase_admin.py has logged the HTTP status and the database code already. The
        # table is the new piece of information.
        logger.warning("Keep-alive read of %s failed.", table)
        message = "The keep-alive could not read the database."
        raise ApiError(503, "database_unavailable", message) from error


@router.get("/keepalive")
async def get_keepalive(
    request: Request, settings: SettingsDep, admin: AdminDep
) -> KeepAliveResponse:
    check_secret(request.headers.get("Authorization"), settings.cron_secret.get_secret_value())
    for table, column in KEEPALIVE_READS:
        await read_one_row(admin, table, column)
    return KeepAliveResponse(status="ok", reads=len(KEEPALIVE_READS))
