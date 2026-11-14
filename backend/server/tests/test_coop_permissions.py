"""Co-op permissions and absent members (T37 and T42, proposed decision D043):
backend/server/island/permissions.py and every route that acts on somebody else's island.

The matrix rows of specs/T37-T42-coop-policy.md, one test (or one parametrized case) each:
who may act (host, member, outsider, a member who left), who pays (always the clicker or nobody,
never the host), simultaneous clicks and retries, and the absence rows (wave start without the
host, late entry, reconnect, leaving mid-wave, rewards only for participants).

Nothing here uses the network: the database is a FakeIslandDatabase (island_helpers.py). The
fake answers what the SQL functions answer; the SQL itself is tested in island_sql/.
"""

import asyncio
from dataclasses import replace

import pytest

from server.flags import parse_flags
from server.island import permissions
from server.tests.helpers import assert_error
from server.tests.island_helpers import (
    FINISHED,
    FRIEND_ID,
    GUEST,
    GUEST_ID,
    ISLAND_SETTINGS,
    PLAYER,
    PLAYER_ID,
    STARTED,
    WAVE_ID,
    World,
)

WITH_GUESTS = replace(ISLAND_SETTINGS, flags=parse_flags("islands,demo"))
CODE = "ISLE-K7Q2M"


def game(member: bool = True) -> World:
    """PLAYER hosts ISLE-K7Q2M at wave 9 (research and the wreck are open) with a wall and a
    cannon; the guest is a member unless `member` is False."""
    world = World(settings=WITH_GUESTS)
    world.database.progress.update(wave_best=9)
    world.database.islands["K7Q2M"] = {
        "player_id": PLAYER_ID, "code": "K7Q2M", "wave_best": 9, "flags": 9,
    }  # fmt: skip
    world.database.names.update({PLAYER_ID: "Nils", GUEST_ID: "Ben", FRIEND_ID: "Ana"})
    world.database.buildings[PLAYER_ID] = [
        {"plot": "wall_1", "building_type": "wall"},
        {"plot": "cannon_1", "building_type": "cannon"},
    ]
    world.database.research = [{"branch": "cannon"}]
    if member:
        world.database.games.add(PLAYER_ID, GUEST_ID)
    return world


def leave(world: World) -> None:
    world.database.games.rows[PLAYER_ID][GUEST_ID]["left"] = 99


# Every route that acts on a game's island: (action, method, path, body, database function).
# The database function is None where the route calls none of its own (a visit).
ROUTES = [
    (permissions.BUILD, "POST", "/api/island/build",
     {"spot": "wall_2", "kind": "wall", "actionUid": "click-0001", "code": CODE}, "island_build"),
    (permissions.UPGRADE, "POST", "/api/island/upgrade",
     {"spot": "wall_1", "actionUid": "click-0001", "code": CODE}, "island_upgrade"),
    (permissions.RESEARCH, "POST", "/api/island/research",
     {"branch": "wall", "actionUid": "click-0001", "code": CODE}, "island_research"),
    (permissions.TOWER_SKILL, "POST", "/api/island/tower-skill",
     {"spot": "cannon_1", "spec": "rapid", "code": CODE}, "island_specialise"),
    (permissions.WRECK, "POST", "/api/island/wreck",
     {"amount": 25, "actionUid": "click-0001", "code": CODE}, "island_wreck_repair"),
    (permissions.DEMOLISH, "GET", "/api/island/demolish",
     {"spot": "cannon_1", "code": CODE}, "island_demolish_quote"),
    (permissions.DEMOLISH, "POST", "/api/island/demolish",
     {"spot": "cannon_1", "actionUid": "click-0001", "code": CODE}, "island_demolish"),
    (permissions.ISLAND_VISIT, "GET", f"/api/island/visit/{CODE}", None, None),
    (permissions.WAVE_START, "POST", "/api/waves/start",
     {"where": CODE, "actionUid": "bell-0001"}, "wave_start"),
    (permissions.WAVE_JOIN, "POST", "/api/waves/join", {"waveId": WAVE_ID}, "wave_join"),
    (permissions.WAVE_REVIVE, "POST", "/api/waves/revive",
     {"waveId": WAVE_ID, "fallen": "p-k3x9q2", "downAt": 412, "actionUid": "help-0001"},
     "wave_revive"),
]  # fmt: skip
ROUTE_IDS = [f"{method} {path}" for _, method, path, _, _ in ROUTES]


