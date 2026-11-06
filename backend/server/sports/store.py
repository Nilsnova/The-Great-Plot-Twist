"""Server-only sports database port: bounded reads and atomic stake/settlement RPCs.

Public responses are built separately. Player ids here always come from verified login.
"""

from dataclasses import asdict
from datetime import datetime, timedelta
from typing import Literal, Self

from pydantic import BaseModel, Field, StrictStr, ValidationError, model_validator

from server.predictions.pools import SettlementPlan
from server.predictions.stake_rules import DAILY_STAKE_CAP, MAX_STAKE, POOL_CUT_PERCENT
from server.sports.models import Match
from server.sports.rules import closes_at, outcome
from server.sports.source import FIXTURE_ID, SportsReading
from server.supabase_admin import SupabaseAdmin, SupabaseRejected


class FixtureRow(BaseModel):
    fixture_id: StrictStr
    provider: Literal["football-data.org", "balldontlie"]
    provider_match_id: int = Field(strict=True, ge=1)
    sport: Literal["football", "basketball"]
    competition: StrictStr
    home: StrictStr
    away: StrictStr
    kickoff: datetime
    closes_at: datetime
    status: Literal["open", "settled"]
    outcome: Literal["home", "draw", "away", "void"] | None = None
    settlement: StrictStr | None = None
    paid_coins: int | None = Field(default=None, strict=True, ge=0)
    cut_coins: int | None = Field(default=None, strict=True, ge=0)
    settled_at: datetime | None = None
    result_status: StrictStr | None = None
    verified_at: datetime | None = None
    home_score: int | None = Field(default=None, strict=True, ge=0, le=1000)
    away_score: int | None = Field(default=None, strict=True, ge=0, le=1000)

    @model_validator(mode="after")
    def valid_pool(self) -> Self:
        identity = FIXTURE_ID.fullmatch(self.fixture_id)
        prefix = "fd" if self.provider == "football-data.org" else "bdl"
        if (
            identity is None
            or identity.group(1) != prefix
            or int(identity.group(2)) != self.provider_match_id
            or self.kickoff.utcoffset() is None
            or self.closes_at.utcoffset() is None
        ):
            raise ValueError("Invalid fixture identity or clock.")
        if (self.provider == "football-data.org") != (self.sport == "football"):
            raise ValueError("Invalid provider sport.")
        if self.closes_at > self.kickoff - timedelta(hours=1):
            raise ValueError("A fixture must close an hour before kickoff.")
        result = Match(
            self.fixture_id,
            self.sport,
            self.competition,
            self.home,
            self.away,
            self.kickoff,
            self.result_status or "scheduled",
            self.home_score,
            self.away_score,
        )
        if self.status == "open":
            if any(
                value is not None
                for value in (
                    self.outcome,
                    self.settlement,
                    self.paid_coins,
                    self.cut_coins,
                    self.settled_at,
                    self.result_status,
                    self.verified_at,
                    self.home_score,
                    self.away_score,
                )
            ):
                raise ValueError("An open fixture cannot contain a settled result.")
        elif (
            self.outcome != outcome(result)
            or self.settlement
            not in ("winners", "refund_void", "refund_no_winners", "refund_one_sided")
            or self.paid_coins is None
            or self.cut_coins is None
            or self.settled_at is None
            or self.settled_at.utcoffset() is None
            or self.verified_at is None
            or self.verified_at.utcoffset() is None
        ):
            raise ValueError("Invalid settled fixture.")
        return self


class StakeRow(BaseModel):
    id: int = Field(strict=True, ge=1)
    fixture_id: str = Field(strict=True, pattern=r"^(fd|bdl)-[1-9][0-9]{0,14}$")
    player_id: StrictStr
    pick: Literal["home", "draw", "away"]
    amount: int = Field(strict=True, ge=1, le=MAX_STAKE)
    stake_id: str = Field(strict=True, pattern=r"^[A-Za-z0-9_-]{8,64}$")
    payout: int | None = Field(default=None, strict=True, ge=0)
    created_at: datetime

    @model_validator(mode="after")
    def aware_time(self) -> Self:
        if self.created_at.utcoffset() is None:
            raise ValueError("A stake timestamp needs a timezone.")
        return self


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The sports database answer could not be read.")


