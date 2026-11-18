"""Strict lifecycle guard adapter checks; HTTP authentication is owned by the app."""

from uuid import uuid4

import pytest

from server.errors import ApiError
from server.island import shared_lifecycle
from server.supabase_admin import SupabaseRejected


class GuardDatabase:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    async def call_function(self, name, arguments):
        self.calls.append((name, arguments))
        return self.reply


@pytest.mark.anyio
async def test_active_guard_uses_authenticated_actor_only():
    actor = str(uuid4())
    admin = GuardDatabase({"status": "active"})
    await shared_lifecycle.ensure_not_deleted(admin, actor)
    assert admin.calls == [("island_lifecycle_actor_status", {"p_player_id": actor})]


@pytest.mark.anyio
async def test_deleted_identity_refuses_even_if_an_auth_cache_still_contains_it():
    with pytest.raises(ApiError) as error:
        await shared_lifecycle.ensure_not_deleted(
            GuardDatabase({"status": "deleted"}), str(uuid4())
        )
    assert error.value.status_code == 401
    assert error.value.code == "unauthorized"


@pytest.mark.anyio
@pytest.mark.parametrize(
    "reply", [None, {}, {"status": "unknown"}, {"status": "active", "extra": 1}]
)
async def test_unreadable_guard_never_restores_access(reply):
    with pytest.raises(SupabaseRejected):
        await shared_lifecycle.ensure_not_deleted(GuardDatabase(reply), str(uuid4()))
