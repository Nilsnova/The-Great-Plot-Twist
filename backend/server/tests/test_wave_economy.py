"""Frozen island wave rewards and durable personal completion read contracts.

Used by MP-ECO-03. No test calls a live database or accepts a client-selected reward/account.
"""

import asyncio
from dataclasses import replace
from uuid import UUID

import pytest

from server.errors import ApiError
from server.island.catalogue import load_island
from server.island.wave_economy import (
    freeze_reward_basis,
    personal_completion,
    settlement_parameters,
)

WAVE = str(UUID(int=100))
PLAYER = str(UUID(int=101))
ACCOUNT = str(UUID(int=102))
EPOCH = str(UUID(int=103))


def catalogue():
    return load_island()


def test_low_replayed_wave_uses_played_wave_rates_instead_of_an_island_record():
    rules = catalogue()
    basis = freeze_reward_basis(rules, played_wave=2, seed=42, house_levels=3)
    assert basis.reward_coins([]) == (
        rules.loot.base + rules.loot.per_wave * 2 + rules.loot.per_house * 3
    )
    assert basis.envelope()["playedWave"] == 2
    assert basis.envelope()["houseLevels"] == "3"


def test_house_and_boss_bonuses_are_frozen_and_earned_event_ids_count_once():
    rules = catalogue()
    basis = freeze_reward_basis(rules, played_wave=5, seed=42, house_levels=4)
    expected = (rules.loot.base + rules.loot.per_wave * 5 + rules.loot.per_house * 4)
    expected *= rules.loot.multiplier_for(5)
    assert basis.reward_coins([]) == expected
    assert basis.reward_coins(["finisher", "finisher"]) == basis.reward_coins(["finisher"])
    changed = replace(rules, loot=replace(rules.loot, per_house=rules.loot.per_house + 100))
    assert basis.reward_coins([]) == expected
    assert freeze_reward_basis(changed, played_wave=5, seed=42, house_levels=4) != basis


def test_frozen_basis_uses_late_wave_raise_and_actual_boss_schedule():
    rules = catalogue()
    basis = freeze_reward_basis(rules, played_wave=45, seed=42, house_levels=0)
    assert basis.boss_multiplier == rules.loot.multiplier_for(45)
    assert basis.envelope()["baseCoins"].isdigit()
    assert isinstance(basis.envelope()["perWaveCoins"], str)


@pytest.mark.parametrize("field,value", [
    ("played_wave", True), ("played_wave", 0), ("played_wave", 1.5),
    ("seed", False), ("seed", -1), ("house_levels", True), ("house_levels", -1),
])
def test_frozen_reward_basis_rejects_coercible_or_invalid_server_values(field, value):
    values = {"played_wave": 1, "seed": 42, "house_levels": 0}
    values[field] = value
    with pytest.raises(ApiError) as caught:
        freeze_reward_basis(catalogue(), **values)
    assert caught.value.status_code == 422


def test_an_event_bonus_that_cannot_exist_in_the_frozen_attempt_is_refused():
    basis = freeze_reward_basis(catalogue(), played_wave=1, seed=42, house_levels=0)
    with pytest.raises(ApiError):
        basis.reward_coins(["galleon"])


def test_canonical_settlement_intent_never_contains_actor_account_amount_or_click_uid():
    assert settlement_parameters(WAVE, "won", ["finisher", "finisher"]) == {
        "p_wave_id": WAVE, "p_outcome": "won", "p_earned_bonuses": ["finisher"],
    }
    for outcome in ("lost", "abandoned", "expired"):
        assert settlement_parameters(WAVE, outcome, [])["p_earned_bonuses"] == []
        with pytest.raises(ApiError):
            settlement_parameters(WAVE, outcome, ["finisher"])


@pytest.mark.parametrize("outcome", ["rescue_pending", "running", "victory", None, [], {}, False])
def test_unresolved_or_unknown_outcomes_are_not_canonical_settlement_intents(outcome):
    with pytest.raises(ApiError):
        settlement_parameters(WAVE, outcome, [])


def receipt(**changes):
    result = {
        "id": str(UUID(int=104)), "playerId": PLAYER, "waveId": WAVE,
        "playedWave": 5, "outcome": "won", "confirmedParticipation": True,
        "engineerCommitmentId": None, "accountId": ACCOUNT, "runEpoch": EPOCH,
        "terminalFingerprint": {"waveId": WAVE, "outcome": "won"},
    }
    result.update(changes)
    return result


class ReadAdmin:
    def __init__(self, value):
        self.value = value
        self.calls = []

    async def call_function(self, name, parameters):
        self.calls.append((name, parameters))
        return self.value


def test_personal_completion_read_needs_no_current_island_context_or_financial_write():
    admin = ReadAdmin({"status": "done", "receipt": receipt()})
    result = asyncio.run(personal_completion(admin, PLAYER, WAVE))
    assert result.player_id == PLAYER
    assert result.wave_id == WAVE
    assert result.confirmed_participation is True
    assert admin.calls == [("island_wave_completion_receipt", {
        "p_player_id": PLAYER, "p_wave_id": WAVE,
    })]


@pytest.mark.parametrize("change", [
    {"playerId": str(UUID(int=500))}, {"waveId": str(UUID(int=501))},
    {"confirmedParticipation": "true"}, {"playedWave": True},
    {"outcome": "running"}, {"engineerCommitmentId": "latest"},
    {"terminalFingerprint": {"waveId": str(UUID(int=600)), "outcome": "won"}},
])
def test_receipt_reader_refuses_cross_identity_or_malformed_history(change):
    admin = ReadAdmin({"status": "done", "receipt": receipt(**change)})
    with pytest.raises(ApiError) as caught:
        asyncio.run(personal_completion(admin, PLAYER, WAVE))
    assert caught.value.status_code == 502


def test_only_the_authenticated_players_own_receipt_can_be_requested():
    admin = ReadAdmin({"status": "refused", "reason": "not_in_wave"})
    with pytest.raises(ApiError) as caught:
        asyncio.run(personal_completion(admin, PLAYER, WAVE))
    assert (caught.value.status_code, caught.value.code) == (403, "not_in_wave")


def test_frozen_exact_coin_strings_do_not_inherit_a_fixed_python_or_wallet_digit_ceiling():
    basis = freeze_reward_basis(catalogue(), played_wave=2, seed=42, house_levels=0)
    large = replace(basis, base_coins=10**5000)
    assert len(large.envelope()["baseCoins"]) == 5001
    assert large.reward_coins([]) > 10**5000
