"""Sports pools: verified live results decide atomic play-money stakes and payouts.

Opening My Stakes refreshes completed games. No background job, client outcome or recorded
result authorizes payment. The SQL function recomputes every settlement independently.
"""

import httpx

from server.clock import Clock, utc_now
from server.errors import ApiError
from server.predictions.pools import Stake, plan_settlement
from server.predictions.stake_rules import (
    DAILY_STAKE_CAP,
    MAX_STAKE,
    POOL_CUT_PERCENT,
    desk_day_start,
)
from server.settings import Settings
from server.sports.rules import outcome, picking_open, validate_pick
from server.sports.source import SportsSource, unavailable
from server.sports.store import SportsStore, unreadable
from server.sports.views import PLAY_MONEY, RULES, fixture_view, my_stake_view
from server.supabase_admin import SupabaseAdmin


def refusal(reply: dict) -> None:
    if reply.get("status") != "refused":
        return
    reason = {
        "fixture_closed": "pool_closed",
        "player_missing": "player_not_set_up",
        "fixture_missing": "no_such_fixture",
    }.get(reply["reason"], reply["reason"])
    if reason == "insufficient_funds":
        raise ApiError(409, reason, "You do not have enough play coins.")
    allowed = {
        "pool_closed",
        "already_staked",
        "daily_cap",
        "stake_id_conflict",
        "fixture_changed",
        "stakes_changed",
        "already_settled",
        "result_pending",
        "player_not_set_up",
        "no_such_fixture",
    }
    if reason not in allowed:
        raise unreadable()
    raise ApiError(
        404 if reason in ("player_not_set_up", "no_such_fixture") else 409,
        reason,
        "The sports request could not be completed. Refresh and try again.",
    )


