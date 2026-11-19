"""Exact shared-island wager terms. Used by Harbor integration and focused tests.

These advisory rules never reserve money. Product creation and treasury reservation must be
one database transaction using the common economy authority, epoch and lock order.
"""

from dataclasses import dataclass

from server.errors import ApiError
from server.market.calls import asset_name
from server.sports.source import FIXTURE_ID

BASIS_POINTS = 10_000
SUPPORTED_PRODUCTS = ("market_call", "football")


def invalid_transaction() -> ApiError:
    return ApiError(
        422, "invalid_transaction", "Wagers require valid whole-coin amounts and terms."
    )


def nonnegative_whole(value: object) -> int:
    """Reject coercion, especially bools and rounded floating-point coin values."""
    if type(value) is not int or value < 0:
        raise invalid_transaction()
    return value


def validate_stake(stake: object) -> int:
    value = nonnegative_whole(stake)
    if value == 0:
        raise invalid_transaction()
    return value


def require_supported_product(product: str) -> None:
    if product not in SUPPORTED_PRODUCTS:
        raise ApiError(
            409, "economy_path_unavailable", "This product has no shared island accounting path."
        )


@dataclass(frozen=True)
class WagerIntent:
    """Client-controlled product terms for comparison with a persisted original intent.

    This is neither a receipt nor authority. Account/epoch/actor and operation identity are
    checked by the common treasury and permission implementations under database locks.
    """

    product: str
    event_id: str
    selection: str
    stake: int

    def __post_init__(self) -> None:
        require_supported_product(self.product)
        validate_stake(self.stake)
        if not isinstance(self.event_id, str) or not isinstance(self.selection, str):
            raise invalid_transaction()
        if self.product == "market_call":
            valid = asset_name(self.event_id) is not None and self.selection in ("up", "down")
        else:
            identity = FIXTURE_ID.fullmatch(self.event_id)
            valid = identity is not None and identity.group(1) == "fd"
            valid = valid and self.selection in ("home", "draw", "away")
        if not valid:
            raise invalid_transaction()


def require_matching_replay(original: WagerIntent, submitted: WagerIntent) -> None:
    if original != submitted:
        raise ApiError(
            409, "idempotency_conflict", "This operation identity belongs to different wager terms."
        )


def opening_cost(
    stake: object, available_coins: object, *, fee_basis_points: object = 0
) -> tuple[int, int]:
    """Return principal and opening fee, without imposing legacy wallet/gameplay limits."""
    principal = validate_stake(stake)
    available = nonnegative_whole(available_coins)
    rate = nonnegative_whole(fee_basis_points)
    fee = (principal * rate + BASIS_POINTS - 1) // BASIS_POINTS
    if principal + fee > available:
        raise ApiError(
            409, "insufficient_funds", "The stake and fee exceed available island funds."
        )
    return principal, fee


def all_in_stake(available_coins: object, *, fee_basis_points: object = 0) -> int:
    """Largest principal whose principal plus rounded-up opening fee fits free funds.

    For integer available A, s + ceil(s*r/D) <= A iff s <= floor(A*D/(D+r)).
    A zero quote means no positive stake fits, rather than an accepted zero-coin bet.
    """
    available = nonnegative_whole(available_coins)
    rate = nonnegative_whole(fee_basis_points)
    return available * BASIS_POINTS // (BASIS_POINTS + rate)
