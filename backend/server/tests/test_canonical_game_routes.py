"""Membership HTTP preserves canonical roles and denies cached deleted identities."""

import asyncio
from copy import deepcopy

import pytest

from server.island import games
from server.supabase_admin import CaptainNotInitialized, SupabaseRejected
from server.tests.helpers import assert_error
from server.tests.island_helpers import PLAYER, PLAYER_ID, World
from server.tests.test_personal_captain import reply as captain_reply

OTHER = "99999999-9999-4999-8999-999999999999"


class RoleDatabase:
    def __init__(self, contexts):
        self.contexts, self.calls, self.legacy_reads = contexts, [], []

    async def call_function(self, name, arguments):
        self.calls.append((name, arguments))
        assert name == "personal_captain_context"
        return deepcopy(self.contexts[arguments["p_player_id"]])

    async def select_rows(self, table, query):
        self.legacy_reads.append((table, query))
        assert table == "islands" and query["player_id"] == f"in.({OTHER})"
        return [{"player_id": OTHER, "captain_role": "gunner"}]


def test_lobby_uses_global_managed_role_and_legacy_role_only_for_unadopted_captain():
    admin = RoleDatabase({PLAYER_ID: captain_reply(), OTHER: {"status": "legacy"}})
    assert asyncio.run(games.captain_roles(admin, [PLAYER_ID, OTHER])) == {
        PLAYER_ID: "medic", OTHER: "gunner",
    }
    assert len(admin.legacy_reads) == 1


def test_managed_role_none_clears_stale_legacy_role_without_a_legacy_read():
    profile = captain_reply()
    profile["captain"]["role"] = profile["skills"]["role"] = None
    admin = RoleDatabase({PLAYER_ID: profile})
    assert asyncio.run(games.captain_roles(admin, [PLAYER_ID])) == {}
    assert admin.legacy_reads == []


class MissingProfileDatabase(RoleDatabase):
    async def call_function(self, name, arguments):
        if arguments["p_player_id"] == OTHER:
            self.calls.append((name, arguments))
            raise CaptainNotInitialized()
        return await super().call_function(name, arguments)


def test_member_without_a_profile_shows_no_role_instead_of_failing_the_lobby():
    admin = MissingProfileDatabase({PLAYER_ID: captain_reply()})
    assert asyncio.run(games.captain_roles(admin, [PLAYER_ID, OTHER])) == {PLAYER_ID: "medic"}
    assert admin.legacy_reads == []


def test_unreadable_personal_context_cannot_show_a_stale_legacy_role():
    admin = RoleDatabase({PLAYER_ID: {"status": "not_understood"}})
    with pytest.raises(SupabaseRejected):
        asyncio.run(games.captain_roles(admin, [PLAYER_ID]))
    assert admin.legacy_reads == []


@pytest.mark.parametrize("method,path,body", [
    ("POST", "/api/games", {}),
    ("POST", "/api/games/join", {"code": "K7Q2M", "actionUid": "join-0001"}),
    ("POST", "/api/island/invite/join", {"code": "K7Q2M", "actionUid": "join-0001"}),
    ("GET", "/api/games", None),
    ("GET", "/api/games/K7Q2M", None),
    ("POST", "/api/games/leave", {"code": "K7Q2M"}),
])
def test_cached_deleted_identity_cannot_initialize_join_or_read_memberships(method, path, body):
    world = World()
    world.database.deleted_players.add(PLAYER_ID)
    response = world.client.request(method, path, headers=PLAYER, **(
        {"json": body} if body is not None else {}
    ))
    assert_error(response, 401, "unauthorized")
    assert world.database.paths() == ["POST /rpc/island_lifecycle_actor_status"]


@pytest.mark.parametrize("reason,status,code", [
    ("actor_inactive", 401, "unauthorized"),
    ("path_unavailable", 409, "economy_path_unavailable"),
    ("lifecycle_busy", 503, "lifecycle_busy"),
])
def test_membership_sql_lifecycle_refusals_keep_stable_http_codes(reason, status, code):
    error = games.lifecycle_refusal(reason)
    assert (error.status_code, error.code) == (status, code)
