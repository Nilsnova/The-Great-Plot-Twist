"""Tests for routes/market_calls.py and market/calls.py: GET and POST /api/market/calls.

The prices come from the real MarketService with a fake Binance and a fake stock source; the
database is FakeCallsDatabase (market_calls_helpers.py). The SQL itself is tested in
market_calls_sql/. Nothing uses the network.

Used by: pytest (cd backend && uv run pytest).
"""

from dataclasses import replace

import pytest

from server.flags import parse_flags
from server.market.calls import CALL_ASSETS, HOLD, MAX_OPEN_CALLS, PRICE_WAIT, STAKES
from server.tests.helpers import REPO_ROOT, assert_error
from server.tests.market_calls_helpers import GUEST, GUEST_ID, MARKET_ON, PLAYER_ID, CallsWorld
from server.wallet import find_direction

HOLD_SECONDS = int(HOLD.total_seconds())
DAY = 24 * 3600
MIGRATIONS = REPO_ROOT / "supabase" / "migrations"
MIGRATION = MIGRATIONS / "20261111010000_market_calls.sql"


def newest_open_function():
    """The text of the newest migration that defines market_call_open() (later ones win)."""
    files = sorted(
        path
        for path in MIGRATIONS.glob("*.sql")
        if "create or replace function public.market_call_open(" in path.read_text()
    )
    return files[-1].read_text()


# --- GET /api/market/calls ---


def test_the_stall_shows_the_five_assets_with_their_live_prices():
    world = CallsWorld(stocks=True)

    response = world.look()

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    body = response.json()
    assert list(body) == ["assets", "calls", "balance"]
    assert [(a["id"], a["name"]) for a in body["assets"]] == list(CALL_ASSETS)
    bitcoin = body["assets"][0]
    assert (bitcoin["price"], bitcoin["open"], bitcoin["closedReason"]) == (76159.21, True, None)
    assert bitcoin["priceAt"].endswith("Z")
    assert body["assets"][3]["price"] == 271.20 and body["assets"][3]["open"] is True
    assert (body["calls"], body["balance"]) == ([], 100)


def test_stocks_without_a_stock_source_show_closed_with_a_reason():
    assets = {a["id"]: a for a in CallsWorld(stocks=False).look().json()["assets"]}

    assert assets["apple"]["open"] is False and assets["apple"]["closedReason"]
    assert assets["nvidia"]["price"] is None
    assert assets["harbor-trust"]["open"] is True


def test_in_demo_mode_nothing_is_open_because_the_prices_are_a_recording():
    assets = CallsWorld(demo=True).look().json()["assets"]

    assert not any(asset["open"] for asset in assets)
    assert assets[0]["closedReason"] == "demo"


def test_the_stall_is_closed_while_the_market_flag_is_off():
    world = CallsWorld(settings=replace(MARKET_ON, flags=parse_flags("")))

    assert_error(world.look(), 404, "feature_off")
    assert_error(world.call(), 404, "feature_off")
    assert world.database.requests == []


def test_the_stall_needs_a_sign_in():
    world = CallsWorld()

    assert_error(world.client.get("/api/market/calls"), 401, "unauthorized")


# --- POST /api/market/calls ---


def test_a_call_is_opened_at_the_live_price_and_takes_the_stake():
    world = CallsWorld()

    response = world.call()

    assert response.status_code == 200
    body = response.json()
    assert list(body) == ["id", "asset", "direction", "stake", "openPrice", "openedAt",
                          "settleAt", "status", "settlePrice", "payout", "balance"]  # fmt: skip
    assert (body["asset"], body["direction"], body["stake"], body["openPrice"]) == (
        "harbor-trust", "up", 10, 76159.21)  # fmt: skip
    assert (body["status"], body["settlePrice"], body["payout"], body["balance"]) == (
        "open", None, None, 90)  # fmt: skip
    assert (body["openedAt"], body["settleAt"]) == ("2026-11-09T16:00:00Z", "2026-11-09T16:05:00Z")
    (sent,) = world.database.calls("market_call_open")
    assert sent == {"p_player_id": PLAYER_ID, "p_action_uid": "click-0001", "p_asset":
                    "harbor-trust", "p_direction": "up", "p_stake": 10,
                    "p_open_price": "76159.21"}  # fmt: skip


def test_a_repeated_click_answers_the_same_call_and_charges_once():
    world = CallsWorld()
    first = world.call().json()

    again = world.call(stake=25)

    assert again.status_code == 200
    assert again.json()["id"] == first["id"] and again.json()["balance"] == 90
    assert len(world.database.calls("market_call_open")) == 1


def test_a_fourth_open_call_is_refused():
    world = CallsWorld()
    for number in range(MAX_OPEN_CALLS):
        assert world.call(actionUid=f"click-000{number}").status_code == 200

    response = world.call(actionUid="click-0009")

    assert_error(response, 409, "too_many_calls")
    assert "3 open calls" in response.json()["error"]["message"]


def test_a_call_the_player_cannot_pay_is_refused():
    world = CallsWorld()
    world.database.balances[PLAYER_ID] = 4

    assert_error(world.call(stake=5), 409, "insufficient_funds")


