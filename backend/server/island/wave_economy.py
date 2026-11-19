"""Frozen shared-wave reward calculation and checked personal completion reads (MP-ECO-03).

Used by later bell/finish integrations. Private SQL settlement helpers must be invoked inside
their canonical lifecycle transaction, never as a separate participant acknowledgment call.
"""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, ValidationError

from server.errors import ApiError
from server.island import rules, wave_events
from server.island.catalogue import IslandCatalogue
from server.island.wave_economy_models import PersonalCompletionReceipt, WaveRewardBasis
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

OUTCOMES = frozenset({"won", "lost", "abandoned", "expired"})


def invalid_reward() -> ApiError:
    return ApiError(422, "invalid_wave_reward", "The frozen wave reward inputs are not valid.")


def _whole(value: int, *, minimum: int = 0) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise invalid_reward()


def normalized_bonuses(earned_bonuses: list[str]) -> list[str]:
    if not isinstance(earned_bonuses, list) or any(
        not isinstance(name, str) or name not in wave_events.BONUS_KINDS
        for name in earned_bonuses
    ):
        raise invalid_reward()
    return sorted(set(earned_bonuses))


def freeze_reward_basis(
    catalogue: IslandCatalogue, *, played_wave: int, seed: int, house_levels: int,
) -> WaveRewardBasis:
    """Use the played wave, its allowed events and its own frozen houses; never an island record."""
    _whole(played_wave, minimum=1)
    _whole(seed)
    _whole(house_levels)
    if played_wave > catalogue.waves.highest_wave:
        raise invalid_reward()
    base, per_wave, per_house = rules.island_loot_rates(catalogue.loot, played_wave)
    allowed = wave_events.allowed_bonuses(
        list(wave_events.BONUS_KINDS), place="island", wave=played_wave, seed=seed,
        boss_every=catalogue.waves.boss_every,
    )
    multiplier = catalogue.loot.multiplier_for(played_wave) if rules.is_boss(
        catalogue, played_wave
    ) else 1
    bonuses = tuple((name, wave_events.bonus_base([name], played_wave)) for name in allowed)
    return WaveRewardBasis(
        played_wave, base, per_wave, per_house, house_levels, multiplier, bonuses,
    )


def _identifier(value: str) -> str:
    if not isinstance(value, str):
        raise invalid_reward()
    try:
        return str(UUID(value))
    except ValueError as error:
        raise invalid_reward() from error


def settlement_parameters(wave_id: str, outcome: str, earned_bonuses: list[str]) -> dict:
    """Build only a canonical domain intent; no client actor, payer, amount or payment UID."""
    if not isinstance(outcome, str) or outcome not in OUTCOMES:
        raise invalid_reward()
    earned = normalized_bonuses(earned_bonuses)
    if outcome != "won" and earned:
        raise invalid_reward()
    return {"p_wave_id": _identifier(wave_id), "p_outcome": outcome, "p_earned_bonuses": earned}


class _CompletionRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    playerId: UUID
    waveId: UUID
    playedWave: StrictInt = Field(ge=1)
    outcome: Literal["won", "lost", "abandoned", "expired"]
    confirmedParticipation: StrictBool
    engineerCommitmentId: UUID | None
    accountId: UUID
    runEpoch: UUID
    terminalFingerprint: dict


def _read_receipt(value: object, player_id: str, wave_id: str) -> PersonalCompletionReceipt:
    try:
        row = _CompletionRow.model_validate(value)
        if str(row.playerId) != player_id or str(row.waveId) != wave_id:
            raise ValueError("Receipt identity differs.")
        if (row.terminalFingerprint.get("waveId") != wave_id
                or row.terminalFingerprint.get("outcome") != row.outcome):
            raise ValueError("Receipt fingerprint differs.")
        return PersonalCompletionReceipt(
            str(row.id), str(row.playerId), str(row.waveId), row.playedWave, row.outcome,
            row.confirmedParticipation,
            str(row.engineerCommitmentId) if row.engineerCommitmentId else None,
            str(row.accountId), str(row.runEpoch), row.terminalFingerprint,
        )
    except (ValidationError, ValueError) as error:
        raise SupabaseRejected(
            "The database sent an unreadable wave completion receipt."
        ) from error


async def personal_completion(
    admin: SupabaseAdmin, player_id: str, wave_id: str,
) -> PersonalCompletionReceipt:
    """Read this authenticated player's historical receipt without membership or money mutation."""
    player_id, wave_id = _identifier(player_id), _identifier(wave_id)
    reply = await admin.call_function("island_wave_completion_receipt", {
        "p_player_id": player_id, "p_wave_id": wave_id,
    })
    if not isinstance(reply, dict):
        raise SupabaseRejected("The database sent an unreadable wave completion answer.")
    if reply.get("status") == "refused" and reply.get("reason") == "not_in_wave":
        raise ApiError(403, "not_in_wave", "This Captain has no completion receipt for that wave.")
    if reply.get("status") != "done":
        raise SupabaseRejected("The database sent an unreadable wave completion answer.")
    return _read_receipt(reply.get("receipt"), player_id, wave_id)
