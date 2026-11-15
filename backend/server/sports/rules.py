"""Pure match outcomes, kickoff cutoff and the match board's money rules. No wallet writes.

The money rules, in plain words (decision D050, owner request 15 Nov 2026)
  * One stake is 1 to 10,000 whole coins, one stake per player and match, at most 25,000 coins
    staked per Lisbon day (the day starts at midnight Lisbon time).
  * Fixed even odds, no shared pool: a right pick pays 2 x the stake (the stake back plus the
    same again), a wrong pick pays 0, and a postponed, cancelled or suspended match ("void")
    pays the stake back. No coins are cut.

These numbers are the match board's own. The prediction desk keeps its numbers in
predictions/stake_rules.py; the market stall keeps its own in market/calls.py. The database
function sports_settle_fixture() repeats the payout rule (migration
20261115120000_bigger_stakes.sql) and refuses any other plan; sports_place_stake() is given
MAX_STAKE and DAILY_STAKE_CAP.
"""

from datetime import datetime, timedelta

from server.predictions.pools import REFUND_VOID, VOID, WINNERS, Payout, SettlementPlan, Stake
from server.sports.models import Match, aware

# L5 also closes at least an hour before the event.
PICK_LEAD_TIME = timedelta(hours=1)
REFUND_STATUSES = ("postponed", "cancelled", "suspended")

# --- The match board's money rules (D050). Change them here and in the migration's checks. ---
MIN_STAKE = 1  # coins
MAX_STAKE = 10_000  # coins on one match
DAILY_STAKE_CAP = 25_000  # coins per Lisbon day, counted from sports_stakes
PAYOUT_MULTIPLIER = 2  # a right pick gets back this many times its stake


def coins_left_today(staked_today: int) -> int:
    """The coins a player may still stake on matches today. Never below 0."""
    return max(0, DAILY_STAKE_CAP - staked_today)


def plan_payouts(stakes: list[Stake], result: str) -> SettlementPlan:
    """Who gets how many coins when a match is decided: double or nothing, or a refund.

    `result` is "home", "draw", "away" or "void". A void match gives every stake back
    ("refund_void"). Otherwise ("winners") each right pick gets PAYOUT_MULTIPLIER x its stake
    and a wrong pick gets nothing, so it has no Payout. Even when nobody picked right, or
    everybody did, the same rule holds. The cut is always 0.
    """
    if result == VOID:
        payouts = [Payout(stake.row_id, stake.player_id, stake.amount) for stake in stakes]
        settlement = REFUND_VOID
    else:
        payouts = [
            Payout(stake.row_id, stake.player_id, stake.amount * PAYOUT_MULTIPLIER)
            for stake in stakes
            if stake.side == result
        ]
        settlement = WINNERS
    return SettlementPlan(settlement, 0, tuple(sorted(payouts, key=lambda payout: payout.row_id)))


def validate_pick(match: Match, pick: str) -> None:
    """Football has three picks; NBA has no draw. A pick never supplies the result."""
    allowed = ("home", "draw", "away") if match.sport == "football" else ("home", "away")
    if pick not in allowed:
        raise ValueError("That pick is not an outcome for this sport.")


def closes_at(match: Match) -> datetime:
    return match.kickoff - PICK_LEAD_TIME


def picking_open(match: Match, now: datetime) -> bool:
    aware(now)
    return match.status == "scheduled" and now < closes_at(match)


def outcome(match: Match) -> str | None:
    """A final winner, void for a disrupted fixture, or None while the result is unknown.

    This does not establish source freshness or authority. A route must not settle
    a live pool from recorded/stale data merely because that data has a final score.
    """
    if match.status in REFUND_STATUSES:
        return "void"
    if match.status != "finished":
        return None
    if match.home_score == match.away_score:
        return "draw"
    return "home" if match.home_score > match.away_score else "away"
