"""Strict canonical session metadata and Captain checkpoint transport.

Used by the new session router and native wave adapters. Requests choose neither
actor/account nor Captain stats, fall identity, position or clock authority.
"""

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictFloat,
    StrictInt,
    StrictStr,
    TypeAdapter,
    model_validator,
)

from server.island.economy_http_models import SharedEconomy
from server.island.shared_wave_http import SharedWaveProof
from server.island.treasury_store import EnvelopeRow as BaseEnvelope
from server.island.treasury_store import MoneyRow as BaseMoney
from server.island.treasury_store import account_from_row
from server.island.wave_recovery import RecoveryCheckpoint

Unsigned = Annotated[StrictStr, Field(pattern=r"^(0|[1-9][0-9]*)$")]
Positive = Annotated[StrictStr, Field(pattern=r"^[1-9][0-9]*$")]


def player_uid(value: str) -> str:
    if value.startswith(("fx_", "sys_")):
        raise ValueError("System identities cannot be player actions.")
    return value


ActionUid = Annotated[
    StrictStr, TypeAdapter, Field(pattern=r"^[A-Za-z0-9_-]{8,64}$"), AfterValidator(player_uid)
]


class Origin(SharedEconomy):
    accountId: UUID


class MoneyRow(BaseMoney):
    model_config = ConfigDict(extra="forbid", frozen=True)


class EnvelopeRow(BaseEnvelope):
    model_config = ConfigDict(extra="forbid", frozen=True)
    treasury: MoneyRow


