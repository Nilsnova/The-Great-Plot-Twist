"""Arsenal rules (T40, D042): the rack size, which weapon types it sells, and the plain refusals.

Plain functions over plain values, so a test can call them without a web server or a database.
The database (supabase/migrations/20261114120000_arsenal.sql) checks every rule again under the
island lock; these functions only give a clear refusal before anything is written.

    CAPACITY                 20: the most copies one island stores (arsenal_capacity() in SQL)
    arsenal_type(...)        a type the arsenal sells (400 bad_weapon, 409 standard_weapon)
    check_buy(...)           ... and unlocked for the buyer (409 locked "Opens after wave N.")
    refusal_error(...)       the ApiError for a refusal of an arsenal_* database function

Used by: arsenal.py, routes/arsenal.py and the tests.
"""

from server.errors import ApiError
from server.island.catalogue import STARTING_WEAPON, IslandCatalogue, Weapon
from server.island.rules import locked, weapon_named
from server.supabase_admin import SupabaseRejected

CAPACITY = 20
# The musket is standard issue: every captain who carries no copy shoots with it.
STANDARD_WEAPON = STARTING_WEAPON


def arsenal_type(catalogue: IslandCatalogue, weapon: str) -> Weapon:
    """The type with this id, if the arsenal sells it. 400 bad_weapon, 409 standard_weapon."""
    entry = weapon_named(catalogue, weapon)
    if entry.weapon == STANDARD_WEAPON:
        raise ApiError(
            409, "standard_weapon", "The musket is standard issue: every captain carries one."
        )
    return entry


def check_buy(catalogue: IslandCatalogue, weapon: str, unlock_wave: int) -> Weapon:
    """The type to buy, unlocked by the buyer's own best won wave. 409 locked otherwise."""
    entry = arsenal_type(catalogue, weapon)
    if entry.unlock_wave > unlock_wave:
        raise locked(entry.unlock_wave)
    return entry


def not_enough_coins(name: str, price: int) -> ApiError:
    return ApiError(409, "insufficient_funds", f"{name} costs {price} coins. You need more coins.")


# The refusals of the arsenal_* functions that need no price or name.
PLAIN_REFUSALS = {
    "no_island": (404, "There is no island with that code."),
    "not_member": (403, "Join this game first: open its link or type its code."),
    "wave_running": (409, "A wave is under way. Use the arsenal between waves."),
    "arsenal_full": (409, f"The arsenal is full: {CAPACITY} weapons are stored already."),
    "taken": (409, "Another captain took that weapon just now."),
    "no_such_copy": (404, "That weapon is not in this arsenal."),
    "nothing_held": (409, "You carry only the musket. Take a weapon first."),
    "action_used": (409, "That click was used for something else. Try again."),
    "player_not_set_up": (404, "Your account is not ready yet. Reload the page."),
}


def refusal_error(reason: str, name: str = "This weapon", price: int = 0) -> ApiError:
    """The ApiError for a refusal of arsenal_buy, arsenal_take, arsenal_return or arsenal_state.
    Nothing was changed. An unknown reason is a 502 (the database said something we do not know)."""
    if reason == "insufficient_funds":
        return not_enough_coins(name, price)
    if reason == "locked":
        return ApiError(409, "locked", "This weapon is not unlocked for you yet. Win more waves.")
    if reason in PLAIN_REFUSALS:
        status, message = PLAIN_REFUSALS[reason]
        return ApiError(status, reason, message)
    return SupabaseRejected()