def checked(rows: object, model: type, limit: int) -> list:
    if not isinstance(rows, list) or len(rows) > limit:
        raise unreadable()
    try:
        return [model.model_validate(row) for row in rows]
    except (TypeError, ValueError, ValidationError):
        raise unreadable() from None


class SportsStore:
    def __init__(self, admin: SupabaseAdmin) -> None:
        self.admin = admin

    async def fixtures(self, ids: list[str]) -> dict[str, FixtureRow]:
        if not ids:
            return {}
        if len(ids) > 50 or any(FIXTURE_ID.fullmatch(value) is None for value in ids):
            raise ValueError("Fixture ids must be bounded provider identities.")
        rows = checked(
            await self.admin.select_rows(
                "fixtures",
                {
                    "select": "*",
                    "fixture_id": "in.(" + ",".join(ids) + ")",
                    "limit": "50",
                },
            ),
            FixtureRow,
            50,
        )
        if len({row.fixture_id for row in rows}) != len(rows) or any(
            row.fixture_id not in ids for row in rows
        ):
            raise unreadable()
        return {row.fixture_id: row for row in rows}

    async def fixture(self, fixture_id: str) -> FixtureRow | None:
        return (await self.fixtures([fixture_id])).get(fixture_id)

    async def stakes(self, fixture_ids: list[str]) -> list[StakeRow]:
        if not fixture_ids:
            return []
        if len(fixture_ids) > 50 or any(
            FIXTURE_ID.fullmatch(value) is None for value in fixture_ids
        ):
            raise ValueError("Fixture ids must be bounded provider identities.")
        rows: list[StakeRow] = []
        # PostgREST may cap a response at 1000 rows. Cursor pages prove completeness;
        # a truncated pool must never produce a payout or a misleading public total.
        for _ in range(11):
            query = {
                "select": "*",
                "fixture_id": "in.(" + ",".join(fixture_ids) + ")",
                "order": "id.asc",
                "limit": "1000",
            }
            if rows:
                query["id"] = f"gt.{rows[-1].id}"
            page = checked(await self.admin.select_rows("sports_stakes", query), StakeRow, 1000)
            if (
                any(row.fixture_id not in fixture_ids for row in page)
                or any(left.id >= right.id for left, right in zip(page, page[1:], strict=False))
                or (rows and page and page[0].id <= rows[-1].id)
            ):
                raise unreadable()
            rows.extend(page)
            if len(rows) > 10000:
                raise unreadable()
            if len(page) < 1000:
                return rows
        raise unreadable()

    async def mine(self, player_id: str) -> list[StakeRow]:
        rows = checked(
            await self.admin.select_rows(
                "sports_stakes",
                {
                    "select": "*",
                    "player_id": f"eq.{player_id}",
                    "order": "id.desc",
                    "limit": "50",
                },
            ),
            StakeRow,
            50,
        )
        if any(row.player_id != player_id for row in rows):
            raise unreadable()
        return rows

    async def stake_for_uid(self, player_id: str, stake_id: str) -> StakeRow | None:
        rows = checked(
            await self.admin.select_rows(
                "sports_stakes",
                {
                    "select": "*",
                    "player_id": f"eq.{player_id}",
                    "stake_id": f"eq.{stake_id}",
                    "limit": "1",
                },
            ),
            StakeRow,
            1,
        )
        if rows and (rows[0].player_id != player_id or rows[0].stake_id != stake_id):
            raise unreadable()
        return rows[0] if rows else None

    async def balance(self, player_id: str) -> int:
        rows = await self.admin.select_rows(
            "wallets",
            {
                "select": "balance",
                "player_id": f"eq.{player_id}",
                "limit": "1",
            },
        )
        if not isinstance(rows, list) or len(rows) != 1:
            raise unreadable()
        balance = rows[0].get("balance") if isinstance(rows[0], dict) else None
        if type(balance) is not int or balance < 0:
            raise unreadable()
        return balance

    async def today(self, player_id: str, day_start: datetime) -> int:
        rows = checked(
            await self.admin.select_rows(
                "sports_stakes",
                {
                    "select": "*",
                    "player_id": f"eq.{player_id}",
                    "created_at": f"gte.{day_start.isoformat()}",
                    "limit": "201",
                },
            ),
            StakeRow,
            200,
        )
        if any(row.player_id != player_id or row.created_at < day_start for row in rows):
            raise unreadable()
        return sum(row.amount for row in rows)

    async def place(
        self,
        player_id: str,
        pick: str,
        amount: int,
        stake_id: str,
        reading: SportsReading,
        day_start: datetime,
    ) -> dict:
        match = reading.match
        params = {
            "p_fixture_id": match.id,
            "p_player_id": player_id,
            "p_pick": pick,
            "p_amount": amount,
            "p_stake_id": stake_id,
            "p_provider": reading.provider,
            "p_provider_match_id": int(match.id.split("-")[1]),
            "p_sport": match.sport,
            "p_competition": match.competition,
            "p_home": match.home,
            "p_away": match.away,
            "p_kickoff": match.kickoff.isoformat(),
            "p_closes_at": closes_at(match).isoformat(),
            "p_max_stake": MAX_STAKE,
            "p_daily_cap": DAILY_STAKE_CAP,
            "p_day_start": day_start.isoformat(),
        }
        return await self.run("sports_place_stake", params)

    async def settle(
        self,
        fixture: FixtureRow,
        match: Match,
        result: str,
        stakes: list[StakeRow],
        plan: SettlementPlan,
    ) -> dict:
        return await self.run(
            "sports_settle_fixture",
            {
                "p_fixture_id": fixture.fixture_id,
                "p_outcome": result,
                "p_provider": fixture.provider,
                "p_provider_match_id": fixture.provider_match_id,
                "p_home_score": match.home_score,
                "p_away_score": match.away_score,
                "p_result_status": match.status,
                "p_expected_stakes": [stake.id for stake in stakes],
                "p_payouts": [asdict(payout) for payout in plan.payouts],
                "p_cut_percent": POOL_CUT_PERCENT,
            },
        )

    async def run(self, name: str, params: dict) -> dict:
        if name not in ("sports_place_stake", "sports_settle_fixture"):
            raise ValueError("Only sports intents may be called through this store.")
        reply = await self.admin.call_function(name, params)
        if not isinstance(reply, dict) or reply.get("status") not in ("done", "repeat", "refused"):
            raise unreadable()
        if reply["status"] == "refused":
            if not isinstance(reply.get("reason"), str) or not reply["reason"]:
                raise unreadable()
            return reply
        numbers = (
            ("id", "coins", "amount", "stakedToday")
            if name == "sports_place_stake"
            else (
                "paidPlayers",
                "paidCoins",
                "cutCoins",
            )
        )
        if any(type(reply.get(key)) is not int or reply[key] < 0 for key in numbers):
            raise unreadable()
        if name == "sports_place_stake" and (
            reply["id"] < 1
            or reply.get("fixtureId") != params["p_fixture_id"]
            or reply.get("pick") != params["p_pick"]
            or reply["amount"] != params["p_amount"]
        ):
            raise unreadable()
        if name == "sports_settle_fixture":
            if reply.get("settlement") not in (
                "winners",
                "refund_void",
                "refund_no_winners",
                "refund_one_sided",
            ):
                raise unreadable()
            try:
                moment = datetime.fromisoformat(reply["settledAt"])
                if moment.utcoffset() is None:
                    raise ValueError
            except (KeyError, TypeError, ValueError):
                raise unreadable() from None
        return reply
