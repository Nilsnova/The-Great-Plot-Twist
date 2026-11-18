"""Trusted manifests and exact quote values for shared island construction.

Used by the construction adapter and its tests; SQL repeats mutable checks.
"""

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, model_validator

from server.island.catalogue import IslandCatalogue
from server.island.treasury_models import decimal_string

Unsigned = Annotated[StrictStr, Field(pattern=r"^(0|[1-9][0-9]*)$")]
SpotId = Annotated[StrictStr, Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")]


class ConstructionIntent(BaseModel):
    """An exact quoted action, never a client-selected price table or payer."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    action: Literal["build", "upgrade", "demolish"]
    spot: SpotId
    kind: Literal[
        "wall", "cannon", "mortar", "harpoon", "culverin", "swivel", "watchtower", "house"
    ]
    instanceId: UUID | None
    expectedLevel: StrictInt = Field(ge=0, le=5)
    quotedCoins: Unsigned

    @model_validator(mode="after")
    def check_target(self) -> Self:
        if self.action == "build":
            if self.instanceId is not None or self.expectedLevel != 0:
                raise ValueError("A build quote must target an empty spot.")
        elif self.instanceId is None or self.expectedLevel < 1:
            raise ValueError("An existing structure quote requires its instance and level.")
        if self.action != "demolish" and self.quotedCoins == "0":
            raise ValueError("A construction purchase must cost positive coins.")
        return self


def catalogue_manifest(catalogue: IslandCatalogue) -> dict:
    """Serialize the server's current, flag-filtered catalogue for SQL rechecks."""
    return {
        "kinds": {
            kind.kind: {
                "prices": [decimal_string(price) for price in kind.prices],
                "waves": list(kind.level_waves or (0,) * kind.max_level),
            }
            for kind in catalogue.kinds
        },
        "spots": {
            spot.id: {
                "kinds": list(spot.kinds),
                "wave": max(spot.unlock_wave, catalogue.campaign.spot_wave(spot.id)),
            }
            for spot in catalogue.spots
        },
        "engineerDiscountPercent": catalogue.skills.engineer_discount,
    }


def refund_for_payments(payments: tuple[int, ...]) -> int:
    """Half the actual complete shared basis, rounded once for the island account."""
    if not payments or any(
        isinstance(value, bool) or not isinstance(value, int) or value < 1 for value in payments
    ):
        raise ValueError("An actual positive construction payment basis is required.")
    return sum(payments) // 2