def call(world: World, method: str, path: str, body: dict | None, headers=GUEST):
    if method == "GET":
        return world.client.get(path, params=body or {}, headers=headers)
    return world.client.post(path, json=body, headers=headers)


# --- the matrix as data (pure) ---


def test_every_action_is_open_to_the_host_and_members_and_closed_to_outsiders():
    for action in permissions.ACTIONS:
        assert permissions.allows(action, permissions.HOST)
        assert permissions.allows(action, permissions.MEMBER)
        assert not permissions.allows(action, permissions.OUTSIDER)


def test_the_role_comes_from_ownership_then_membership():
    assert permissions.role_of("a", "a", is_member=False) == permissions.HOST
    assert permissions.role_of("a", "b", is_member=True) == permissions.MEMBER
    assert permissions.role_of("a", "b", is_member=False) == permissions.OUTSIDER


FUNDING = {
    permissions.ISLAND_VISIT: permissions.FREE,
    permissions.BUILD: permissions.PERSONAL,
    permissions.UPGRADE: permissions.PERSONAL,
    permissions.RESEARCH: permissions.PERSONAL,
    permissions.TOWER_SKILL: permissions.FREE,
    permissions.WRECK: permissions.PERSONAL,
    permissions.DEMOLISH: permissions.REFUND_TO_PAYERS,
    permissions.WAVE_START: permissions.FREE,
    permissions.WAVE_JOIN: permissions.FREE,
    permissions.WAVE_REVIVE: permissions.PERSONAL,
    permissions.REPAIR: permissions.PERSONAL,
    permissions.REBUILD: permissions.PERSONAL,
    permissions.ARSENAL_BUY: permissions.PERSONAL,
    permissions.ARSENAL_WITHDRAW: permissions.FREE,
    permissions.ARSENAL_RETURN: permissions.FREE,
}


def test_the_funding_column_matches_the_spec_matrix():
    assert {action: rule.funding for action, rule in permissions.ACTIONS.items()} == FUNDING


def test_only_research_and_tear_down_are_between_waves_only():
    between = {action for action, rule in permissions.ACTIONS.items() if rule.between_waves}
    assert between == {permissions.RESEARCH, permissions.DEMOLISH}


def test_nobody_but_the_clicker_ever_pays_there_is_no_shared_wallet():
    for action in permissions.ACTIONS:
        assert permissions.payer_of(action, "clicker") in ("clicker", None)
    assert permissions.payer_of(permissions.ARSENAL_BUY, "clicker") == "clicker"
    assert permissions.payer_of(permissions.ARSENAL_WITHDRAW, "clicker") is None
    assert permissions.payer_of(permissions.DEMOLISH, "clicker") is None  # refunds, no charge


def test_an_unknown_action_is_a_programming_error():
    with pytest.raises(ValueError):
        permissions.rule_of("island_launch_rockets")
    with pytest.raises(ValueError):
        asyncio.run(permissions.require_action(None, "a", "a", "island_launch_rockets"))


def test_the_refusal_keeps_the_code_and_names_the_action():
    error = permissions.refusal(permissions.ARSENAL_WITHDRAW)
    assert (error.status_code, error.code) == (403, "not_member")
    assert error.message == (
        "Join this game first to take weapons from this arsenal: open its link or type its code."
    )


# --- the helper other lanes call (the arsenal of T40) ---


def admin_of(world: World):
    return world.app.state.admin


def test_the_arsenal_helper_lets_any_member_withdraw_and_the_buyer_pays():
    world = game()
    admin = admin_of(world)

    take = asyncio.run(
        permissions.require_action(admin, PLAYER_ID, GUEST_ID, permissions.ARSENAL_WITHDRAW)
    )
    buy = asyncio.run(
        permissions.require_action(admin, PLAYER_ID, GUEST_ID, permissions.ARSENAL_BUY)
    )

    assert take == permissions.Permit(permissions.MEMBER, None)
    assert buy == permissions.Permit(permissions.MEMBER, GUEST_ID)


