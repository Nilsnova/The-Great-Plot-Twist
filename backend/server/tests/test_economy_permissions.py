"""Shared-economy rights and phase boundaries, separate from the unchanged legacy policy.

Used by: MP-ECO-08; authority/context fakes never access a live database.
"""

import asyncio
from dataclasses import replace
from types import SimpleNamespace

import pytest

from server.errors import ApiError
from server.island import economy_permissions as policy

OWNER = "00000000-0000-4000-8000-000000000001"
MEMBER = "00000000-0000-4000-8000-000000000002"
OTHER = "00000000-0000-4000-8000-000000000003"
WAVE = "00000000-0000-4000-8000-000000000010"
OTHER_WAVE = "00000000-0000-4000-8000-000000000011"
EPOCH = "00000000-0000-4000-8000-000000000020"
ACCOUNT = "00000000-0000-4000-8000-000000000030"


def authority(**changes):
    return replace(policy.EconomyAuthority(MEMBER, OWNER, True, None, MEMBER, None), **changes)


def assert_refused(state, action, status, code):
    with pytest.raises(ApiError) as caught:
        policy.authorize_economy_action(state, action)
    assert (caught.value.status_code, caught.value.code) == (status, code)


@pytest.mark.parametrize("action", [
    "island_build", "island_upgrade", "island_research", "island_research_change",
    "island_tower_skill", "island_tower_tree", "island_hire", "island_wreck",
    "arsenal_buy", "island_demolish",
])
def test_invited_member_spends_and_demolishes_without_owner_approval(action):
    decision = policy.authorize_economy_action(authority(session_leader_id=OWNER), action)
    assert decision.role == "member"
    assert decision.funding == "island_treasury"
    assert decision.required_phase == "between_reservations"
    assert not decision.is_session_leader


@pytest.mark.parametrize("reservation_id", [None, WAVE])
def test_betting_has_member_rights_in_either_phase_without_a_policy_stake_cap(reservation_id):
    decision = policy.authorize_economy_action(
        authority(reservation_id=reservation_id, session_leader_id=OWNER), "island_bet"
    )
    assert decision.funding == "island_treasury"
    assert decision.required_phase == "any"


@pytest.mark.parametrize("action", ["island_reset", "island_delete"])
def test_leading_a_session_never_grants_a_member_reset_or_delete(action):
    assert_refused(authority(), action, 403, "not_owner")
    host = authority(actor_id=OWNER, is_member=False, session_leader_id=MEMBER)
    decision = policy.authorize_economy_action(host, action)
    assert decision.role == "host"
    assert not decision.is_session_leader


@pytest.mark.parametrize("action", ["wave_start", "wave_pause", "wave_auto_next"])
def test_session_controls_require_the_server_leader_even_for_the_owner(action):
    host = authority(actor_id=OWNER, session_leader_id=MEMBER)
    assert_refused(host, action, 403, "not_session_leader")
    assert policy.authorize_economy_action(authority(), action).is_session_leader


@pytest.mark.parametrize("action", [
    "island_build", "island_upgrade", "island_research_change", "island_hire",
    "island_move", "island_demolish", "island_wreck", "arsenal_buy", "arsenal_withdraw",
    "arsenal_swap", "arsenal_return",
    "island_reset", "island_delete", "wave_start", "wave_pause",
])
def test_accepted_bell_blocks_permanent_changes_and_break_controls_even_for_owner(action):
    host = authority(actor_id=OWNER, session_leader_id=OWNER, reservation_id=WAVE)
    assert_refused(host, action, 409, "wave_running")


def test_paid_combat_repair_uses_island_money_but_has_no_between_wave_bill():
    assert_refused(authority(), "structure_repair", 409, "wave_not_running")
    decision = policy.authorize_economy_action(
        authority(reservation_id=WAVE), "structure_repair"
    )
    assert decision.funding == "island_treasury"


