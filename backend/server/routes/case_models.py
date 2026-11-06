"""Strict request models for case intents; unknown fields never become trusted game facts."""

import re
from typing import Literal

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


class PinIntent(CaseIntent):
    cardId: str = Field(pattern=r"^C[1-8]$", strict=True)


class PairIntent(CaseIntent):
    cards: tuple[str, str]

    @field_validator("cards")
    @classmethod
    def valid_pair(cls, cards):
        if cards[0] == cards[1] or any(not re.fullmatch(r"C[1-8]", card) for card in cards):
            raise ValueError("Choose two distinct cards from C1 to C8.")
        return cards


class PostIntent(CaseIntent):
    light: str = Field(pattern=r"^[a-z0-9_]{2,40}$", strict=True)


class SignalIntent(PostIntent):
    bearing: float = Field(strict=True, ge=0, lt=360, allow_inf_nan=False)


class OrderIntent(CaseIntent):
    seat: StrictInt = Field(ge=1, le=4)
    order: Literal["fetch", "man_light"]
    target: str = Field(pattern=r"^[A-Za-z0-9_]{2,40}$", strict=True)
    allowPaid: StrictBool = False
