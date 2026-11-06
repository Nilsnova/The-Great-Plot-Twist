"""Public sports board and private stake projections; no player identifiers leave these views."""

from datetime import datetime

from server.predictions.stake_rules import DAILY_STAKE_CAP, MAX_STAKE, POOL_CUT_PERCENT
from server.sports.models import Match
from server.sports.rules import closes_at, picking_open
from server.sports.store import FixtureRow, StakeRow

PLAY_MONEY = (
    "Simulation. Play money only. Coins cannot be bought, cashed out or exchanged for prizes."
)
RULES = {
    "minStake": 1,
    "maxStake": MAX_STAKE,
    "dailyCap": DAILY_STAKE_CAP,
    "poolCutPercent": POOL_CUT_PERCENT,
    "pickLeadMinutes": 60,
}


def pool_view(fixture: FixtureRow | None, stakes: list[StakeRow]) -> dict:
    sides = {}
    for stake in stakes:
        total = sides.setdefault(stake.pick, {"players": 0, "coins": 0})
        total["players"] += 1
        total["coins"] += stake.amount
    return {
        "status": "open" if fixture is None else fixture.status,
        "outcome": None if fixture is None else fixture.outcome,
        "settlement": None if fixture is None else fixture.settlement,
        "paidCoins": None if fixture is None else fixture.paid_coins,
        "cutCoins": None if fixture is None else fixture.cut_coins,
        "settledAt": None if fixture is None else fixture.settled_at,
        "total": sum(stake.amount for stake in stakes),
        "sides": sides,
    }


def fixture_view(
    match: Match, source: str, now: datetime, fixture: FixtureRow | None, stakes: list[StakeRow]
) -> dict:
    cutoff = closes_at(match) if fixture is None else min(closes_at(match), fixture.closes_at)
    return {
        "id": match.id,
        "sport": match.sport,
        "competition": match.competition,
        "home": match.home,
        "away": match.away,
        "kickoff": match.kickoff,
        "closesAt": cutoff,
        "status": match.status,
        "source": source,
        "homeScore": match.home_score,
        "awayScore": match.away_score,
        "picks": ["home", "draw", "away"] if match.sport == "football" else ["home", "away"],
        "canStake": source == "live"
        and picking_open(match, now)
        and now < cutoff
        and (fixture is None or fixture.status == "open"),
        "pool": pool_view(fixture, stakes),
    }


def my_stake_view(stake: StakeRow, fixture: FixtureRow) -> dict:
    return {
        "id": stake.id,
        "fixtureId": stake.fixture_id,
        "pick": stake.pick,
        "amount": stake.amount,
        "payout": stake.payout,
        "createdAt": stake.created_at,
        "home": fixture.home,
        "away": fixture.away,
        "sport": fixture.sport,
        "competition": fixture.competition,
        "kickoff": fixture.kickoff,
        "closesAt": fixture.closes_at,
        "status": fixture.status,
        "outcome": fixture.outcome,
        "settlement": fixture.settlement,
        "settledAt": fixture.settled_at,
    }