class SportsService:
    def __init__(self, source: SportsSource, *, clock: Clock = utc_now) -> None:
        self.source = source
        self.clock = clock

    async def board(self, admin: SupabaseAdmin) -> dict:
        board = await self.source.board()
        store = SportsStore(admin)
        ids = [match.id for match in board.matches]
        # Historical recordings have their own identities and are read-only without a pool.
        fixtures = {} if board.source == "recorded" else await store.fixtures(ids)
        stakes = [] if board.source == "recorded" else await store.stakes(ids)
        return {
            "fixtures": [
                fixture_view(
                    match,
                    board.source,
                    self.clock(),
                    fixtures.get(match.id),
                    [stake for stake in stakes if stake.fixture_id == match.id],
                )
                for match in board.matches
            ],
            "source": board.source,
            "provider": board.provider,
            "fetchedAt": board.fetched_at,
            "attribution": board.attribution,
            "rules": RULES,
            "simulationNote": PLAY_MONEY,
        }

    async def stake(
        self,
        admin: SupabaseAdmin,
        player_id: str,
        fixture_id: str,
        pick: str,
        amount: int,
        stake_id: str,
    ) -> dict:
        if type(amount) is not int or not 1 <= amount <= MAX_STAKE:
            raise ApiError(422, "invalid_amount", f"Stake 1 to {MAX_STAKE} whole play coins.")
        store = SportsStore(admin)
        previous = await store.stake_for_uid(player_id, stake_id)
        if previous is not None:
            if (previous.fixture_id, previous.pick, previous.amount) != (fixture_id, pick, amount):
                raise ApiError(
                    409, "stake_id_conflict", "That stake id belongs to another request."
                )
            return {
                "accepted": True,
                "repeat": True,
                "id": previous.id,
                "fixtureId": fixture_id,
                "pick": pick,
                "amount": amount,
                "coins": await store.balance(player_id),
                "simulationNote": PLAY_MONEY,
            }
        board = await self.source.board()
        if board.source != "live":
            raise unavailable()
        if fixture_id not in {match.id for match in board.matches}:
            raise ApiError(
                404, "no_such_fixture", "That fixture is not on the current sports board."
            )
        reading = await self.source.match(fixture_id)
        match = reading.match
        try:
            validate_pick(match, pick)
        except ValueError:
            raise ApiError(
                422, "invalid_pick", "That pick is not available for this sport."
            ) from None
        if reading.source != "live" or not picking_open(match, self.clock()):
            raise ApiError(409, "pool_closed", "Staking is closed for that fixture.")
        reply = await store.place(
            player_id, pick, amount, stake_id, reading, desk_day_start(self.clock())
        )
        refusal(reply)
        return {
            "accepted": True,
            "repeat": reply["status"] == "repeat",
            **{
                key: reply[key]
                for key in ("id", "fixtureId", "pick", "amount", "coins", "stakedToday")
            },
            "simulationNote": PLAY_MONEY,
        }

    async def settle(self, admin: SupabaseAdmin, player_id: str, fixture_id: str) -> dict:
        self.source.require_live()
        store = SportsStore(admin)
        fixture = await store.fixture(fixture_id)
        stakes = await store.stakes([fixture_id]) if fixture is not None else []
        if fixture is None or not any(stake.player_id == player_id for stake in stakes):
            raise ApiError(404, "no_such_fixture", "You have no stake in that fixture.")
        if fixture.provider != self.source.provider_name:
            raise unavailable()
        if fixture.status == "settled":
            return {
                "settled": True,
                "repeat": True,
                "fixtureId": fixture_id,
                "settlement": fixture.settlement,
                "paidCoins": fixture.paid_coins,
                "cutCoins": fixture.cut_coins,
                "settledAt": fixture.settled_at,
            }
        reading = await self.source.match(fixture_id, fresh=True)
        match = reading.match
        if (
            reading.source != "live"
            or reading.provider != fixture.provider
            or (match.id, match.sport, match.competition, match.home, match.away)
            != (fixture.fixture_id, fixture.sport, fixture.competition, fixture.home, fixture.away)
        ):
            raise unavailable()
        result = outcome(match)
        if result is None or (match.status == "finished" and self.clock() < match.kickoff):
            raise ApiError(409, "result_pending", "A verified final result is not available yet.")
        plan = plan_settlement(
            [Stake(stake.id, stake.player_id, stake.pick, stake.amount) for stake in stakes],
            result,
            POOL_CUT_PERCENT,
        )
        reply = await store.settle(fixture, match, result, stakes, plan)
        refusal(reply)
        return {
            "settled": True,
            "repeat": reply["status"] == "repeat",
            "fixtureId": fixture_id,
            **{
                key: reply[key]
                for key in ("settlement", "paidPlayers", "paidCoins", "cutCoins", "settledAt")
            },
        }

    async def mine(self, admin: SupabaseAdmin, player_id: str) -> dict:
        self.source.require_live()
        store = SportsStore(admin)
        stakes = await store.mine(player_id)
        ids = list(dict.fromkeys(stake.fixture_id for stake in stakes))
        fixtures = await store.fixtures(ids)
        checks_unavailable = False
        for fixture_id in ids:
            if fixture_id not in fixtures:
                raise unreadable()
            if fixtures[fixture_id].status == "settled":
                continue
            try:
                await self.settle(admin, player_id, fixture_id)
            except ApiError as error:
                if error.code not in ("result_pending", "sports_unavailable", "stakes_changed"):
                    raise
                checks_unavailable |= error.code == "sports_unavailable"
        stakes = await store.mine(player_id)
        # A concurrent stake may add a fixture while result checks are running. Metadata
        # must cover this final stake snapshot, including the empty-to-first-stake case.
        ids = list(dict.fromkeys(stake.fixture_id for stake in stakes))
        fixtures = await store.fixtures(ids)
        if any(stake.fixture_id not in fixtures for stake in stakes):
            raise unreadable()
        today = await store.today(player_id, desk_day_start(self.clock()))
        return {
            "coins": await store.balance(player_id),
            "stakedToday": today,
            "coinsLeftToday": max(0, DAILY_STAKE_CAP - today),
            "stakes": [my_stake_view(stake, fixtures[stake.fixture_id]) for stake in stakes],
            "checksUnavailable": checks_unavailable,
            "rules": RULES,
            "simulationNote": PLAY_MONEY,
        }


def sports_from_settings(
    settings: Settings, *, clock: Clock = utc_now, transport: httpx.AsyncBaseTransport | None = None
) -> SportsService:
    return SportsService(SportsSource(settings, clock=clock, transport=transport), clock=clock)