def test_the_helper_never_asks_the_database_about_the_host():
    world = game(member=False)
    before = len(world.database.requests)

    permit = asyncio.run(
        permissions.require_action(
            admin_of(world), PLAYER_ID, PLAYER_ID, permissions.ARSENAL_RETURN
        )
    )

    assert permit == permissions.Permit(permissions.HOST, None)
    assert len(world.database.requests) == before


def test_the_helper_refuses_a_member_who_left():
    world = game()
    leave(world)
    with pytest.raises(Exception) as caught:
        asyncio.run(
            permissions.require_action(
                admin_of(world), PLAYER_ID, GUEST_ID, permissions.ARSENAL_RETURN
            )
        )
    assert getattr(caught.value, "code", None) == "not_member"


# --- every island route: outsider, member who left, member, host ---


@pytest.mark.parametrize(("action", "method", "path", "body", "function"), ROUTES, ids=ROUTE_IDS)
def test_an_outsider_is_refused_with_the_action_named_and_nothing_runs(
    action, method, path, body, function
):
    world = game(member=False)

    response = call(world, method, path, body)

    assert_error(response, 403, "not_member")
    assert response.json()["error"]["message"] == permissions.refusal(action).message
    if function is not None:
        assert world.database.calls(function) == []


@pytest.mark.parametrize(("action", "method", "path", "body", "function"), ROUTES, ids=ROUTE_IDS)
def test_a_member_who_left_is_an_outsider_again(action, method, path, body, function):
    world = game()
    leave(world)

    assert_error(call(world, method, path, body), 403, "not_member")
    if function is not None:
        assert world.database.calls(function) == []


@pytest.mark.parametrize(("action", "method", "path", "body", "function"), ROUTES, ids=ROUTE_IDS)
def test_a_member_may_act_without_the_host_and_acts_as_themselves(
    action, method, path, body, function
):
    # T42: the server never knows who is online, so the host's absence changes nothing.
    world = game()

    response = call(world, method, path, body)

    assert response.status_code == 200, response.json()
    if function is not None:
        (sent,) = world.database.calls(function)
        assert sent["p_player_id"] == GUEST_ID  # the clicker; never the host's wallet


def test_the_host_needs_no_membership_row_on_their_own_island():
    world = game(member=False)
    world.database.games.rows.clear()

    assert world.build(headers=PLAYER, spot="wall_2", kind="wall", code=CODE).status_code == 200
    assert world.start(headers=PLAYER, where=CODE).status_code == 200
    assert world.visit(CODE).status_code == 200


# --- personal versus shared funding ---


def test_a_members_build_is_paid_from_their_own_wallet_not_the_hosts():
    world = game()

    world.build(headers=GUEST, spot="wall_2", kind="wall", code=CODE)

    (sent,) = world.database.calls("island_build")
    assert (sent["p_player_id"], sent["p_island_owner"]) == (GUEST_ID, PLAYER_ID)
    assert world.database.calls("islet_build") == []  # the host's own path is not used


def test_personal_purchases_never_take_a_code_and_stay_personal():
    # Crew, captain levels, skills, roles and weapons are the caller's own: no route takes a code.
    world = game()
    for path, body in (
        ("/api/island/hire", {"crew": "gunner"}),
        ("/api/island/captain", {}),
        ("/api/island/weapon/buy", {"weapon": "pistol"}),
    ):
        assert_error(world.post(path, headers=GUEST, code=CODE, **body), 422, "validation_error")


# --- simultaneous spends and retries ---


def test_two_members_upgrading_one_wall_at_once_pay_once_each_and_the_loser_gets_a_reason():
    world = game()
    world.database.games.add(PLAYER_ID, "99999999-0000-4000-8000-000000000009")

    first = world.post("/api/island/upgrade", headers=GUEST, spot="wall_1", code=CODE)
    # The second click raced the first: the database finds the wall at the top already.
    world.database.paid_replies["island_upgrade"] = {"status": "refused", "reason": "max_level"}
    second = world.post(
        "/api/island/upgrade", headers=PLAYER, spot="wall_1", actionUid="click-0002"
    )

    assert first.status_code == 200
    assert_error(second, 409, "max_level")
    calls = world.database.calls("island_upgrade")
    assert [(c["p_player_id"], c["p_action_uid"]) for c in calls] == [
        (GUEST_ID, "click-0001"),
        (PLAYER_ID, "click-0002"),
    ]


