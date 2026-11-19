"""Island ship-game cap and provenance checks, independent of runtime treasury integration."""

from dataclasses import replace
from itertools import permutations
from types import SimpleNamespace

import pytest

from server.errors import ApiError
from server.island.boat_reward_accounting import (
    BoatRewardBucket,
    BoatRewardKey,
    BoatRoundOrigin,
    plan_boat_reward,
    plan_scored_boat_reward,
)

OWNER = "00000000-0000-4000-8000-000000000001"
ACCOUNT = "00000000-0000-4000-8000-000000000002"
EPOCH = "00000000-0000-4000-8000-000000000003"
ACTOR = "00000000-0000-4000-8000-000000000004"
OTHER = "00000000-0000-4000-8000-000000000005"


def context(**changes: object) -> SimpleNamespace:
    """Structural fixture for #493's absent EconomyContext; never a production context."""
    return SimpleNamespace(**{
        "mode": "island_shared", "version": 1, "actor_id": ACTOR,
        "island_owner": OWNER, "account_id": ACCOUNT, "run_epoch": EPOCH,
        "revision": "1", **changes,
    })


def key(**changes: object) -> BoatRewardKey:
    return replace(BoatRewardKey(OWNER, ACCOUNT, EPOCH, "dash", 30), **changes)


def origin(actor: str = ACTOR, **changes: object) -> BoatRoundOrigin:
    return BoatRoundOrigin(actor, key(**changes))


def expect_error(code: str, **changes: object) -> None:
    with pytest.raises(ApiError) as caught:
        plan_boat_reward(**{
            "context": context(), "origin": origin(), "bucket": None,
            "target_coins": 12, "maximum_coins": 36, **changes,
        })
    assert caught.value.code == code


def test_ten_players_and_repeated_scores_share_one_bucket() -> None:
    bucket = None
    paid = []
    for index in range(10):
        actor = f"00000000-0000-4000-8000-{index + 20:012d}"
        plan = plan_boat_reward(context(actor_id=actor), origin(actor), bucket, 36, 36)
        paid.append(plan.coins)
        bucket = plan.bucket
    assert paid == [36] + [0] * 9
    assert bucket.paid_coins == 36


@pytest.mark.parametrize("targets", list(permutations([0, 12, 24, 36])))
def test_all_improvement_orders_are_capped_at_the_same_total(targets: tuple[int, ...]) -> None:
    bucket = None
    paid = 0
    for target in targets:
        plan = plan_boat_reward(context(), origin(), bucket, target, 36)
        assert 0 <= plan.coins <= 36
        paid += plan.coins
        bucket = plan.bucket
    assert paid == bucket.paid_coins == 36


def test_improvement_pays_only_difference_and_lower_score_does_not_reduce_paid() -> None:
    first = plan_boat_reward(context(), origin(), None, 12, 36)
    improved = plan_boat_reward(context(), origin(), first.bucket, 36, 36)
    lower = plan_boat_reward(context(), origin(), improved.bucket, 24, 36)
    assert (first.coins, improved.coins, lower.coins) == (12, 24, 0)
    assert lower.bucket.paid_coins == 36


def test_zero_score_preserves_full_remaining_reward() -> None:
    plan = plan_boat_reward(context(), origin(), None, 0, 36)
    assert (plan.coins, plan.bucket.paid_coins, plan.remaining_coins) == (0, 0, 36)


def test_record_wave_and_game_are_independent_not_claiming_player() -> None:
    first = plan_boat_reward(context(), origin(), None, 36, 36)
    next_record = plan_boat_reward(context(), origin(record_wave=31), None, 36, 36)
    other_game = plan_boat_reward(context(), origin(game="broadside"), None, 36, 36)
    assert sum(plan.coins for plan in (first, next_record, other_game)) == 108
    expect_error("invalid_transaction", bucket=first.bucket, origin=origin(record_wave=31))
    expect_error("invalid_transaction", bucket=first.bucket, origin=origin(game="broadside"))


@pytest.mark.parametrize("field", ["island_owner", "account_id", "run_epoch"])
def test_old_round_cannot_be_imported_into_another_island_account_or_epoch(field: str) -> None:
    code = "economy_epoch_mismatch" if field == "run_epoch" else "economy_mode_mismatch"
    expect_error(code, context=context(**{field: OTHER}))


def test_another_player_cannot_claim_a_bound_round() -> None:
    expect_error("invalid_transaction", context=context(actor_id=OTHER))


@pytest.mark.parametrize("changes", [
    {"mode": "personal_legacy"}, {"version": 2}, {"version": True},
])
def test_shared_reward_rules_do_not_fall_back_to_personal_money(changes: dict) -> None:
    expect_error("economy_mode_mismatch", context=context(**changes))


@pytest.mark.parametrize("field", ["account_id", "run_epoch", "island_owner", "actor_id"])
def test_missing_shared_provenance_is_refused(field: str) -> None:
    expect_error("economy_context_required", context=context(**{field: None}))


@pytest.mark.parametrize("target,maximum", [
    (-1, 36), (37, 36), (True, 36), (1.0, 36), (1, 0), (1, True), (1, 36.0),
])
def test_invalid_coin_targets_are_refused(target: object, maximum: object) -> None:
    expect_error("invalid_transaction", target_coins=target, maximum_coins=maximum)


@pytest.mark.parametrize("paid", [-1, 37, True, 1.0])
def test_corrupt_saved_paid_amount_is_refused(paid: object) -> None:
    expect_error("invalid_transaction", bucket=BoatRewardBucket(key(), 36, paid))


def test_a_reward_buckets_maximum_cannot_change_after_creation() -> None:
    expect_error("invalid_transaction", bucket=BoatRewardBucket(key(), 30, 12))


@pytest.mark.parametrize("changes", [
    {"game": "unknown"}, {"record_wave": 0}, {"record_wave": True},
    {"record_wave": 30.5}, {"account_id": ""}, {"run_epoch": "not-an-epoch"},
])
def test_invalid_round_origins_are_refused(changes: dict) -> None:
    expect_error("invalid_transaction", origin=origin(**changes))


def test_agreed_star_policy_pays_only_positive_differences() -> None:
    first = plan_scored_boat_reward(context(), origin(), None, 1)
    improved = plan_scored_boat_reward(context(), origin(), first.bucket, 3)
    repeated = plan_scored_boat_reward(context(), origin(), improved.bucket, 3)
    lower = plan_scored_boat_reward(context(), origin(), repeated.bucket, 2)
    assert [plan.coins for plan in (first, improved, repeated, lower)] == [12, 24, 0, 0]
    assert improved.bucket.maximum_coins == 36


@pytest.mark.parametrize("stars", [-1, 4, True, 1.0])
def test_scored_claims_reject_invalid_stars(stars: object) -> None:
    with pytest.raises(ApiError) as caught:
        plan_scored_boat_reward(context(), origin(), None, stars)
    assert caught.value.code == "bad_stars"


def test_later_record_rewards_use_the_bound_rounds_record_and_existing_formula_cap() -> None:
    record = plan_scored_boat_reward(context(), origin(record_wave=99), None, 3)
    maximum = plan_scored_boat_reward(context(), origin(record_wave=100), None, 3)
    capped = plan_scored_boat_reward(context(), origin(record_wave=250), None, 3)
    assert (record.coins, maximum.coins, capped.coins) == (75, 78, 78)
