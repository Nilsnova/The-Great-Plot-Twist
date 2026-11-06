"""Strict request models for case intents; unknown fields never become trusted game facts."""

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt


class CaseIntent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    actionUid: str = Field(pattern=r"^[A-Za-z0-9_-]{8,64}$", strict=True)


class SearchIntent(CaseIntent):
    routeId: str = Field(pattern=r"^C[1-8][.][a-z0-9_]{2,40}$", strict=True)
    paidConfirmed: StrictBool = False
    expectedPrice: StrictInt | None = Field(default=None, ge=0)


class AccuseIntent(CaseIntent):
    suspect: str = Field(pattern=r"^[a-z0-9_]{2,40}$", strict=True)


class ClockIntent(CaseIntent):
    seconds: StrictInt = Field(ge=1, le=3600)
