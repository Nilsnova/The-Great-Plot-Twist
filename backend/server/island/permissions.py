"""Co-op permissions (T37 and T42, proposed decision D043): who may act on a game's island, and
who pays for it.

A game is an island (games.py). Its HOST is the island's owner. A MEMBER has an island_members
row without left_at. Everybody else is an OUTSIDER. Being online is not a role: the server never
knows who is online (presence lives in the browsers' room), so no rule here depends on it.

    ACTIONS           the role/action matrix as data: who may act, how it is paid, between waves?
    role_of()         host, member or outsider (pure)
    allows()          whether a role may do an action (pure)
    payer_of()        who pays: always the player who clicked, or nobody. Never the host, never
                      the island: there is no shared wallet (D043)
    require_action()  THE helper for routes and other lanes: checks the caller and answers a
                      Permit (their role and who pays), or raises 403 not_member with a sentence
                      that names the action

What stays where it was: the database functions check membership and "no wave running" again
under their own locks, so a member who leaves at the same moment cannot slip through; this file
is the one place the Python side asks the question. Prices, levels and unlocks stay in rules.py.

Used by: service.py (build, upgrade, research, tower skills, the wreck, tear-down, visit),
waves.py (the bell, joining a wave, helping a captain up), the arsenal lane (T40) and the tests.
"""

from dataclasses import dataclass

from server.errors import ApiError
from server.island import games
from server.supabase_admin import SupabaseAdmin

HOST = "host"
MEMBER = "member"
OUTSIDER = "outsider"
HOST_AND_MEMBERS = frozenset({HOST, MEMBER})

# How an action is paid for.
PERSONAL = "personal"  # the clicker's own wallet, nobody else's
FREE = "free"  # no coins move
REFUND_TO_PAYERS = "refund_to_payers"  # tear-down: each payer gets half of what THEY paid back

# The island actions. The names are stable: other lanes import them.
ISLAND_VISIT = "island_visit"
BUILD = "island_build"
UPGRADE = "island_upgrade"
RESEARCH = "island_research"
TOWER_SKILL = "island_tower_skill"
WRECK = "island_wreck"
DEMOLISH = "island_demolish"
WAVE_START = "wave_start"
WAVE_JOIN = "wave_join"
WAVE_REVIVE = "wave_revive"
# Reserved for T31/T32 (persistent repair and rebuild) and T40 (the shared arsenal).
REPAIR = "structure_repair"
REBUILD = "structure_rebuild"
ARSENAL_BUY = "arsenal_buy"
ARSENAL_WITHDRAW = "arsenal_withdraw"
ARSENAL_RETURN = "arsenal_return"


@dataclass(frozen=True)
class Rule:
    """One row of the matrix."""

    phrase: str  # finishes "Join this game first to ...": the refusal names the action
    funding: str  # PERSONAL, FREE or REFUND_TO_PAYERS
    between_waves: bool = False  # the database refuses it while a wave runs (wave_running)
    roles: frozenset[str] = HOST_AND_MEMBERS


@dataclass(frozen=True)
class Permit:
    """What require_action() answers: the caller's role, and who pays (None: nobody pays)."""

    role: str
    payer: str | None


ACTIONS: dict[str, Rule] = {
    ISLAND_VISIT: Rule("look at this island", FREE),
    BUILD: Rule("build here", PERSONAL),
    UPGRADE: Rule("upgrade buildings here", PERSONAL),
    RESEARCH: Rule("research at this Tech hub", PERSONAL, between_waves=True),
    TOWER_SKILL: Rule("choose tower skills and house roles here", FREE),
    WRECK: Rule("repair this wreck", PERSONAL),
    DEMOLISH: Rule("tear buildings down here", REFUND_TO_PAYERS, between_waves=True),
    WAVE_START: Rule("ring the bell here", FREE),
    WAVE_JOIN: Rule("defend this island", FREE),
    WAVE_REVIVE: Rule("help a captain up here", PERSONAL),
    REPAIR: Rule("repair buildings here", PERSONAL),
    REBUILD: Rule("rebuild buildings here", PERSONAL),
    ARSENAL_BUY: Rule("buy weapons for this arsenal", PERSONAL),
    ARSENAL_WITHDRAW: Rule("take weapons from this arsenal", FREE),
    ARSENAL_RETURN: Rule("return weapons to this arsenal", FREE),
}


def rule_of(action: str) -> Rule:
    """The row of `action`. An unknown name is a bug in our code, not a player's mistake."""
    if action not in ACTIONS:
        raise ValueError(f"Unknown island action: {action}")
    return ACTIONS[action]


def role_of(owner: str, player_id: str, is_member: bool) -> str:
    """The caller's role in the game of the island that `owner` hosts."""
    if player_id == owner:
        return HOST
    if is_member:
        return MEMBER
    return OUTSIDER


def allows(action: str, role: str) -> bool:
    return role in rule_of(action).roles


def payer_of(action: str, player_id: str) -> str | None:
    """Who pays for `action`: the clicker for a personal action, nobody otherwise. A refund goes
    back to the original payers (the database works out each share). No shared wallet."""
    if rule_of(action).funding == PERSONAL:
        return player_id
    return None


def refusal(action: str) -> ApiError:
    """The 403 for an outsider. The code stays not_member, so existing clients keep working."""
    phrase = rule_of(action).phrase
    return ApiError(
        403, "not_member", f"Join this game first to {phrase}: open its link or type its code."
    )


async def require_action(admin: SupabaseAdmin, owner: str, player_id: str, action: str) -> Permit:
    """Check that `player_id` may do `action` on the island `owner` hosts. The host is never
    asked about in the database. 403 not_member for an outsider or a member who left."""
    rule_of(action)  # an unknown action fails before any database call
    is_member = player_id != owner and await games.is_member_of(admin, owner, player_id)
    role = role_of(owner, player_id, is_member)
    if not allows(action, role):
        raise refusal(action)
    return Permit(role, payer_of(action, player_id))
