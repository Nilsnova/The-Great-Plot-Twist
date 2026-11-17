"""Canonical read model and owner resolver for persistent structure recovery.

The database owns health projection and phase. This module only resolves the target island and
validates the RPC answer; it never reads the caller's wallet or trusts a client HP/max-HP value.
"""

from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictInt, StrictStr

from server.errors import ApiError
from server.game import islet_store
from server.island import permissions, rules, service, store
from server.island.catalogue import IslandCatalogue
from server.island.store import Island
from server.supabase_admin import SupabaseAdmin, SupabaseRejected


class StructureRecoveryItem(BaseModel):
    """One current wall/tower row in the exact public read contract."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    spot: StrictStr
    instance_id: UUID = Field(alias="instanceId")
    kind: Literal["wall", "cannon", "mortar", "harpoon", "culverin", "swivel"]
    level: StrictInt = Field(ge=1, le=5)
    hp_units: StrictInt = Field(alias="hpUnits", ge=0, le=1_000_000)
    max_hp: float = Field(alias="maxHP", gt=0)
    rate_units_per_second: float = Field(alias="rateUnitsPerSecond", ge=0)
    estimated_free_seconds: StrictInt | None = Field(alias="estimatedFreeSeconds", ge=0)
    fixed_price: StrictInt = Field(alias="fixedPrice", ge=0)
    repair_seq: StrictInt = Field(alias="repairSeq", ge=0)


class StructureRecoveryView(BaseModel):
    """Read-only v1 state in canonical camel-case wire spelling."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    server_now: AwareDatetime = Field(alias="serverNow")
    island_epoch: UUID = Field(alias="islandEpoch")
    revision: StrictInt = Field(ge=0)
    recovery_version: Literal[1] = Field(alias="recoveryVersion")
    wave_protocol: Literal[2] = Field(alias="waveProtocol")
    display_phase: Literal["between_waves", "preparing", "combat"] = Field(alias="displayPhase")
    repair_window: Literal["between_waves", "reserved_wave"] = Field(alias="repairWindow")
    wave_id: UUID | None = Field(alias="waveId")
    remaining_paid_uses: StrictInt | None = Field(alias="remainingPaidUses", ge=0, le=3)
    structures: list[StructureRecoveryItem]


async def resolve_target_island(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    code: str | None,
) -> Island:
    """Resolve the caller's own island or a code-named member island, then authorize Repair."""
    del catalogue  # The lookup has no catalogue-dependent choices.
    if code is not None:
        island = await service.find_by_code(admin, code)
    else:
        rows = await admin.select_rows(
            "islands",
            {
                "select": "player_id,code,wave_best,flags",
                "player_id": f"eq.{player_id}",
                "limit": "1",
            },
        )
        if not rows:
            raise islet_store.player_not_set_up()
        row = store.read_model(store.IslandRow, rows[0])
        island = Island(row.player_id, store.checked_code(row.code), row.wave_best, row.flags)
    await permissions.require_action(admin, island.owner, player_id, permissions.REPAIR)
    return island


async def read_state(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    island_owner: str,
) -> StructureRecoveryView:
    """Read and validate the one database-clock, statement-snapshot-consistent v1 view."""
    reply = await admin.call_function(
        "structure_recovery_read_state",
        {
            "p_island_owner": island_owner,
            "p_prices": rules.price_table(catalogue),
        },
    )
    if not isinstance(reply, dict):
        raise SupabaseRejected("The recovery state could not be read.")
    status = reply.get("status")
    if status in {"legacy", "missing"}:
        raise ApiError(404, "feature_off", "Structure recovery is not open for this island yet.")
    if status != "ok":
        raise SupabaseRejected("The recovery state could not be read.")
    return store.read_model(
        StructureRecoveryView, {key: value for key, value in reply.items() if key != "status"}
    )
