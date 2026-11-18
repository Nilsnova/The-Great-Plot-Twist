"""Pure island ship-game cap plans for the future shared boat reward transaction.

Used by: test_boat_reward_accounting.py; runtime integration awaits #494/#495. A plan
must be evaluated under the bucket's database lock and committed atomically with the
common treasury credit and immutable receipt. This module performs no persistence.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import UUID

from server.errors import ApiError
from server.island.boat import BOAT, check_claim, coins_for

if TYPE_CHECKING:
    from server.island.treasury import EconomyContext


@dataclass(frozen=True)
class BoatRewardKey:
    """The original reward domain, captured by the server when a round begins."""

    island_owner: str
    account_id: str
    run_epoch: str
    game: str
    record_wave: int


@dataclass(frozen=True)
class BoatRoundOrigin:
    """Server-stored round provenance, never accepted as authority from a client."""

    actor_id: str
    key: BoatRewardKey


@dataclass(frozen=True)
class BoatRewardBucket:
    """One game's cumulative payment at one island record in its original run."""

    key: BoatRewardKey
    maximum_coins: int
    paid_coins: int


@dataclass(frozen=True)
class BoatRewardPlan:
    coins: int
    bucket: BoatRewardBucket

    @property
    def remaining_coins(self) -> int:
        return self.bucket.maximum_coins - self.bucket.paid_coins


def _invalid() -> ApiError:
    return ApiError(422, "invalid_transaction", "Invalid island boat reward.")


def _is_identifier(value: object) -> bool:
    try:
        return str(UUID(str(value))) == str(value)
    except (ValueError, AttributeError, TypeError):
        return False


def _is_whole(value: object) -> bool:
    return type(value) is int and value >= 0


def _check_origin(origin: BoatRoundOrigin) -> None:
    key = origin.key
    identifiers = (origin.actor_id, key.island_owner, key.account_id, key.run_epoch)
    if not all(_is_identifier(value) for value in identifiers):
        raise _invalid()
    if key.game not in BOAT.games or not _is_whole(key.record_wave) or key.record_wave < 1:
        raise _invalid()


def _check_context(context: EconomyContext, origin: BoatRoundOrigin) -> None:
    if context.mode != "island_shared" or type(context.version) is not int or context.version != 1:
        raise ApiError(409, "economy_mode_mismatch", "Shared island economy is required.")
    identifiers = (context.actor_id, context.island_owner, context.account_id, context.run_epoch)
    if not all(_is_identifier(value) for value in identifiers):
        raise ApiError(409, "economy_context_required", "An island economy context is required.")
    key = origin.key
    if str(context.island_owner) != key.island_owner or str(context.account_id) != key.account_id:
        raise ApiError(409, "economy_mode_mismatch", "The boat round belongs to another account.")
    if str(context.run_epoch) != key.run_epoch:
        raise ApiError(409, "economy_epoch_mismatch", "The boat round belongs to another run.")
    if str(context.actor_id) != origin.actor_id:
        raise _invalid()


def plan_boat_reward(
    context: EconomyContext,
    origin: BoatRoundOrigin,
    bucket: BoatRewardBucket | None,
    target_coins: int,
    maximum_coins: int,
) -> BoatRewardPlan:
    """Plan a positive cumulative difference without granting money or authorizing a claim.

    Origin, target, and maximum must come from a trusted round record and product
    verifier. The transaction must check current membership, receipts, and eligibility
    and serialize bucket updates. Targets implement no default scoring policy here.
    """
    _check_origin(origin)
    _check_context(context, origin)
    if not _is_whole(maximum_coins) or maximum_coins < 1:
        raise _invalid()
    if not _is_whole(target_coins) or target_coins > maximum_coins:
        raise _invalid()
    paid = 0
    if bucket is not None:
        if bucket.key != origin.key or bucket.maximum_coins != maximum_coins:
            raise _invalid()
        if not _is_whole(bucket.maximum_coins) or not _is_whole(bucket.paid_coins):
            raise _invalid()
        if bucket.paid_coins > maximum_coins:
            raise _invalid()
        paid = bucket.paid_coins
    cumulative = max(paid, target_coins)
    updated = BoatRewardBucket(origin.key, maximum_coins, cumulative)
    return BoatRewardPlan(cumulative - paid, updated)


def plan_scored_boat_reward(
    context: EconomyContext,
    origin: BoatRoundOrigin,
    bucket: BoatRewardBucket | None,
    stars: int,
) -> BoatRewardPlan:
    """Compute the agreed score-improvement reward using the existing boat formula.

    The trusted origin fixes the record at round start, so a later island record
    cannot increase this round's reward. The current score claim is range checked;
    this does not prove that the browser actually achieved that score.
    """
    _check_origin(origin)
    check_claim(origin.key.game, stars)
    maximum = coins_for(BOAT.stars, origin.key.record_wave)
    target = coins_for(stars, origin.key.record_wave)
    return plan_boat_reward(context, origin, bucket, target, maximum)
