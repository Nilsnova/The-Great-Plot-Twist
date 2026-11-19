"""Immutable wave reward basis and personal completion values for shared accounting.

Used by wave_economy.py and later accepted-bell/canonical-finish integrations.
"""

from dataclasses import dataclass
from typing import Literal

from server.errors import ApiError
from server.island.treasury_models import decimal_string

WaveOutcome = Literal["won", "lost", "abandoned", "expired"]


@dataclass(frozen=True)
class WaveRewardBasis:
    """Server catalogue values captured once for the actual played wave and defenses."""

    played_wave: int
    base_coins: int
    per_wave_coins: int
    per_house_coins: int
    house_levels: int
    boss_multiplier: int
    bonuses: tuple[tuple[str, int], ...]

    def envelope(self) -> dict:
        return {
            "playedWave": self.played_wave,
            "baseCoins": decimal_string(self.base_coins),
            "perWaveCoins": decimal_string(self.per_wave_coins),
            "perHouseCoins": decimal_string(self.per_house_coins),
            "houseLevels": decimal_string(self.house_levels),
            "bossMultiplier": decimal_string(self.boss_multiplier),
            "bonuses": {key: decimal_string(value) for key, value in self.bonuses},
        }

    def reward_coins(self, earned_bonuses: list[str]) -> int:
        prices = dict(self.bonuses)
        if not isinstance(earned_bonuses, list) or any(
            not isinstance(name, str) or name not in prices for name in earned_bonuses
        ):
            raise ApiError(422, "invalid_wave_reward", "A bonus is outside the frozen wave basis.")
        earned = set(earned_bonuses)
        base = self.base_coins + self.per_wave_coins * self.played_wave
        houses = self.per_house_coins * self.house_levels
        return (base + houses + sum(prices[name] for name in earned)) * self.boss_multiplier


@dataclass(frozen=True)
class PersonalCompletionReceipt:
    """Canonical historical facts, never a new treasury credit or current Engineer identity."""

    id: str
    player_id: str
    wave_id: str
    played_wave: int
    outcome: WaveOutcome
    confirmed_participation: bool
    engineer_commitment_id: str | None
    account_id: str
    run_epoch: str
    terminal_fingerprint: dict
