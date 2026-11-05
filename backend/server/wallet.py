"""Wallet rules: the only way the server changes a player's coins.

Coins are play money. They cannot be bought or cashed out. Every player starts with
STARTING_BALANCE coins. One wallet and one ledger serve every money feature (stock exchange,
prediction markets, sports predictions, arena stakes).

The browser can never write a balance. Only the server does, through ONE atomic database
function (apply_wallet_transaction) that checks the balance and writes the ledger row in a
single step. This file does two things:
  1. validate_transaction checks the numbers before any network call (pure, easy to test),
  2. apply_transaction validates, asks the database to do it and returns the new balance.

Every reason has a direction. A purchase or a stake takes coins away (a negative amount). A
grant, a sale or a payout adds coins (a positive amount). Only admin_adjust may go either way.
The database checks the same rule, so even a bug here cannot hand out coins.

Used by: every feature route that moves coins (market, predictions, sports, arena).

Example inside a route (a negative number takes coins away, a positive number adds them):

    new_balance = await apply_transaction(
        player.id, -50, "market_buy", ref="order-123", admin=admin
    )

The `ref` is what makes a repeated request safe. Make it ONCE per player action (for example
the order id the browser creates when the player clicks Buy) and send the same one again if the
request is repeated. The database accepts each player + reason + ref only once.
"""

from server.errors import ApiError
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

STARTING_BALANCE = 1000

# The biggest change allowed in one transaction, up or down.
MAX_DELTA = 1_000_000

# The longest `ref` the database accepts (its constraint wallet_transactions_ref_max_length).
MAX_REF_LENGTH = 120

# Every reason a coin balance can change. The SAME list, in the SAME order, is in the database.
REASONS = (
    "starting_grant",
    "market_buy",
    "market_sell",
    "prediction_stake",
    "prediction_payout",
    "sports_stake",
    "sports_payout",
    "arena_stake",
    "arena_payout",
    "admin_adjust",
)

# Reasons that always take coins away (a negative amount). The database has the same list.
SPEND_REASONS = ("market_buy", "prediction_stake", "sports_stake", "arena_stake")

# Reasons that always add coins (a positive amount). The database has the same list.
# admin_adjust is in neither list: it may go either way.
EARN_REASONS = (
    "starting_grant",
    "market_sell",
    "prediction_payout",
    "sports_payout",
    "arena_payout",
)

# Only the sign-up trigger in the database writes this reason, so the server refuses it.
SIGN_UP_ONLY_REASON = "starting_grant"


class InvalidTransaction(ApiError):
    """The amount, the reason or the reference is not allowed. Nothing was sent to the database.

    It is an ApiError, so a route that lets it escape answers 422 invalid_transaction in the
    standard error shape, not a 500.
    """

    def __init__(self, message: str) -> None:
        super().__init__(422, "invalid_transaction", message)


def check_amount(delta: int) -> None:
    """The amount must be a whole number of coins, not zero and not too big."""
    # bool is a kind of int in Python (True == 1), so it needs its own check.
    if isinstance(delta, bool) or not isinstance(delta, int):
        raise InvalidTransaction("The amount must be a whole number of coins.")
    if delta == 0:
        raise InvalidTransaction("The amount cannot be zero.")
    if abs(delta) > MAX_DELTA:
        raise InvalidTransaction(f"The amount cannot be more than {MAX_DELTA} coins either way.")


def check_reason(delta: int, reason: str) -> None:
    """The reason must be on the agreed list, and the sign of the amount must fit it."""
    if reason not in REASONS:
        allowed = ", ".join(REASONS)
        raise InvalidTransaction(f"Unknown reason '{reason}'. Allowed reasons: {allowed}.")
    if reason == SIGN_UP_ONLY_REASON:
        raise InvalidTransaction(f"{reason} is written only by the sign-up trigger.")
    if reason in SPEND_REASONS and delta > 0:
        raise InvalidTransaction(f"{reason} must take coins away (a negative amount).")
    if reason in EARN_REASONS and delta < 0:
        raise InvalidTransaction(f"{reason} must add coins (a positive amount).")


def check_ref(ref: str | None) -> None:
    """The reference is optional, but if it is there it must be short text."""
    if ref is not None and not isinstance(ref, str):
        raise InvalidTransaction("The reference must be text.")
    if ref is not None and len(ref) > MAX_REF_LENGTH:
        raise InvalidTransaction(f"The reference can be at most {MAX_REF_LENGTH} characters.")


def validate_transaction(delta: int, reason: str, ref: str | None = None) -> None:
    """Check a coin change. Raises InvalidTransaction if it is not allowed."""
    check_amount(delta)
    check_reason(delta, reason)
    check_ref(ref)


def read_new_balance(reply: object) -> int:
    """The database function returns the new balance as a plain whole number."""
    if isinstance(reply, bool) or not isinstance(reply, int):
        raise SupabaseRejected("The database sent a balance we could not understand.")
    return reply


async def apply_transaction(
    player_id: str,
    delta: int,
    reason: str,
    ref: str | None = None,
    *,
    admin: SupabaseAdmin,
) -> int:
    """Add `delta` coins to the player's wallet (negative takes coins away).

    `ref` links the ledger row to whatever caused it, such as an order id (at most 120
    characters). Pass one that stays the same when the request is repeated: the database
    accepts each player + reason + ref only once. Returns the new balance.

    Raises (all of them become the standard error answer in a route):
      InvalidTransaction (422)    bad amount, reason or reference. Nothing was sent.
      InsufficientFunds (409)     the player cannot afford it.
      AlreadyApplied (409)        this player + reason + ref was done before. Nothing changed.
      SupabaseUnavailable (503)   the OUTCOME IS UNKNOWN: the call may have been saved before it
                                  timed out. Look the ref up in the ledger before you retry,
                                  refund or charge again. Never assume the coins did not move.
    """
    validate_transaction(delta, reason, ref)
    reply = await admin.call_function(
        "apply_wallet_transaction",
        {"p_player_id": player_id, "p_delta": delta, "p_reason": reason, "p_ref": ref},
    )
    return read_new_balance(reply)
