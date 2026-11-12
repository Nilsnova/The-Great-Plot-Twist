"""Wallet rules: the only way the server changes a player's coins.

Coins are play money. They cannot be bought, cashed out or exchanged for real prizes. Every
player starts with STARTING_BALANCE coins, which is 0. The first coins arrive later, when the
intro hands out the entry kit (reason kit_grant). One wallet and one ledger serve every money
feature.

The browser can never write a balance. Only the server does, through ONE atomic database
function (apply_wallet_transaction) that checks the balance and writes the ledger row in a
single step. This file does two things:
  1. validate_transaction checks the numbers before any network call (pure, easy to test),
  2. apply_transaction validates, asks the database to do it and returns the new balance.

Every reason has a direction. "earn" adds coins (a positive amount), "spend" takes coins away
(a negative amount) and "either" may go both ways (admin_adjust and fresh_start). The list of
reasons lives in the database table wallet_reasons. WALLET_REASONS below is its copy in Python,
and a test fails if the two differ. The database checks the direction too, so even a bug here
cannot hand out coins.

To add a reason, in one pull request: write a migration with one INSERT into wallet_reasons and
add the same (reason, direction) pair at the END of WALLET_REASONS. Never rename a reason or
change its direction.

Used by: every feature route that moves coins (the entry kit, rewards, clues, cargo, buildings,
the Island Exchange, Lantern Duels, the island and its pirate waves).

Example inside a route (a negative number takes coins away, a positive number adds them):

    new_balance = await apply_transaction(
        player.id, -50, "building_purchase", ref="order-123", admin=admin
    )

The `ref` is what makes a repeated request safe, so EVERY coin change needs one. Make it ONCE per
player action (for example the order id the browser creates when the player clicks Buy) and send
the same one again if the request is repeated. The database accepts each player + reason + ref
only once. A call without a ref is refused with a 422 before it reaches the database, and the
database refuses it too. For a grant that must happen only once per player, such as the entry
kit, use a fixed ref (for example "kit").
"""

from server.errors import ApiError
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

# A new wallet holds no coins. The database column default must be the same number.
STARTING_BALANCE = 0

# The biggest change allowed in one transaction, up or down.
MAX_DELTA = 1_000_000

# The longest `ref` the database accepts (its constraint wallet_transactions_ref_max_length).
MAX_REF_LENGTH = 120

# The three directions a reason can have. The database table wallet_reasons uses the same words.
EARN = "earn"  # always adds coins, so the amount is positive
SPEND = "spend"  # always takes coins away, so the amount is negative
EITHER = "either"  # may go both ways
DIRECTIONS = (EARN, SPEND, EITHER)

