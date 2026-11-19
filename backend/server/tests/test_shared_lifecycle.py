"""Strict lifecycle guard adapter checks; HTTP authentication is owned by the app."""

from uuid import uuid4

import pytest

from server.errors import ApiError
from server.island import shared_lifecycle
from server.supabase_admin import SupabaseRejected
from server.tests.test_island_lifecycle import OLD_EPOCH, OWNER, UID, result


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


@pytest.mark.anyio
@pytest.mark.parametrize("status", ["deleted", "not_found"])
async def test_atomic_delete_sends_only_verified_actor_and_explicit_confirmation(status):
    admin = GuardDatabase({"status": status})
    assert await shared_lifecycle.delete_player(admin, OWNER, True) == status
    assert admin.calls == [
        (
            "island_lifecycle_delete_player",
            {"p_actor_id": OWNER, "p_confirm_owned_island": True},
        )
    ]


@pytest.mark.anyio
async def test_owned_island_deletion_requires_the_separate_confirmation():
    admin = GuardDatabase({"status": "refused", "reason": "owned_island_confirmation_required"})
    with pytest.raises(ApiError) as error:
        await shared_lifecycle.delete_player(admin, OWNER)
    assert error.value.status_code == 409
    assert error.value.code == "owned_island_confirmation_required"


@pytest.mark.anyio
async def test_reset_keeps_old_receipt_origin_and_never_publishes_new_account_as_current():
    from server.island.catalogue import load_island

    reply = result()
    reply["currentEconomy"] = None
    reply["receipt"]["result"]["grantPolicyVersion"] = "catalogue-starting-coins-v1"
    admin = GuardDatabase(reply)
    parsed = await shared_lifecycle.reset_island(
        admin, load_island(), OWNER, OWNER, OLD_EPOCH, UID, "ISLE-K7Q2M"
    )
    assert parsed["receipt"] == reply["receipt"]
    assert parsed["currentEconomy"] is None
    name, arguments = admin.calls[0]
    assert name == "island_lifecycle_reset"
    assert arguments["p_confirm_code"] == "K7Q2M"
    assert arguments["p_starting_coins"] == load_island().starting_coins
    assert arguments["p_grant_policy_version"] == "catalogue-starting-coins-v1"
    assert "p_account_id" not in arguments


@pytest.mark.anyio
async def test_reset_refuses_a_reply_with_an_unrelated_original_epoch():
    from server.island.catalogue import load_island

    reply = result()
    reply["currentEconomy"] = None
    reply["receipt"]["origin"]["runEpoch"] = str(uuid4())
    with pytest.raises(SupabaseRejected):
        await shared_lifecycle.reset_island(
            GuardDatabase(reply), load_island(), OWNER, OWNER, OLD_EPOCH, UID, "K7Q2M"
        )


@pytest.mark.anyio
async def test_reset_does_not_accept_replacement_money_under_the_old_origin():
    from server.island.catalogue import load_island

    with pytest.raises(SupabaseRejected):
        await shared_lifecycle.reset_island(
            GuardDatabase(result()), load_island(), OWNER, OWNER, OLD_EPOCH, UID, "K7Q2M"
        )
