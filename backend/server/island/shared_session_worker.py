"""Bounded canonical lease/closure and won-break auto-next worker cycle.

Used by tools/shared_session_worker.py. All writes are service RPCs with their
own canonical locks; candidate reads and template preparation grant no authority.
"""

from secrets import randbelow
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, ValidationError

from server.errors import ApiError
from server.island import shared_wave_template, wave_rules, waves
from server.island.catalogue import IslandCatalogue, Weather
from server.island.shared_session_models import NativeWave, Origin
from server.settings import Settings
from server.supabase_admin import SupabaseAdmin, SupabaseRejected


class Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    islandOwner: UUID
    runEpoch: UUID
    afterWaveId: UUID
    actorId: UUID
    sessionId: UUID
    connectionGeneration: Annotated[StrictStr, Field(pattern=r"^[1-9][0-9]*$")]


class Candidates(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    status: StrictStr
    candidates: list[Candidate] = Field(max_length=100)


class DueResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    status: StrictStr
    islands: StrictInt = Field(ge=0, le=100)
    closed: StrictInt = Field(ge=0)


DEFERRED = frozenset(
    {
        "auto_next_not_due",
        "island_changed",
        "stale_controller",
        "not_session_leader",
        "captain_assigned",
        "wave_running",
        "epoch_mismatch",
        "not_member",
        "path_unavailable",
    }
)


async def auto_start(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    settings: Settings,
    weather: Weather,
    candidate: Candidate,
) -> bool:
    """Prepare from coherent facts, then let SQL recheck the exact durable break."""
    seed = randbelow(waves.SEED_LIMIT)
    rules = wave_rules.wanted_rules(settings)
    if "structure_recovery" not in rules:
        rules.append("structure_recovery")
    template, basis = await shared_wave_template.prepare_shared_wave(
        admin,
        catalogue,
        str(candidate.actorId),
        str(candidate.islandOwner),
        weather,
        seed,
        rules,
    )
    timing = catalogue.waves
    result = await admin.call_function(
        "shared_session_wave_auto_start",
        {
            "p_actor_id": str(candidate.actorId),
            "p_island_owner": str(candidate.islandOwner),
            "p_run_epoch": str(candidate.runEpoch),
            "p_after_wave_id": str(candidate.afterWaveId),
            "p_session_id": str(candidate.sessionId),
            "p_connection_generation": candidate.connectionGeneration,
            "p_seed": seed,
            "p_minimum_seconds": timing.minimum_seconds,
            "p_maximum_seconds": timing.maximum_seconds,
            "p_highest_wave": timing.highest_wave,
            "p_weather_kind": weather.kind,
            "p_weather_ships": weather.ships,
            "p_weather_fog": weather.fog,
            "p_rules": rules,
            "p_snapshot_template": template,
            "p_reward_basis": basis.envelope(),
        },
    )
    if (
        isinstance(result, dict)
        and set(result) == {"status", "reason"}
        and result["status"] == "refused"
    ):
        if result["reason"] in DEFERRED:
            return False
        raise SupabaseRejected("The worker received an unexpected auto-next refusal.")
    try:
        accepted = NativeWave.model_validate(result)
        origin = Origin.model_validate(accepted.initialSnapshot["economy"])
        if (accepted.islandOwner, origin.runEpoch) != (candidate.islandOwner, candidate.runEpoch):
            raise ValueError("Another accepted origin.")
    except (ValidationError, ValueError, AttributeError) as error:
        raise SupabaseRejected("The worker received an unreadable accepted bell.") from error
    return not accepted.historical


async def run_once(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    settings: Settings,
    weather: Weather,
    *,
    limit: int = 20,
) -> dict[str, int]:
    """One bounded cycle, safe for overlapping processes and unknown RPC outcomes."""
    if type(limit) is not int or not 1 <= limit <= 100:
        raise ValueError("Use a worker limit between 1 and 100.")
    try:
        due = DueResult.model_validate(
            await admin.call_function(
                "shared_session_process_due",
                {
                    "p_limit": limit,
                },
            )
        )
        candidates = Candidates.model_validate(
            await admin.call_function(
                "shared_session_auto_candidates",
                {
                    "p_limit": limit,
                },
            )
        )
        if (
            due.status != "done"
            or candidates.status != "done"
            or len(candidates.candidates) > limit
        ):
            raise ValueError("Invalid bounded worker reply.")
        if len({row.islandOwner for row in candidates.candidates}) != len(candidates.candidates):
            raise ValueError("Duplicate island candidates.")
    except (ValidationError, ValueError) as error:
        raise SupabaseRejected("The worker received an unreadable due batch.") from error
    counts = {"islands": due.islands, "closed": due.closed, "started": 0, "deferred": 0}
    for candidate in candidates.candidates:
        try:
            started = await auto_start(admin, catalogue, settings, weather, candidate)
        except ApiError as error:
            # A different transaction may change membership/epoch or temporarily
            # make a coherent snapshot unavailable. Unknown results are retried
            # through the durable break/system root on the next worker cycle.
            if error.status_code not in (403, 409, 429, 502, 503):
                raise
            started = False
        counts["started" if started else "deferred"] += 1
    return counts
