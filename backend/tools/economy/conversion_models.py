"""Strict offline save inventory and explicit conversion policy. Used by conversion previews."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr

Coins = Annotated[StrictStr, Field(pattern=r"^(0|[1-9][0-9]*)$")]
Delta = Annotated[StrictStr, Field(pattern=r"^(0|-?[1-9][0-9]*)$")]
Identifier = Annotated[StrictStr, Field(min_length=1, max_length=120, pattern=r"^\S(?:.*\S)?$")]


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class LedgerEntry(Record):
    entryId: Identifier
    reason: Identifier
    sourceRef: Identifier
    balanceDelta: Delta
    committedDelta: Delta


class Player(Record):
    playerId: UUID
    walletCoins: Coins
    walletLedger: list[LedgerEntry]
    privateTimber: Coins
    captainLevel: Annotated[StrictInt, Field(ge=1, le=5)]
    personalBestWave: Annotated[StrictInt, Field(ge=0)]
    earnedPoints: Coins
    unspentPoints: Coins
    knownSkills: list[Identifier]
    role: Literal["medic", "engineer", "gunner"] | None
    engineerCommitmentId: UUID | None
    progressionVersion: Annotated[StrictInt, Field(ge=0, le=1)]
    assignmentWaveId: UUID | None
    openLegacyWaveIds: list[UUID]


class Payment(Record):
    level: Annotated[StrictInt, Field(ge=1, le=5)]
    coins: Coins
    sourceRef: Identifier
    payerId: UUID | None
    refunded: StrictBool


class Building(Record):
    instanceId: UUID
    spot: Identifier
    kind: Identifier
    level: Annotated[StrictInt, Field(ge=1, le=5)]
    payments: list[Payment]
    refundEligible: StrictBool
    layout: dict[StrictStr, StrictStr | StrictInt]
    skill: Identifier | None
    treeA: Annotated[StrictInt, Field(ge=0)]
    treeB: Annotated[StrictInt, Field(ge=0)]


class Copy(Record):
    copyId: UUID
    weapon: Identifier
    copyNumber: Annotated[StrictInt, Field(ge=1)]
    sourceRef: Identifier
    buyerId: UUID | None
    holderId: UUID | None
    accountId: UUID | None
    runEpoch: UUID | None
    holderGeneration: Coins
    pendingReturnWaveId: UUID | None
    disconnectedUntil: Identifier | None


class Crew(Record):
    gunner: Annotated[StrictInt, Field(ge=0)]
    carpenter: Annotated[StrictInt, Field(ge=0)]
    lookout: Annotated[StrictInt, Field(ge=0)]
    guard: Annotated[StrictInt, Field(ge=0)]


class Island(Record):
    ownerId: UUID
    revision: Coins
    mode: Literal["personal_legacy", "island_shared"]
    accountId: UUID | None
    members: list[UUID]
    waveBest: Annotated[StrictInt, Field(ge=0)]
    openWaveIds: list[UUID]
    closedWaveIds: list[UUID]
    buildings: list[Building]
    copies: list[Copy]
    unmappedWeaponIds: list[Identifier]
    legacyWeaponsOwned: list[Identifier]
    legacyEquippedWeapon: Identifier
    research: dict[StrictStr, Coins | StrictStr | StrictInt | None]
    crew: Crew
    wreckPaid: Coins


class Account(Record):
    accountId: UUID
    islandOwner: UUID
    runEpoch: UUID
    balanceCoins: Coins
    committedCoins: Coins
    retired: StrictBool
    ledger: list[LedgerEntry]


class Obligation(Record):
    obligationId: UUID
    kind: Literal[
        "wave_claim",
        "market_call",
        "position",
        "sports",
        "prediction",
        "duel",
        "ship_claim",
        "shared_wager",
    ]
    mode: Literal["personal_legacy", "island_shared"]
    actorId: UUID
    recipientId: UUID
    accountId: UUID | None
    runEpoch: UUID | None
    principalCoins: Coins
    settled: StrictBool
    sourceRef: Identifier
    origin: dict[StrictStr, StrictStr | StrictInt | StrictBool | None]


class Snapshot(Record):
    schemaVersion: Annotated[StrictInt, Field(ge=1, le=1)]
    sourceCommit: Annotated[StrictStr, Field(pattern=r"^[0-9a-f]{40}$")]
    snapshotId: UUID
    sourceFamilies: list[Identifier]
    players: list[Player]
    islands: list[Island]
    accounts: list[Account]
    obligations: list[Obligation]
    unknownOrigins: list[Identifier]


class Policy(Record):
    schemaVersion: Annotated[StrictInt, Field(ge=1, le=1)]
    policyId: UUID
    reviewReference: Identifier
    reviewedBy: Annotated[list[Identifier], Field(min_length=2)]
    selectedIslands: Annotated[list[UUID], Field(min_length=1)]
    openingGrantCoins: Coins
    wavesPerPoint: Annotated[StrictInt, Field(ge=1)]
    skillCosts: dict[Identifier, Annotated[StrictInt, Field(ge=1)]]
    retiredSkillIds: list[Identifier]
    personalCash: Literal["preserve"]
    refundBasis: Literal["verified_actual_payments"]
    retiredSkills: Literal["preserve_ids_no_compensation"]
    copyOverflow: Literal["grandfather"]
    obligations: Literal["retain_origin"]