def test_a_retried_click_is_checked_again_but_charged_once():
    world = game()
    world.post("/api/island/upgrade", headers=GUEST, spot="wall_1", code=CODE)
    world.database.ledger_refs.add(("building_purchase", "upgrade:click-0001"))

    again = world.post("/api/island/upgrade", headers=GUEST, spot="wall_1", code=CODE)

    assert again.status_code == 200
    assert len(world.database.calls("island_upgrade")) == 1


def test_a_retry_after_leaving_is_refused_and_the_first_charge_stands():
    world = game()
    first = world.post("/api/island/research", headers=GUEST, branch="wall", code=CODE)
    assert first.status_code == 200
    world.database.ledger_refs.add(("tech_research", "research:click-0001"))
    leave(world)

    again = world.post("/api/island/research", headers=GUEST, branch="wall", code=CODE)

    assert_error(again, 403, "not_member")
    assert len(world.database.calls("island_research")) == 1  # nothing refunded, nothing doubled


def test_two_members_researching_the_same_branch_at_once_the_database_picks_one():
    world = game()
    world.post("/api/island/research", headers=GUEST, branch="wall", code=CODE)
    world.database.paid_replies["island_research"] = {"status": "refused", "reason": "known"}

    raced = world.post("/api/island/research", branch="wall", actionUid="click-0002")

    assert_error(raced, 409, "known")


def test_a_membership_lost_under_the_databases_lock_is_still_refused():
    # The member left between the Python check and the database function: the function says so.
    world = game()
    world.database.paid_replies["island_research"] = {"status": "refused", "reason": "not_member"}

    assert_error(
        world.post("/api/island/research", headers=GUEST, branch="wall", code=CODE),
        403,
        "not_member",
    )


# --- T42: absent members and continued play ---


def test_a_member_rings_the_bell_without_the_host_and_without_a_full_crew():
    world = game()

    response = world.start(headers=GUEST, where=CODE)

    assert response.status_code == 200
    (sent,) = world.database.calls("wave_start")
    assert (sent["p_player_id"], sent["p_island_owner"]) == (GUEST_ID, PLAYER_ID)


def test_a_late_member_joins_while_the_wave_runs_and_not_after_the_first_finish():
    world = game()
    assert world.join(headers=GUEST).status_code == 200

    world.database.join_reply = {"status": "refused", "reason": "wave_over"}
    assert_error(world.join(headers=GUEST), 409, "wave_over")


def test_a_dropped_participant_reconnects_to_the_same_wave():
    world = game()
    world.database.join_reply = {**STARTED, "status": "joined", "repeat": True}

    first = world.join(headers=GUEST).json()
    again = world.join(headers=GUEST).json()

    assert first == again
    assert again["waveId"] == WAVE_ID


def test_a_participant_who_left_the_game_mid_wave_still_finishes_their_own_fight():
    # Their loot is for the fight they fought; they cannot rejoin or help a captain up any more.
    world = game()
    world.join(headers=GUEST)
    leave(world)

    assert world.finish(headers=GUEST).status_code == 200
    assert_error(world.join(headers=GUEST), 403, "not_member")
    assert_error(world.revive(headers=GUEST), 403, "not_member")


def test_membership_alone_earns_nothing_only_a_participant_finishes():
    world = game()
    world.database.finish_reply = {"status": "refused", "reason": "not_in_wave"}

    assert_error(world.finish(headers=GUEST), 403, "not_in_wave")


def test_each_finish_pays_only_the_caller():
    world = game()

    world.finish(headers=GUEST)

    (sent,) = world.database.calls("wave_finish")
    assert sent["p_player_id"] == GUEST_ID


def test_a_wave_nobody_finished_pays_nothing_once_it_expired():
    world = game()
    world.database.finish_reply = {**FINISHED, "loot": 0, "survived": False, "expired": True}

    assert world.finish(headers=GUEST).json()["loot"] == 0