class SessionAttach(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    economy: SharedEconomy
    sessionId: UUID
    expectedGeneration: Unsigned
    actionUid: ActionUid


class SessionLeave(SharedWaveProof):
    actionUid: ActionUid


class SessionSettings(SessionLeave):
    breakPaused: StrictBool | None = None
    autoNext: StrictBool | None = None
    countdownSeconds: StrictInt | None = Field(default=None, ge=0, le=60)

    @model_validator(mode="after")
    def has_change(self) -> Self:
        if any(
            getattr(self, name) is None
            for name in self.model_fields_set
            if name in {"breakPaused", "autoNext", "countdownSeconds"}
        ):
            raise ValueError("Provided settings cannot be null.")
        if all(
            getattr(self, name) is None for name in ("breakPaused", "autoNext", "countdownSeconds")
        ):
            raise ValueError("Choose at least one session setting.")
        return self


class SessionData(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    sessionId: UUID | None
    connectionGeneration: Positive | None
    isController: StrictBool
    isSpectator: StrictBool
    leaderId: UUID | None
    graceUntil: AwareDatetime | None
    place: Annotated[
        StrictStr,
        TypeAdapter,
        Field(pattern=r"^isle_[abcdefghjkmnpqrstuvwxyz23456789]{5}_[0-9a-f]{24}$"),
    ]
    topicGeneration: Positive
    breakPaused: StrictBool
    autoNext: StrictBool
    countdownSeconds: StrictInt = Field(ge=0, le=60)

    @model_validator(mode="after")
    def controller_proof(self) -> Self:
        if self.isController == self.isSpectator:
            raise ValueError("A projection has exactly one control role.")
        if self.isController:
            if self.sessionId is None or self.connectionGeneration is None:
                raise ValueError("A controlling projection needs its connection proof.")
        elif self.sessionId is not None or self.connectionGeneration is not None:
            raise ValueError("A spectator projection cannot expose connection proof.")
        return self


class LeaveEffect(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    connectionGeneration: Positive


class SettingsEffect(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    breakPaused: StrictBool
    autoNext: StrictBool
    countdownSeconds: StrictInt = Field(ge=0, le=60)


class SessionReceipt(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    receiptId: UUID
    actionUid: ActionUid
    action: Literal["session_leave", "session_settings"]
    actorId: UUID
    origin: Origin
    result: LeaveEffect | SettingsEffect

    @model_validator(mode="after")
    def effect_action(self) -> Self:
        expected = LeaveEffect if self.action == "session_leave" else SettingsEffect
        if not isinstance(self.result, expected):
            raise ValueError("The receipt effect belongs to another action.")
        return self


class SessionReply(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    status: Literal["done"]
    economy: EnvelopeRow | None
    session: SessionData | None
    repeat: StrictBool | None = None
    receipt: SessionReceipt | None = None

    @model_validator(mode="after")
    def coherent_projection(self) -> Self:
        if (self.economy is None) != (self.session is None):
            raise ValueError("Current economy and session must be projected together.")
        if self.economy is not None:
            account_from_row(self.economy)
        if self.receipt is not None and self.repeat is None:
            raise ValueError("A receipt requires an explicit repeat flag.")
        if self.repeat is True and self.receipt is not None and self.session is not None:
            raise ValueError("A historical receipt cannot project current authority.")
        return self


class CaptainFact(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    hpUnits: StrictInt = Field(ge=0, le=1_000_000)
    downAtTick: StrictInt | None = Field(ge=0, le=18_000)
    reviveBasisSeq: StrictInt = Field(ge=0)

    @model_validator(mode="after")
    def fallen_state(self) -> Self:
        if (self.hpUnits == 0) != (self.downAtTick is not None):
            raise ValueError("Fallen HP and tick must agree.")
        return self


class CaptainReport(SharedWaveProof):
    waveProtocol: StrictInt = Field(ge=2, le=2)
    checkpointUid: ActionUid
    throughTick: StrictInt = Field(ge=0, le=18_000)
    inputHeadSeq: StrictInt = Field(ge=0)
    captains: dict[UUID, CaptainFact] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def bounded_fall_ticks(self) -> Self:
        if any(
            row.downAtTick is not None and row.downAtTick > self.throughTick
            for row in self.captains.values()
        ):
            raise ValueError("A fall cannot follow the reported prefix.")
        return self


class NativeWeather(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    kind: StrictStr = Field(min_length=1, max_length=64)
    label: StrictStr = Field(max_length=256)
    ships: StrictFloat = Field(ge=0, allow_inf_nan=False)
    fog: StrictFloat = Field(ge=0, le=1, allow_inf_nan=False)


class FrozenCaptain(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    level: StrictInt = Field(ge=1)
    skills: list[StrictStr] = Field(max_length=64)
    weapon: StrictStr = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")


class FrozenParticipant(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    participantToken: UUID
    captain: FrozenCaptain


class NativeWave(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    status: Literal["started"]
    waveId: UUID
    place: Literal["island"]
    islandOwner: UUID
    wave: StrictInt = Field(ge=1)
    seed: StrictInt = Field(ge=0)
    startsAt: AwareDatetime
    minimumSeconds: StrictInt = Field(ge=0)
    maximumSeconds: StrictInt = Field(ge=1)
    countdownSeconds: StrictInt = Field(ge=0, le=60)
    weather: NativeWeather
    boss: StrictBool
    flagship: StrictBool
    rules: list[StrictStr]
    repeat: StrictBool
    historical: StrictBool
    recoveryVersion: StrictInt = Field(ge=1, le=1)
    waveProtocol: StrictInt = Field(ge=2, le=2)
    initialSnapshot: dict
    participantToken: UUID | None
    lastActorCounter: StrictInt | None = Field(ge=0)
    economy: EnvelopeRow | None
    session: SessionData | None
    serverNow: AwareDatetime
    closed: StrictBool

    @model_validator(mode="after")
    def original_snapshot(self) -> Self:
        origin = Origin.model_validate(self.initialSnapshot.get("economy"))
        snapshot = self.initialSnapshot
        if origin.model_dump(mode="json") != snapshot["economy"]:
            raise ValueError("Immutable origin identities must be canonical.")
        if self.flagship:
            raise ValueError("An island wave cannot be a Pirate Point flagship.")
        if str(origin.islandOwner) != str(self.islandOwner) or snapshot.get("waveId") != str(
            self.waveId
        ):
            raise ValueError("Wrong original wave scope.")
        if any(
            type(snapshot.get(key)) is not int or snapshot[key] != value
            for key, value in (
                ("waveProtocol", 2),
                ("recoveryVersion", 1),
                ("seed", self.seed),
                ("wave", self.wave),
            )
        ):
            raise ValueError("Wrong immutable wave metadata.")
        if not isinstance(snapshot.get("islandEpoch"), str):
            raise ValueError("Missing health epoch.")
        UUID(snapshot["islandEpoch"])
        if (
            snapshot.get("weatherLabel") != self.weather.label
            or type(snapshot.get("createWave", {}).get("boss")) is not bool
            or snapshot["createWave"]["boss"] != self.boss
        ):
            raise ValueError("Wrong frozen presentation metadata.")
        participants = snapshot.get("participants")
        if not isinstance(participants, list) or not 1 <= len(participants) <= 10:
            raise ValueError("Missing frozen roster.")
        frozen = [FrozenParticipant.model_validate(row) for row in participants]
        if any(
            row.model_dump(mode="json") != raw
            for row, raw in zip(frozen, participants, strict=True)
        ):
            raise ValueError("Frozen participant identities must be canonical.")
        tokens = [row.participantToken for row in frozen]
        if len(set(tokens)) != len(tokens) or snapshot.get("rosterSize") != len(tokens):
            raise ValueError("Invalid frozen participant roster.")
        if self.islandOwner != origin.islandOwner:
            raise ValueError("Wrong immutable owner.")
        if TypeAdapter(AwareDatetime).validate_python(snapshot.get("startsAt")) != self.startsAt:
            raise ValueError("Wrong immutable start time.")
        if self.historical and (
            not self.repeat
            or self.economy is not None
            or self.session is not None
            or self.participantToken is not None
            or self.lastActorCounter is not None
        ):
            raise ValueError("Historical receipt cannot grant current authority.")
        if (self.economy is None) != (self.session is None):
            raise ValueError("Current projection is incomplete.")
        if self.economy is not None:
            account_from_row(self.economy)
            if any(
                getattr(self.economy, key) != getattr(origin, key)
                for key in ("islandOwner", "accountId", "runEpoch")
            ):
                raise ValueError("Wrong current projection origin.")
        controller = self.session is not None and self.session.isController
        if controller:
            if self.closed or self.participantToken not in tokens or self.lastActorCounter is None:
                raise ValueError("Missing live participant proof.")
        elif self.participantToken is not None or self.lastActorCounter is not None:
            raise ValueError("Spectator cannot expose control proof.")
        return self


Outcome = Literal["won", "lost", "abandoned", "expired"]


class TerminalFingerprint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    mode: Literal["island_shared"]
    version: StrictInt = Field(ge=1, le=1)
    waveId: UUID
    accountId: UUID
    runEpoch: UUID
    playedWave: StrictInt = Field(ge=1)
    outcome: Outcome
    earnedBonuses: list[Literal["galleon", "finisher"]] = Field(max_length=2)


class Completion(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: UUID
    playerId: UUID
    waveId: UUID
    playedWave: StrictInt = Field(ge=1)
    outcome: Outcome
    confirmedParticipation: StrictBool
    engineerCommitmentId: UUID | None
    accountId: UUID
    runEpoch: UUID
    terminalFingerprint: TerminalFingerprint

    @model_validator(mode="after")
    def immutable_terminal(self) -> Self:
        if any(
            getattr(self, key) != getattr(self.terminalFingerprint, key)
            for key in ("waveId", "accountId", "runEpoch", "playedWave", "outcome")
        ):
            raise ValueError("Completion and original terminal source disagree.")
        return self


class NativeFinish(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    status: Literal["done"]
    waveId: UUID
    outcome: Outcome
    repeat: StrictBool
    origin: Origin
    completion: Completion
    economy: EnvelopeRow | None
    session: SessionData | None

    @model_validator(mode="after")
    def immutable_origin(self) -> Self:
        if (self.waveId, self.outcome, self.origin.accountId, self.origin.runEpoch) != (
            self.completion.waveId,
            self.completion.outcome,
            self.completion.accountId,
            self.completion.runEpoch,
        ):
            raise ValueError("Wrong original completion source.")
        if (self.economy is None) != (self.session is None):
            raise ValueError("Incomplete current projection.")
        if self.economy is not None:
            account_from_row(self.economy)
            if any(
                getattr(self.economy, key) != getattr(self.origin, key)
                for key in ("islandOwner", "accountId", "runEpoch")
            ):
                raise ValueError("Wrong authorized current projection.")
        return self


class FinishReport(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    survived: StrictBool
    shipsSunk: StrictInt = Field(ge=0, le=1000)
    checkpoint: RecoveryCheckpoint | None = None
    bonuses: list[Literal["galleon", "finisher"]] | None = Field(default=None, max_length=2)
    rescued: StrictBool = False
    walls: (
        dict[
            Annotated[StrictStr, Field(pattern=r"^wall_[0-9]{1,2}$")],
            Annotated[StrictInt, Field(ge=0, le=100)],
        ]
        | None
    ) = Field(default=None, max_length=24)


class CaptainState(CaptainFact):
    fallId: UUID | None

    @model_validator(mode="after")
    def fall_identity(self) -> Self:
        if (self.hpUnits == 0) != (self.fallId is not None):
            raise ValueError("Only a fallen Captain has a server fall identity.")
        return self


class CaptainResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    accepted: StrictBool
    repeated: StrictBool
    throughTick: StrictInt = Field(ge=0, le=18_000)
    inputHeadSeq: StrictInt = Field(ge=0)
    captains: dict[UUID, CaptainState] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def accepted_success(self) -> Self:
        if not self.accepted:
            raise ValueError("A Captain success must be accepted.")
        return self


class WithdrawnPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    participantToken: UUID
    reason: Literal["leave", "disconnect_expired", "membership_lost", "account_deleted", "reset"]