@pytest.mark.parametrize("action", ["combat_input", "wave_revive"])
def test_combat_and_free_revive_need_the_current_assignment_not_merely_membership(action):
    assert_refused(authority(), action, 409, "wave_not_running")
    for assignment in (None, OTHER_WAVE):
        assert_refused(
            authority(reservation_id=WAVE, actor_assignment_wave_id=assignment),
            action, 403, "not_in_wave",
        )
    decision = policy.authorize_economy_action(
        authority(reservation_id=WAVE, actor_assignment_wave_id=WAVE), action
    )
    assert decision.funding == "none"


@pytest.mark.parametrize("action", ["captain_role", "captain_skill", "captain_respec"])
def test_free_personal_reassignment_cannot_escape_a_combat_assignment_on_another_island(action):
    assert_refused(
        authority(actor_assignment_wave_id=OTHER_WAVE), action, 409, "captain_assigned"
    )
    assert policy.authorize_economy_action(authority(), action).funding == "none"


@pytest.mark.parametrize("action", ["captain_role", "captain_skill", "captain_respec"])
def test_unassigned_spectator_can_prepare_a_personal_profile_for_a_future_wave(action):
    decision = policy.authorize_economy_action(authority(reservation_id=WAVE), action)
    assert decision.required_phase == "any"
    assert decision.funding == "none"


@pytest.mark.parametrize("resulting_role", [None, "medic", "gunner"])
def test_pending_engineer_commitment_blocks_other_roles_and_role_clearing(resulting_role):
    with pytest.raises(ApiError) as caught:
        policy.require_captain_role_binding(
            engineer_commitment_id=EPOCH, resulting_role=resulting_role,
        )
    assert (caught.value.status_code, caught.value.code) == (409, "engineer_bound")


def test_engineer_binding_allows_skill_reassignment_that_keeps_engineer():
    policy.require_captain_role_binding(engineer_commitment_id=EPOCH, resulting_role="engineer")
    policy.require_captain_role_binding(engineer_commitment_id=None, resulting_role="medic")
    policy.require_captain_role_binding(engineer_commitment_id=None, resulting_role=None)


@pytest.mark.parametrize("action", [
    "island_bet", "island_research_change", "island_demolish", "wave_start",
    "island_reset", "island_visit", "wave_revive",
])
def test_departed_or_outsider_leader_cannot_start_a_new_action(action):
    assert_refused(authority(is_member=False), action, 403, "not_member")


@pytest.mark.parametrize("action", ["settlement", "wager_settlement", "refund_as_owner"])
def test_saved_origin_settlement_is_not_a_client_selectable_permission_bypass(action):
    with pytest.raises(ValueError, match="Unknown shared-economy action"):
        policy.authorize_economy_action(authority(is_member=False), action)


def test_reads_and_member_bets_remain_available_during_a_reservation():
    state = authority(reservation_id=WAVE, session_leader_id=OWNER)
    assert policy.authorize_economy_action(state, "island_visit").funding == "none"
    assert policy.authorize_economy_action(state, "island_bet").funding == "island_treasury"


def test_leader_can_change_only_the_future_auto_next_setting_during_combat():
    state = authority(reservation_id=WAVE)
    decision = policy.authorize_economy_action(state, "wave_auto_next")
    assert decision.required_phase == "any"
    assert decision.funding == "none"
    assert_refused(state, "wave_pause", 409, "wave_running")
    assert_refused(
        replace(state, session_leader_id=OWNER), "wave_auto_next", 403, "not_session_leader"
    )


def context(**changes):
    values = dict(mode="island_shared", version=1, actor_id=MEMBER, island_owner=OWNER,
                  account_id=ACCOUNT, run_epoch=EPOCH, revision=7)
    values.update(changes)
    return SimpleNamespace(**values)


class AuthorityAdmin:
    def __init__(self, member=True):
        self.member = member
        self.calls = []

    async def call_function(self, name, arguments):
        self.calls.append((name, arguments))
        return {"actor_id": MEMBER, "island_owner": OWNER, "is_member": self.member,
                "reservation_id": None, "session_leader_id": OWNER,
                "actor_assignment_wave_id": None}


