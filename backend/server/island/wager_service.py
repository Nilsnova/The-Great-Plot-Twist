"""Trusted source adapters for shared wagers. Prepared for Harbor route integration.

No adapter accepts a client account, price, result or payout. Original receipts are resolved
before current membership or fresh source checks. SQL rechecks authority and funds atomically.
"""

from server.errors import ApiError
from server.island import wager_store
from server.island.economy_permissions import require_economy_action
from server.island.treasury import identifier
from server.island.wager_rules import WagerIntent, require_supported_product
from server.island.wager_store import WagerReply
from server.market.calls import is_live, market_closed, no_such_asset
from server.market.exchange import MarketService
from server.market.states import CompanyState
from server.sports.source import SportsReading, SportsSource
from server.supabase_admin import SupabaseAdmin, SupabaseRejected


def market_evidence(state: CompanyState) -> dict:
    reading = state.reading
    return {"asset": state.company.id, "source": reading.source,
            "price": format(reading.price, "f") if reading.price is not None else None,
            "quotedAt": reading.quoted_at.isoformat() if reading.quoted_at else None,
            "fetchedAt": reading.fetched_at.isoformat() if reading.fetched_at else None}


def football_evidence(reading: SportsReading) -> dict:
    match = reading.match
    return {"provider": reading.provider, "source": reading.source,
            "fixtureId": match.id, "sport": match.sport, "status": match.status,
            "kickoff": match.kickoff.isoformat(), "fetchedAt": reading.fetched_at.isoformat(),
            "homeScore": match.home_score, "awayScore": match.away_score}


async def open_market_call(
    admin: SupabaseAdmin, market: MarketService, actor_id: str, island_owner: str,
    run_epoch: str, action_uid: str, asset: str, direction: str, stake: int,
) -> WagerReply:
    intent = WagerIntent("market_call", asset, direction, stake)
    prior = await wager_store.find_replay(
        admin, actor_id, island_owner, run_epoch, action_uid, intent,
    )
    if prior is not None:
        return prior
    await require_economy_action(
        admin, actor_id, island_owner, "island_bet", expected_epoch=run_epoch,
    )
    company = market.find_company(asset)
    if company is None:
        raise no_such_asset()
    state = await market.fresh_state(company, await market.is_relit(admin))
    if not is_live(state):
        raise market_closed(company.name)
    return await wager_store.open_wager(
        admin, actor_id, island_owner, run_epoch, action_uid, intent, market_evidence(state),
    )


async def open_football_bet(
    admin: SupabaseAdmin, source: SportsSource, actor_id: str, island_owner: str,
    run_epoch: str, action_uid: str, fixture_id: str, pick: str, stake: int,
) -> WagerReply:
    intent = WagerIntent("football", fixture_id, pick, stake)
    prior = await wager_store.find_replay(
        admin, actor_id, island_owner, run_epoch, action_uid, intent,
    )
    if prior is not None:
        return prior
    await require_economy_action(
        admin, actor_id, island_owner, "island_bet", expected_epoch=run_epoch,
    )
    reading = await source.match(fixture_id, fresh=True)
    return await wager_store.open_wager(
        admin, actor_id, island_owner, run_epoch, action_uid, intent, football_evidence(reading),
    )


async def product_identity(admin: SupabaseAdmin, wager_id: str) -> tuple[str, str]:
    wager_id = identifier(wager_id)
    rows = await admin.select_rows("island_wagers", {
        "select": "id,product,event_id", "id": "eq." + wager_id, "limit": "1",
    })
    if rows == []:
        raise ApiError(404, "no_such_wager", "This shared wager does not exist.")
    if (not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict)
            or set(rows[0]) != {"id", "product", "event_id"} or rows[0]["id"] != wager_id
            or not isinstance(rows[0]["event_id"], str)):
        raise SupabaseRejected("The database sent unreadable wager metadata.")
    require_supported_product(rows[0]["product"])
    return rows[0]["product"], rows[0]["event_id"]


async def settle_market_call(
    admin: SupabaseAdmin, market: MarketService, wager_id: str,
) -> WagerReply:
    product, asset = await product_identity(admin, wager_id)
    if product != "market_call":
        raise ApiError(409, "economy_path_unavailable", "This is not a market call.")
    snapshot = await market.snapshot(admin, trading_enabled=True)
    state = snapshot.find(asset)
    evidence = market_evidence(state) if state else None
    return await wager_store.settle_wager(admin, wager_id, evidence)


async def settle_football_bet(
    admin: SupabaseAdmin, source: SportsSource, wager_id: str,
) -> WagerReply:
    product, fixture_id = await product_identity(admin, wager_id)
    if product != "football":
        raise ApiError(409, "economy_path_unavailable", "This is not a football bet.")
    reading = await source.match(fixture_id, fresh=True)
    return await wager_store.settle_wager(admin, wager_id, football_evidence(reading))