# Every reason a coin balance can change, with its direction. The SAME pairs, in the SAME order,
# are inserted into the database table wallet_reasons by the migrations (oldest first).
WALLET_REASONS = (
    ("kit_grant", EARN),
    ("clue_reward", EARN),
    ("mystery_reward", EARN),
    ("event_reward", EARN),
    ("cargo_sale", EARN),
    ("clue_purchase", SPEND),
    ("building_purchase", SPEND),
    ("admin_adjust", EITHER),
    # Added by supabase/migrations/20261106010000_island_exchange.sql (the first Island Exchange).
    # market_buy and market_sell were never used: that version was replaced before it went live.
    # A reason is never removed, so they stay. market_fee is used by both versions.
    ("market_buy", SPEND),
    ("market_sell", EARN),
    ("market_fee", SPEND),
    # Added by supabase/migrations/20261106090000_exchange_leverage.sql (the Island Exchange v2).
    ("market_stake", SPEND),
    ("market_payout", EARN),
    # Added by supabase/migrations/20261106100000_prediction_desk.sql (the prediction desk).
    ("prediction_stake", SPEND),
    ("prediction_payout", EARN),
    # Added by supabase/migrations/20261106110000_lantern_duels.sql (Lantern Duels).
    ("arena_stake", SPEND),
    ("arena_payout", EARN),
    # Added by supabase/migrations/20261110010000_islands_and_waves.sql (islands and pirate waves).
    # fresh_start is used only by the admin script scripts/admin/fresh_start.sql.
    ("pirate_loot", EARN),
    ("starting_coins", EARN),
    ("fresh_start", EITHER),
    # Added by supabase/migrations/20261111010000_market_calls.sql (the up-or-down calls).
    ("market_call_stake", SPEND),
    ("market_call_payout", EARN),
    # Added by supabase/migrations/20261111030000_tower_defense.sql (crew and the captain).
    ("crew_hire", SPEND),
    ("captain_upgrade", SPEND),
    # Added by supabase/migrations/20261112030000_captain_skills.sql (the weapon shop).
    ("weapon_purchase", SPEND),
    # Added by supabase/migrations/20261112050000_captain_revive.sql (helping a fallen captain up).
    ("captain_revive", SPEND),
    # Added by supabase/migrations/20261112060000_tech_hub.sql (the Tech hub and the wreck).
    ("tech_research", SPEND),
    ("wreck_repair", SPEND),
    # Added by supabase/migrations/20261112080000_demolish.sql (a building torn down: half back).
    ("building_refund", EARN),
    # Added by supabase/migrations/20261112120000_captain_tree.sql (a captain's respec).
    ("captain_respec", SPEND),
)


class InvalidTransaction(ApiError):
    """The amount, the reason or the reference is not allowed. Nothing was sent to the database.

    It is an ApiError, so a route that lets it escape answers 422 invalid_transaction in the
    standard error shape, not a 500.
    """

    def __init__(self, message: str) -> None:
        super().__init__(422, "invalid_transaction", message)


def find_direction(reason: object) -> str | None:
    """The direction of a reason ("earn", "spend" or "either"), or None if we do not know it."""
    for known_reason, direction in WALLET_REASONS:
        if reason == known_reason:
            return direction
    return None


def list_reason_names() -> list[str]:
    """Just the names of the reasons, in the agreed order."""
    names = []
    for name, _direction in WALLET_REASONS:
        names.append(name)
    return names


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
    """The reason must be on the agreed list, and the sign of the amount must fit its direction."""
    direction = find_direction(reason)
    if direction is None:
        allowed = ", ".join(list_reason_names())
        raise InvalidTransaction(f"Unknown reason '{reason}'. Allowed reasons: {allowed}.")
    # check_amount has already refused zero, so a number is either above or below zero here.
    if direction == EARN and delta < 0:
        raise InvalidTransaction(f"{reason} must add coins (a positive amount).")
    if direction == SPEND and delta > 0:
        raise InvalidTransaction(f"{reason} must take coins away (a negative amount).")


def check_ref(ref: str) -> None:
    """Every coin change needs a ref: non-empty text, at most MAX_REF_LENGTH characters."""
    # Python does not enforce type hints, so a caller could still pass None. Refuse it here.
    if ref is None:
        raise InvalidTransaction(
            "Every coin change needs a ref, so a repeated request cannot pay twice."
        )
    if not isinstance(ref, str) or not ref.strip():
        raise InvalidTransaction("The reference must be non-empty text.")
    if len(ref) > MAX_REF_LENGTH:
        raise InvalidTransaction(f"The reference can be at most {MAX_REF_LENGTH} characters.")


def validate_transaction(delta: int, reason: str, ref: str) -> None:
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
    ref: str,
    *,
    admin: SupabaseAdmin,
) -> int:
    """Add `delta` coins to the player's wallet (negative takes coins away).

    `ref` is required. It links the ledger row to whatever caused it, such as an order id (at
    most 120 characters). Pass one that stays the same when the request is repeated: the
    database accepts each player + reason + ref only once. Returns the new balance.

    Raises (all of them become the standard error answer in a route):
      InvalidTransaction (422)    bad amount, reason or reference, or no reference. Nothing was
                                  sent.
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
