"""Strict shared arsenal snapshots. Used by the versioned service, never by legacy wallets."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, ValidationError

from server.island.catalogue import IslandCatalogue
from server.island.shared_arsenal_store import Unsigned, read_result
from server.island.treasury_store import EnvelopeRow, read_envelope
from server.supabase_admin import SupabaseRejected


class EconomyIntent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["island_shared"]
    version: StrictInt = Field(ge=1, le=1)
    islandOwner: UUID
    runEpoch: UUID


class SharedCopy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    no: StrictInt = Field(ge=1)
    weapon: StrictStr
    holder: UUID | None
    holderName: StrictStr | None
    holderGeneration: Unsigned
    pendingReturnWaveId: UUID | None
    disconnectedUntil: datetime | None
    away: StrictBool
    you: StrictBool


class SharedView(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["done"]
    arsenalVersion: StrictInt = Field(ge=1, le=1)
    economy: EnvelopeRow
    arsenalRevision: Unsigned
    code: StrictStr
    capacity: StrictInt = Field(ge=20, le=20)
    total: StrictInt = Field(ge=0)
    stored: StrictInt = Field(ge=0)
    copies: list[SharedCopy]
    mine: UUID | None
    carried: StrictStr
    unlockWave: StrictInt = Field(ge=0)
    waveRunning: StrictBool


def read_view(value: object, catalogue: IslandCatalogue, actor_id: str, owner: str) -> dict:
    if isinstance(value, dict) and value.get("status") == "refused":
        read_result(value)
    try:
        row = SharedView.model_validate(value)
        account = read_envelope(row.economy.model_dump(mode="json"))
        if account.island_owner != owner or row.total != len(row.copies):
            raise ValueError("Wrong inventory scope or count.")
        if row.stored != sum(copy.holder is None for copy in row.copies):
            raise ValueError("Wrong stored copy count.")
        if len({copy.id for copy in row.copies}) != row.total:
            raise ValueError("Duplicate copy identity.")
        mine = [copy for copy in row.copies if copy.you]
        if len(mine) > 1 or any(
            str(copy.holder) != actor_id or copy.pendingReturnWaveId for copy in mine
        ):
            raise ValueError("Wrong holder identity.")
        if row.mine != (mine[0].id if mine else None):
            raise ValueError("Wrong carried copy.")
        if row.carried != (mine[0].weapon if mine else "musket"):
            raise ValueError("Wrong carried weapon.")
        result = row.model_dump(mode="json", exclude={"status"})
        names = {entry.weapon: entry.name for entry in catalogue.weapons}
        for copy in result["copies"]:
            copy["name"] = names.get(copy["weapon"], copy["weapon"])
        result["types"] = [
            {
                "id": entry.weapon,
                "name": entry.name,
                "priceCoins": str(entry.coins),
                "unlockWave": entry.unlock_wave,
                "unlocked": entry.unlock_wave <= row.unlockWave,
            }
            for entry in catalogue.weapons
        ]
        return result
    except (ValidationError, ValueError) as error:
        raise SupabaseRejected(
            "The database sent an unreadable shared arsenal snapshot."
        ) from error