def install_context(monkeypatch, result):
    async def resolve(admin, actor_id, island_owner, *, expected_epoch):
        assert (actor_id, island_owner, expected_epoch) == (MEMBER, OWNER, EPOCH)
        return result
    monkeypatch.setattr(policy, "_resolve_context", resolve)


def test_admission_uses_resolved_treasury_not_the_actor_or_host_wallet(monkeypatch):
    resolved = context()
    install_context(monkeypatch, resolved)
    admin = AuthorityAdmin()
    permit = asyncio.run(policy.require_economy_action(
        admin, MEMBER, OWNER, "island_demolish", expected_epoch=EPOCH,
    ))
    assert permit.context is resolved
    assert permit.context.account_id == ACCOUNT
    assert permit.action == "island_demolish"
    assert permit.role == "member"
    assert permit.funding == "island_treasury"
    assert not permit.is_session_leader
    assert admin.calls == [("island_economy_authority", {
        "p_actor_id": MEMBER, "p_island_owner": OWNER,
    })]


def test_each_new_action_rechecks_membership_including_a_retry_after_departure(monkeypatch):
    install_context(monkeypatch, context())
    admin = AuthorityAdmin()
    asyncio.run(policy.require_economy_action(
        admin, MEMBER, OWNER, "island_bet", expected_epoch=EPOCH,
    ))
    admin.member = False
    with pytest.raises(ApiError, match="Join this game") as caught:
        asyncio.run(policy.require_economy_action(
            admin, MEMBER, OWNER, "island_bet", expected_epoch=EPOCH,
        ))
    assert caught.value.code == "not_member"
    assert len(admin.calls) == 2


@pytest.mark.parametrize("member", [True, False])
def test_read_can_bootstrap_an_epoch_but_still_needs_current_membership(monkeypatch, member):
    resolved = context()

    async def resolve(admin, actor_id, island_owner, *, expected_epoch):
        assert (actor_id, island_owner, expected_epoch) == (MEMBER, OWNER, None)
        return resolved

    monkeypatch.setattr(policy, "_resolve_context", resolve)
    admin = AuthorityAdmin(member=member)
    if member:
        permit = asyncio.run(policy.require_economy_action(admin, MEMBER, OWNER, "island_visit"))
        assert permit.context is resolved
        assert permit.funding == "none"
    else:
        with pytest.raises(ApiError) as caught:
            asyncio.run(policy.require_economy_action(admin, MEMBER, OWNER, "island_visit"))
        assert caught.value.code == "not_member"


@pytest.mark.parametrize("changes, code", [
    ({"mode": "personal_legacy", "account_id": None, "run_epoch": None},
     "economy_context_required"),
    ({"version": 2}, "economy_path_unavailable"),
    ({"actor_id": OTHER}, "economy_path_unavailable"),
    ({"island_owner": OTHER}, "economy_path_unavailable"),
    ({"account_id": None}, "economy_path_unavailable"),
    ({"run_epoch": None}, "economy_path_unavailable"),
    ({"run_epoch": OTHER_WAVE}, "economy_epoch_mismatch"),
])
def test_bad_account_resolution_never_reaches_authority_or_a_personal_fallback(
    monkeypatch, changes, code,
):
    install_context(monkeypatch, context(**changes))
    admin = AuthorityAdmin()
    with pytest.raises(ApiError) as caught:
        asyncio.run(policy.require_economy_action(
            admin, MEMBER, OWNER, "island_build", expected_epoch=EPOCH,
        ))
    assert (caught.value.status_code, caught.value.code) == (409, code)
    assert admin.calls == []


def test_missing_context_and_unknown_actions_do_not_query_any_authority():
    admin = AuthorityAdmin()
    with pytest.raises(ApiError) as caught:
        asyncio.run(policy.require_economy_action(admin, MEMBER, OWNER, "island_bet"))
    assert caught.value.code == "economy_context_required"
    with pytest.raises(ValueError):
        asyncio.run(policy.require_economy_action(
            admin, MEMBER, OWNER, "settlement", expected_epoch=EPOCH,
        ))
    assert admin.calls == []
