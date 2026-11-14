"""Safe host-console response models and readiness labels. Used by host routes; no case data."""

import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictInt

from server import __version__

# Each probe checks an object required by that migration, not its entire applied history.
MIGRATIONS = (
    ("20261106000000_foundation.sql", "core", "profiles"),
    # Exchange v2 intentionally drops the original spot tables; probe its replacement.
    ("20261106010000_island_exchange.sql", "market", "exchange_positions"),
    ("20261106020000_accounts.sql", "core", "captain_name_rerolls"),
    ("20261106030000_entry_profiles.sql", "core", "entry_profiles"),
    ("20261106040000_crew_codes.sql", "core", "crew_join_failures"),
    ("20261106050000_live_presence.sql", "live_presence", "live_crew_id"),
    ("20261106060000_case_rules.sql", "case", "case_state"),
    ("20261106070000_home_islet.sql", "core", "islets"),
    ("20261106080000_case_board_and_night.sql", "case", "board_pins"),
    ("20261106090000_exchange_leverage.sql", "market", "exchange_positions"),
    ("20261106100000_prediction_desk.sql", "predictions", "prediction_pools"),
    ("20261106110000_lantern_duels.sql", "arena", "duels"),
    ("20261106120000_relighting.sql", "case", "world_state"),
    ("20261106130000_npc_partners.sql", "case", "npc_orders"),
    ("20261106140000_followups.sql", "core", "delete_player"),
    ("20261106160000_festival.sql", "festival", "festival_actions"),
    ("20261106170000_host_console.sql", "core", "host_console_actions"),
)


class WalletMovement(BaseModel):
    reason: str
    count: StrictInt = Field(ge=0)
    earned: StrictInt = Field(ge=0)
    spent: StrictInt = Field(ge=0)
    net: StrictInt


class _Count(BaseModel):
    """Counts only. Extra keys from a newer function are ignored, never passed on."""


class GameIslands(_Count):
    total: StrictInt = Field(ge=0)
    createdToday: StrictInt = Field(ge=0)


class GameGames(_Count):
    withMembers: StrictInt = Field(ge=0)
    maxMembers: StrictInt = Field(ge=0)


class GameWaves(_Count):
    runningNow: StrictInt = Field(ge=0)
    finishedToday: StrictInt = Field(ge=0)
    bestWave: StrictInt = Field(ge=0)


class GameDemo(_Count):
    codeActive: bool
    guestsToday: StrictInt = Field(ge=0)


class GameOverview(BaseModel):
    """The "game" key of host_console_overview() (20261113030000). Counts, no names or ids."""

    islands: GameIslands
    games: GameGames
    waves: GameWaves
    demo: GameDemo


class OverviewRows(BaseModel):
    players: StrictInt = Field(ge=0)
    crews: dict[str, StrictInt] | None
    openPositions: StrictInt | None
    walletToday: list[WalletMovement]
    day: str
    schemaObjects: dict[str, bool]
    lastKeepaliveAt: datetime | None
    # Absent until the owner applies 20261113030000_host_console_v3.sql.
    game: GameOverview | None = None


class HostSeat(BaseModel):
    seatNo: int = Field(ge=1, le=4)
    captainName: str | None
    kind: Literal["player", "npc"]


class HostCrew(BaseModel):
    id: UUID
    code: str | None
    status: Literal["forming", "active", "finished"]
    startedAt: datetime | None
    seats: list[HostSeat] = Field(max_length=4)
    canClose: bool


class CrewList(BaseModel):
    crews: list[HostCrew] = Field(max_length=50)
    total: StrictInt = Field(ge=0)
    limit: Literal[50]


class CloseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    actionUid: UUID


class CloseReply(BaseModel):
    status: Literal["closed", "refused"]
    crewId: UUID | None = None
    reason: Literal["not_test_crew", "not_forming", "action_conflict", "crew_busy"] | None = None


def expected_migrations(objects: dict[str, bool], flags: dict[str, bool]) -> list[dict]:
    return [
        {
            "name": name,
            "feature": feature,
            "enabled": feature == "core" or flags.get(feature, False),
            "objectPresent": objects.get(table, False),
        }
        for name, feature, table in MIGRATIONS
    ]


def build_stamp(commit: str) -> dict[str, str]:
    """Only the documented nonsecret deployment SHA from Settings, never arbitrary contents."""
    if not re.fullmatch(r"[0-9a-fA-F]{40}", commit):
        commit = "unknown"
    return {"version": __version__, "commit": commit}


def case_clock_available(schema: dict, flags: dict[str, bool]) -> bool:
    """G10 must be installed and switched on; a reserved path/flag alone is not enough."""
    path = schema.get("paths", {}).get("/api/host/case/clock", {})
    return bool(flags.get("case", False) and "post" in path)
