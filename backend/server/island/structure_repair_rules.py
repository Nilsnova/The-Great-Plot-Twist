"""Fixed price and stable intent rules for paid structure Repair now.

Used by: the future paid repair transaction and pure rule tests.
"""

import hashlib
import json
from collections.abc import Mapping

from server.island.catalogue import IslandCatalogue
from server.island.structure_repair_models import RepairRequest

REPAIRABLE_KINDS = frozenset({"wall", "cannon", "mortar", "harpoon", "culverin", "swivel"})


def repair_price(catalogue: IslandCatalogue, kind: str, level: int) -> int:
    """Return the current base-level incremental catalogue price, or reject unsupported data."""
    if kind not in REPAIRABLE_KINDS:
        raise ValueError(f"Structure kind '{kind}' is not repairable.")
    if isinstance(level, bool) or not isinstance(level, int) or level < 1:
        raise ValueError(
            "A repair level must be a whole number from 1 through the catalogue maximum."
        )
    entry = next((item for item in catalogue.kinds if item.kind == kind), None)
    if entry is None:
        raise ValueError(f"Structure kind '{kind}' is not repairable in this catalogue.")
    if level > entry.max_level:
        raise ValueError(
            "A repair level must be a whole number from 1 through the catalogue maximum."
        )
    return entry.prices[level - 1]


def repair_price_from_schedule(prices: object, kind: str, level: int) -> int:
    """Read the quoted level from the immutable price schedule captured when a wave began."""
    if kind not in REPAIRABLE_KINDS or isinstance(level, bool) or not isinstance(level, int):
        raise ValueError("The frozen price schedule does not contain this repair.")
    if not isinstance(prices, dict):
        raise ValueError("The frozen price schedule is invalid.")
    levels = prices.get(kind)
    if not isinstance(levels, list) or not 1 <= level <= len(levels):
        raise ValueError("The frozen price schedule does not contain this repair level.")
    price = levels[level - 1]
    if isinstance(price, bool) or not isinstance(price, int) or price < 1:
        raise ValueError("The frozen price schedule has an invalid repair price.")
    return price


def intent_fingerprint(
    *,
    owner_id: str,
    reset_epoch: str,
    instance_id: str,
    repair_kind: str,
    quoted_level: int,
    quoted_price: int,
) -> str:
    """Hash only the paid intent; revisions and phase/repair cursors are concurrency guards."""
    intent: Mapping[str, str | int] = {
        "owner_id": owner_id,
        "reset_epoch": reset_epoch,
        "instance_id": instance_id,
        "repair_kind": repair_kind,
        "quoted_level": quoted_level,
        "quoted_price": quoted_price,
    }
    canonical = json.dumps(intent, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def request_intent_fingerprint(owner_id: str, repair_kind: str, request: RepairRequest) -> str:
    """Map a validated request to stable intent fields, excluding all quote cursors and phase."""
    return intent_fingerprint(
        owner_id=owner_id,
        reset_epoch=str(request.expected_epoch),
        instance_id=str(request.instance_id),
        repair_kind=repair_kind,
        quoted_level=request.expected_level,
        quoted_price=request.quoted_price,
    )