@pytest.mark.parametrize("stake", [0, 1, 6, 15, 50, 100, -5])
def test_only_the_three_stakes_are_allowed(stake):
    world = CallsWorld()

    assert_error(world.call(stake=stake), 422, "bad_stake")
    assert world.database.calls("market_call_open") == []


@pytest.mark.parametrize("asset", ["swiftwater-ferries", "tesla", "dogecoin"])
def test_an_asset_the_stall_does_not_offer_is_no_such_asset(asset):
    assert_error(CallsWorld().call(asset=asset), 404, "no_such_asset")


def test_a_stock_without_a_live_price_is_market_closed():
    world = CallsWorld(stocks=False)

    response = world.call(asset="apple")

    assert_error(response, 409, "market_closed")
    assert "Apple" in response.json()["error"]["message"]


def test_a_call_in_demo_mode_is_market_closed():
    assert_error(CallsWorld(demo=True).call(), 409, "market_closed")


@pytest.mark.parametrize(
    "body",
    [{"direction": "sideways"}, {"stake": "10"}, {"actionUid": "short"}, {"coins": 5},
     {"asset": "Harbor Trust"}],
)  # fmt: skip
def test_a_call_that_does_not_fit_is_refused(body):
    world = CallsWorld()

    assert_error(world.call(**body), 422, "validation_error")
    assert world.database.calls("market_call_open") == []


def test_an_admitted_guest_makes_calls_like_a_player():
    world = CallsWorld(settings=replace(MARKET_ON, flags=parse_flags("market,demo")))

    assert world.call(headers=GUEST).status_code == 200
    assert world.database.calls("market_call_open")[0]["p_player_id"] == GUEST_ID
    assert world.look(headers=GUEST).json()["balance"] == 90


def test_too_many_calls_in_a_minute_are_refused():
    world = CallsWorld()
    for number in range(20):
        world.call(stake=7, actionUid=f"click-{number:04d}")

    assert_error(world.call(actionUid="click-0099"), 429, "too_many_requests")


# --- lazy settlement on GET ---


@pytest.mark.parametrize(
    ("direction", "price", "status", "payout", "coins"),
    [
        ("up", "77000.00", "won", 20, 110),
        ("up", "75000.00", "lost", 0, 90),
        ("down", "75000.00", "won", 20, 110),
        ("down", "77000.00", "lost", 0, 90),
        ("up", "76159.21", "refunded", 10, 100),
    ],
)
def test_a_due_call_is_decided_with_the_price_read_at_the_next_look(
    direction, price, status, payout, coins
):
    world = CallsWorld()
    world.call(direction=direction)
    world.advance(HOLD_SECONDS + 5)
    world.set_price(BTCUSDT=price)

    body = world.look().json()

    (decided,) = body["calls"]
    assert (decided["status"], decided["payout"], body["balance"]) == (status, payout, coins)
    assert decided["settlePrice"] == float(price)


def test_a_call_is_not_decided_before_its_five_minutes():
    world = CallsWorld()
    world.call()
    world.advance(HOLD_SECONDS - 60)
    world.set_price(BTCUSDT="90000.00")

    (still,) = world.look().json()["calls"]

    assert still["status"] == "open"
    assert world.database.calls("market_call_settle") == []


def test_a_stock_call_waits_for_a_price_and_is_refunded_after_a_day():
    world = CallsWorld(stocks=True)
    world.call(asset="apple")
    world.advance(HOLD_SECONDS + 5)
    world.client.app.state.market.feed.stocks = None  # the stock source goes away

    waiting = world.look().json()["calls"][0]
    world.advance(DAY)
    refunded = world.look().json()

    assert waiting["status"] == "open"
    assert refunded["calls"][0]["status"] == "refunded" and refunded["balance"] == 100


def test_a_decided_call_stays_decided_and_pays_once():
    world = CallsWorld()
    world.call()
    world.advance(HOLD_SECONDS + 5)
    world.set_price(BTCUSDT="80000.00")
    world.look()

    world.set_price(BTCUSDT="60000.00")
    body = world.look().json()

    assert body["calls"][0]["status"] == "won" and body["balance"] == 110
    assert len(world.database.calls("market_call_settle")) == 1


# --- Python and the migration agree ---


def test_the_assets_stakes_and_reasons_are_the_ones_of_the_migration():
    text = MIGRATION.read_text()
    newest = newest_open_function()

    ids = ", ".join(f"'{asset_id}'" for asset_id, _name in CALL_ASSETS)
    assert f"check (asset in ({ids}))" in text
    assert f"check (stake in ({', '.join(str(stake) for stake in STAKES)}))" in text
    assert f"c_max_open constant integer  := {MAX_OPEN_CALLS};" in newest
    minutes = HOLD_SECONDS // 60
    assert f"c_hold     constant interval := interval '{minutes} minutes';" in newest
    assert "c_price_wait constant interval := interval '24 hours';" in text
    assert PRICE_WAIT.total_seconds() == DAY
    assert find_direction("market_call_stake") == "spend"
    assert find_direction("market_call_payout") == "earn"
