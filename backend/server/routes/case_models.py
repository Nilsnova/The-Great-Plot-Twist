"""Strict request models for case intents; unknown fields never become trusted game facts."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, field_validator


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


CardId = Annotated[str, Field(pattern=r"^C[1-8]$", strict=True)]


class PinIntent(CaseIntent):
    cardId: CardId


class PairIntent(CaseIntent):
    cards: list[CardId] = Field(min_length=2, max_length=2, strict=True)

    @field_validator("cards")
    @classmethod
    def distinct_cards(cls, cards: list[str]) -> list[str]:
        if cards[0] == cards[1]:
            raise ValueError("Pair two different cards.")
        return cards


class PostIntent(CaseIntent):
    light: str = Field(pattern=r"^[a-z][a-z0-9_]{1,60}$", strict=True)


class SignalIntent(PostIntent):
    bearing: float = Field(ge=0, lt=360, strict=True, allow_inf_nan=False)
