"""Persisted-mode boat status and strict shared request models for the authenticated routes.

Used by routes/island_boat.py. Money/phase/membership checks remain inside atomic SQL;
this module never selects a personal fallback after a failed shared read.
"""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, ValidationError

from server.errors import ApiError
from server.island import shared_boat
from server.island.service import find_by_code
from server.island.shared_boat_store import ClaimRow, StartRow, checked_reply
from server.island.structure_repair_models import ActionUid
from server.island.treasury_store import EnvelopeRow, Unsigned, read_envelope, unreadable
from server.supabase_admin import SupabaseAdmin


class EconomyIntent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["island_shared"]
    version: StrictInt = Field(ge=1, le=1)
    islandOwner: UUID
    runEpoch: UUID


class StartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    economy: EconomyIntent
    game: Literal["broadside", "dash"]
    actionUid: ActionUid


class ClaimRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    economy: EconomyIntent
    roundId: UUID
    stars: StrictInt = Field(ge=0, le=3)
    actionUid: ActionUid


class GameOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: Literal["broadside", "dash"]
    paid: StrictBool
    best: StrictInt = Field(ge=0)


class SharedGameOut(GameOut):
    claimedCoins: Unsigned
    remainingCoins: Unsigned
    maximumCoins: Unsigned


class WreckOut(BaseModel):
    paid: StrictInt = Field(ge=0)
    goal: StrictInt = Field(ge=1)


class BoatStatusOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    open: StrictBool
    reason: StrictStr | None
    message: StrictStr | None
    wave: StrictInt = Field(ge=0)
    unlockWave: StrictInt = Field(ge=1)
    wreck: WreckOut
    games: list[GameOut]
    rewardScope: Literal["player"] = "player"


class SharedBoatStatusOut(BoatStatusOut):
    games: list[SharedGameOut]
    rewardScope: Literal["island"] = "island"
    economy: EnvelopeRow


class LegacyRewardOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    game: Literal["broadside", "dash"]
    stars: StrictInt = Field(ge=0, le=3)
    coins: StrictInt = Field(ge=0)
    paid: StrictBool
    already: StrictBool
    balance: StrictInt | None
    wave: StrictInt = Field(ge=0)


async def owner_for(admin: SupabaseAdmin, actor: str, code: str | None) -> str:
    """Resolve a selected island without opening another island or granting private coins."""
    return actor if code is None else (await find_by_code(admin, code)).owner


async def status(
    admin: SupabaseAdmin,
    actor: str,
    code: str | None,
) -> BoatStatusOut | SharedBoatStatusOut:
    owner = await owner_for(admin, actor, code)
    value = checked_reply(
        await admin.call_function(
            "island_boat_runtime_status",
            {
                "p_actor_id": actor,
                "p_island_owner": owner,
            },
        )
    )
    try:
        payload = {key: item for key, item in value.items() if key != "status"}
        if value.get("status") == "shared":
            row = SharedBoatStatusOut.model_validate(payload)
            account = read_envelope(row.economy.model_dump())
            if account.island_owner != owner:
                raise unreadable()
            for game in row.games:
                if (
                    int(game.claimedCoins) + int(game.remainingCoins) != int(game.maximumCoins)
                    or int(game.maximumCoins) != game.best
                    or game.paid != (game.remainingCoins == "0")
                ):
                    raise unreadable()
            return row
        if value.get("status") != "legacy":
            raise unreadable()
        return BoatStatusOut.model_validate(payload)
    except (ValidationError, ValueError) as error:
        raise unreadable() from error


async def legacy_reward(
    admin: SupabaseAdmin,
    actor: str,
    game: str,
    stars: int,
    code: str | None,
) -> LegacyRewardOut:
    owner = await owner_for(admin, actor, code)
    value = await admin.call_function(
        "island_legacy_boat_reward",
        {
            "p_actor_id": actor,
            "p_island_owner": owner,
            "p_game": game,
            "p_stars": stars,
        },
    )
    if isinstance(value, dict) and value.get("reason") == "shared_context_required":
        raise ApiError(409, "economy_context_required", "Use this island's shared boat round.")
    if isinstance(value, dict) and value.get("status") == "refused":
        if value.get("reason") == "locked":
            raise ApiError(409, "locked", "Opens after wave 30.")
        if value.get("reason") == "not_repaired":
            left = value.get("leftCoins")
            message = (
                f"Finish the wreck's repair first: {left} coins to go."
                if type(left) is int and left > 0
                else "Finish repairing the wreck first."
            )
            raise ApiError(409, "not_repaired", message)
    value = checked_reply(value)
    try:
        if value.get("status") != "legacy":
            raise unreadable()
        return LegacyRewardOut.model_validate({k: v for k, v in value.items() if k != "status"})
    except ValidationError as error:
        raise unreadable() from error


async def start(admin: SupabaseAdmin, actor: str, body: StartRequest) -> StartRow:
    return await shared_boat.start_round(
        admin,
        actor,
        str(body.economy.islandOwner),
        str(body.economy.runEpoch),
        body.game,
        body.actionUid,
    )


async def claim(admin: SupabaseAdmin, actor: str, body: ClaimRequest) -> ClaimRow:
    # Round origin is immutable; reading it cannot race a current account/epoch reassignment.
    rows = await admin.select_rows(
        "island_boat_rounds",
        {
            "select": "island_owner,run_epoch",
            "id": f"eq.{body.roundId}",
            "actor_id": f"eq.{actor}",
            "limit": "1",
        },
    )
    if not rows:
        raise ApiError(404, "no_such_round", "That boat round is not yours or does not exist.")
    source = rows[0]
    if (source.get("island_owner"), source.get("run_epoch")) != (
        str(body.economy.islandOwner),
        str(body.economy.runEpoch),
    ):
        raise ApiError(409, "economy_epoch_mismatch", "Use the boat round's original island run.")
    return await shared_boat.claim_round(
        admin, actor, str(body.roundId), str(body.economy.runEpoch), body.stars, body.actionUid
    )
