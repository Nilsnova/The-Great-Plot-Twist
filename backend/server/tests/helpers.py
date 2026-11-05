"""Small helpers shared by the test files: a fake clock and ready-made settings.

Used by: the other files in backend/server/tests/.
"""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from pydantic import SecretStr

from server.settings import Settings
from server.supabase_admin import SupabaseAdmin

# A fake server is a function. It receives each request and returns (or raises) the answer.
FakeReply = Callable[[httpx.Request], httpx.Response]

# Obviously fake values. They are NOT real keys.
FAKE_URL = "https://fake-project.supabase.co"
FAKE_PUBLISHABLE_KEY = "sb_publishable_not_a_real_key"
FAKE_SECRET_KEY = "sb_secret_not_a_real_key"
FAKE_CRON_SECRET = "cron_not_a_real_secret"

# Settings as they look when Supabase and the cron secret are set up. To change one value in a
# test, use dataclasses.replace(CONFIGURED_SETTINGS, supabase_url="") and so on.
CONFIGURED_SETTINGS = Settings(
    supabase_url=FAKE_URL,
    supabase_publishable_key=FAKE_PUBLISHABLE_KEY,
    supabase_secret_key=SecretStr(FAKE_SECRET_KEY),
    cron_secret=SecretStr(FAKE_CRON_SECRET),
)


class FakeClock:
    """A clock that only moves when the test says so."""

    def __init__(self) -> None:
        self.now = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += timedelta(seconds=seconds)


def make_admin(
    reply: FakeReply, base_url: str = FAKE_URL, secret_key: str = FAKE_SECRET_KEY
) -> tuple[SupabaseAdmin, list[httpx.Request]]:
    """A SupabaseAdmin that talks to a fake database instead of the network.

    `reply` gets each request and returns (or raises) the pretend answer. Returns the admin
    and a list that collects every request the admin sent.
    """
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return reply(request)

    return SupabaseAdmin(base_url, secret_key, httpx.MockTransport(handler)), seen


def fail_with(error_class: type[httpx.RequestError]) -> FakeReply:
    """A fake-database reply that raises a network error."""

    def reply(request: httpx.Request) -> httpx.Response:
        raise error_class("pretend network failure", request=request)

    return reply


def assert_error(response: Any, status_code: int, code: str) -> None:
    """Check that a response has the standard error shape with this status and code."""
    assert response.status_code == status_code
    body = response.json()
    assert list(body) == ["error"]
    assert list(body["error"]) == ["code", "message"]
    assert body["error"]["code"] == code
    assert body["error"]["message"]
