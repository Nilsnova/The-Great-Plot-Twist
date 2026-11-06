"""Safe host-console response models and readiness labels. Used by host routes; no case data."""

import os
import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictInt

from server import __version__

# Each probe checks an object required by that migration, not its entire applied history.
MIGRATIONS = (
    ("20261106000000_foundation.sql", "core", "profiles"),
    ("20261106010000_island_exchange.sql", "market", "market_positions"),
    ("20261106020000_accounts.sql", "core", "captain_name_rerolls"),
    ("20261106030000_entry_profiles.sql", "core", "entry_profiles"),
    ("20261106040000_crew_codes.sql", "core", "crew_join_failures"),
    ("20261106170000_host_console.sql", "core", "host_console_actions"),
)


class WalletMovement(BaseModel):
    reason: str
    count: StrictInt = Field(ge=0)
    earned: StrictInt = Field(ge=0)
    spent: StrictInt = Field(ge=0)
    net: StrictInt


class OverviewRows(BaseModel):
    players: StrictInt = Field(ge=0)
    crews: dict[str, StrictInt] | None
    openPositions: StrictInt | None
    walletToday: list[WalletMovement]
    day: str
    schemaObjects: dict[str, bool]
    lastKeepaliveAt: datetime | None


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
    reason: Literal["not_test_crew", "not_forming", "action_conflict"] | None = None


def expected_migrations(objects: dict[str, bool], flags: dict[str, bool]) -> list[dict]:
    return [
        {"name": name, "feature": feature,
         "enabled": feature == "core" or flags.get(feature, False),
         "objectPresent": objects.get(table, False)}
        for name, feature, table in MIGRATIONS
    ]


def build_stamp() -> dict[str, str]:
    """Only the documented nonsecret deployment SHA; never arbitrary environment contents."""
    commit = os.environ.get("VERCEL_GIT_COMMIT_SHA", "")
    if not re.fullmatch(r"[0-9a-fA-F]{40}", commit):
        commit = "unknown"
    return {"version": __version__, "commit": commit}
