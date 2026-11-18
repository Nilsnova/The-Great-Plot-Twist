"""Server-owned shared crew offers. Used by the shared crew adapter and read projections."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

from server.island.catalogue import IslandCatalogue
from server.island.treasury_models import decimal_string

CrewKind = Literal["gunner", "carpenter", "lookout", "guard"]
PURCHASABLE = frozenset({"gunner", "lookout", "guard"})


class HireIntent(BaseModel):
    """The player chooses a kind, never an account, price, maximum or progress value."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    crew: CrewKind


def manifest(catalogue: IslandCatalogue) -> dict:
    return {
        member.crew: {
            "priceCoins": decimal_string(member.coins),
            "maxCount": member.max,
            "unlockWave": member.unlock_wave,
        }
        for member in catalogue.crew
    }


def crew_offers(
    catalogue: IslandCatalogue, counts: dict[str, int], wave_best: int, available_coins: int
) -> list[dict]:
    """An offer is a display hint; SQL repeats capacity, progress and treasury checks."""
    offers, catalogue_prices = [], manifest(catalogue)
    for member in catalogue.crew:
        count = counts.get(member.crew, 0)
        reason = None
        if member.crew not in PURCHASABLE:
            reason = "crew_unavailable"
        elif wave_best < member.unlock_wave:
            reason = "locked"
        elif count >= member.max:
            reason = "crew_full"
        elif available_coins < member.coins:
            reason = "insufficient_funds"
        offers.append(
            {
                "crew": member.crew,
                "count": count,
                **catalogue_prices[member.crew],
                "available": reason is None,
                "reason": reason,
            }
        )
    return offers
