"""Up-or-down market calls: the simple Harbor market stall (decision D034).

"Will Bitcoin be higher in an hour?" A player picks an asset, up or down, and a stake of 5, 10 or
25 coins. One hour later the call is decided: right pays twice the stake, wrong pays nothing, the
same price pays the stake back. It replaces the leverage positions in the game.

    look()       the five assets with their price now, the player's calls and coins. Every open
                 call past its settle time is decided first (lazy settlement, see below).
    open_call()  one new call, at the live price now

The prices come from the Island Exchange feed (MarketService): Binance for Bitcoin, Ether and Gold
(PAXG), the stock source for Apple and NVIDIA. An asset is open for new calls only while the feed
holds a live price for it (the market is open, the price is fresh, not the demo recording).

Lazy settlement, and its limit. Nothing runs in the background: a call is decided when its player
next reads GET /api/market/calls at or after the settle time. The settle price is the first price
the server reads at or after settle_at (fetched at or after it, quoted after the opening), not the
exact price at that second. For a stock outside New York hours it is the last close. If no such
price comes within 24 hours after settle_at, the stake goes back.

The database part is supabase/migrations/20261111010000_market_calls.sql: it keeps the same rules
(the five assets, the stakes, at most 3 open calls, 1 hour, the outcomes) and moves the coins.

Used by: routes/market_calls.py and the tests.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

from server.errors import ApiError
from server.market import calls_store as store
from server.market.calls_store import CallReply, CallRow
from server.market.exchange import MarketService
from server.market.readings import PRICE_MODE_LIVE
from server.market.states import CompanyState
from server.market.store import read_balance
from server.supabase_admin import InsufficientFunds, SupabaseAdmin, SupabaseRejected
from server.wallet import validate_transaction

logger = logging.getLogger(__name__)

# The five assets of the stall, as (market company id, what the player reads). The migration's
# check rule market_calls_asset_allowed lists the same ids (a test compares).
CALL_ASSETS = (
    ("harbor-trust", "Bitcoin"),
    ("tidewright-works", "Ether"),
    ("greyfathom-salvage", "Gold"),
    ("apple", "Apple"),
    ("nvidia", "NVIDIA"),
)
STAKES = (5, 10, 25)
DIRECTIONS = ("up", "down")
# The same numbers as the constants in market_call_open() and market_call_settle().
MAX_OPEN_CALLS = 3
HOLD = timedelta(hours=1)
PRICE_WAIT = timedelta(hours=24)


@dataclass(frozen=True)
class AssetView:
    id: str
    name: str
    price: Decimal | None
    price_at: datetime | None
    is_open: bool
    closed_reason: str | None  # why no call can be opened now; None while open


@dataclass(frozen=True)
class CallsView:
    assets: tuple[AssetView, ...]
    calls: tuple[CallRow, ...]
    balance: int


def asset_name(asset: str) -> str | None:
    for asset_id, name in CALL_ASSETS:
        if asset_id == asset:
            return name
    return None


def is_live(state: CompanyState) -> bool:
    """A new call may be opened: the market is open, the price fresh and live, not delisted."""
    live = state.reading.has_price and state.reading.price_mode == PRICE_MODE_LIVE
    return state.is_open and live and not state.delisted


def closed_reason(state: CompanyState) -> str | None:
    if is_live(state):
        return None
    if state.delisted:
        return "delisted"
    if state.reading.has_price and state.reading.price_mode != PRICE_MODE_LIVE:
        return "demo"
    return state.reason or state.status


def asset_view(state: CompanyState, name: str) -> AssetView:
    reading = state.reading
    price_at = reading.quoted_at or reading.fetched_at
    open_now = is_live(state)
    return AssetView(
        state.company.id, name, reading.price, price_at, open_now, closed_reason(state)
    )


def settle_price(state: CompanyState | None, row: CallRow) -> Decimal | None:
    """The first price read at or after settle_at and quoted after the opening, or None."""
    if state is None:
        return None
    reading = state.reading
    if not reading.has_price or reading.price_mode != PRICE_MODE_LIVE:
        return None
    if reading.fetched_at is None or reading.fetched_at < row.settle_at:
        return None
    quoted = reading.quoted_at or reading.fetched_at
    return reading.price if quoted > row.opened_at else None


async def settle_due(
    admin: SupabaseAdmin, rows: list[CallRow], states: dict[str, CompanyState], now: datetime
) -> None:
    """Decide every open call past its settle time that has a price, or waited 24 hours."""
    for row in rows:
        if not store.is_due(row, now):
            continue
        price = settle_price(states.get(row.asset), row)
        if price is None and now <= row.settle_at + PRICE_WAIT:
            continue  # wait for a price
        reply = await store.run_settle(admin, row.id, price)
        if not isinstance(reply, CallReply):
            # not_due or no_price: the database clock disagrees a little; the next read retries.
            logger.info("A due market call was not settled yet: %s", reply.reason)


async def look(admin: SupabaseAdmin, market: MarketService, player_id: str) -> CallsView:
    """The stall for one player: assets, their calls (due ones decided first) and their coins."""
    snapshot = await market.snapshot(admin, trading_enabled=True)
    states = {}
    for asset_id, _name in CALL_ASSETS:
        state = snapshot.find(asset_id)
        if state is not None:
            states[asset_id] = state
    rows = await store.read_calls(admin, player_id)
    if any(store.is_due(row, snapshot.now) for row in rows):
        await settle_due(admin, rows, states, snapshot.now)
        rows = await store.read_calls(admin, player_id)
    assets = tuple(
        asset_view(states[asset_id], name) for asset_id, name in CALL_ASSETS if asset_id in states
    )
    return CallsView(assets, tuple(rows), await read_balance(admin, player_id))


def no_such_asset() -> ApiError:
    return ApiError(404, "no_such_asset", "The market stall has no such asset.")


def market_closed(name: str) -> ApiError:
    return ApiError(
        409, "market_closed", f"{name} has no live price right now. Try again when it is open."
    )


async def live_price(market: MarketService, admin: SupabaseAdmin, asset: str) -> Decimal:
    """The live price of the asset now (at most 5 seconds old), or 409 market_closed."""
    name = asset_name(asset) or asset
    company = market.find_company(asset)
    if company is None:
        raise no_such_asset()
    try:
        state = await market.fresh_state(company, await market.is_relit(admin))
    except ApiError as error:
        if error.status_code == 409:  # closed, stale or unavailable: no live price now
            raise market_closed(name) from error
        raise
    if not is_live(state) or state.reading.price is None:
        raise market_closed(name)
    return state.reading.price


async def open_call(
    admin: SupabaseAdmin,
    market: MarketService,
    player_id: str,
    asset: str,
    direction: str,
    stake: int,
    action_uid: str,
) -> tuple[CallRow, int]:
    """Open one call and answer it with the coins after the stake. A repeated click answers the
    call it made already (and charges nothing)."""
    if asset_name(asset) is None:
        raise no_such_asset()
    if stake not in STAKES:
        raise ApiError(422, "bad_stake", "A call stakes 5, 10 or 25 coins.")
    made = await store.find_by_action(admin, player_id, action_uid)
    if made is not None:
        return made, await read_balance(admin, player_id)
    price = await live_price(market, admin, asset)
    validate_transaction(-stake, "market_call_stake", f"call:{action_uid}")
    try:
        reply = await store.run_open(admin, player_id, action_uid, asset, direction, stake, price)
    except InsufficientFunds as error:
        message = f"A call of {stake} coins needs {stake} coins. You need more coins."
        raise ApiError(409, "insufficient_funds", message) from error
    if isinstance(reply, CallReply):
        return reply.call, reply.balance
    if reply.reason == "too_many_calls":
        message = f"You have {MAX_OPEN_CALLS} open calls. Wait until one is decided."
        raise ApiError(409, "too_many_calls", message)
    if reply.reason == "player_not_set_up":
        raise ApiError(404, "player_not_set_up", "Your player record is not set up yet.")
    raise SupabaseRejected()
