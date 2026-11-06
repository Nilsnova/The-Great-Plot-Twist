"""Tests for market/board.py: the order of the companies, the rules block and the credits.

Pure data in, plain data out: no network, no database, no clock.
"""

from datetime import UTC, datetime

from server.market.board import BINANCE_CREDIT, Snapshot, credits_block, rules_block
from server.market.calendars import ALWAYS_OPEN, Session
from server.market.readings import NO_READING, SOURCE_LIVE, Reading
from server.market.states import company_state
from server.tests.market_helpers import island_company, stock_company

NOW = datetime(2026, 11, 9, 16, 0, tzinfo=UTC)
OPEN_NEW_YORK = Session(True, opened_at=datetime(2026, 11, 9, 14, 30, tzinfo=UTC))
READING = Reading(price=1, quoted_at=NOW, fetched_at=NOW, source=SOURCE_LIVE)


def state(company, *, source_on=True, demo_mode=False, reading=READING):
    session = OPEN_NEW_YORK if company.is_stock else ALWAYS_OPEN
    return company_state(
        company,
        reading,
        session,
        source_on=source_on,
        demo_mode=demo_mode,
        relit=False,
        trading_enabled=True,
    )


def snapshot_of(*states) -> Snapshot:
    return Snapshot(tuple(states), NOW, relit=False, trading_enabled=True, demo_mode=False)


def test_the_board_lists_the_island_companies_first_whatever_the_order_of_the_file():
    stock = state(stock_company("AAPL"))
    island = state(island_company("BTCUSDT"))
    other_island = state(island_company("ETHUSDT"))

    listed = snapshot_of(stock, island, other_island).listed

    assert [s.company.id for s in listed] == ["btc-company", "eth-company", "aapl"]


def test_a_stock_without_a_source_is_not_listed_but_is_still_found_by_id():
    hidden = state(stock_company("AAPL"), source_on=False, reading=NO_READING)
    shown = state(island_company("BTCUSDT"))
    snapshot = snapshot_of(shown, hidden)

    assert [s.company.id for s in snapshot.listed] == ["btc-company"]
    assert snapshot.find("aapl") is hidden


def test_a_stock_in_demo_mode_is_not_listed():
    hidden = state(stock_company("AAPL"), source_on=False, demo_mode=True, reading=NO_READING)

    assert snapshot_of(hidden).listed == ()


def test_a_stock_without_a_price_yet_is_listed_because_its_source_is_on():
    waiting = state(stock_company("AAPL"), reading=NO_READING)

    assert snapshot_of(waiting).listed == (waiting,)


def test_a_company_that_is_not_in_the_snapshot_is_not_found():
    assert snapshot_of(state(island_company("BTCUSDT"))).find("nothing") is None


def test_the_fee_rate_of_a_snapshot_follows_the_relighting():
    before = Snapshot((), NOW, relit=False, trading_enabled=True, demo_mode=False)
    after = Snapshot((), NOW, relit=True, trading_enabled=True, demo_mode=False)

    assert (before.basis_points, after.basis_points) == (200, 100)


def test_the_rules_block_has_the_stake_choices_at_the_rate_before_and_after_the_relighting():
    before = rules_block(relit=False)
    after = rules_block(relit=True)

    assert before["feePercent"] == 2.0
    assert before["stakeChoices"][3] == {"stake": 100, "fee": 2, "total": 102}
    assert after["feePercent"] == 1.0
    assert after["stakeChoices"][3] == {"stake": 100, "fee": 1, "total": 101}
    assert before["zeroPointMovePercent"] == 10
    assert before["gameDayStarts"] == "08:00 Europe/Lisbon"


class FakeStocks:
    class provider:  # noqa: N801  a stand-in with the two fields the credits need
        credit = "Stock prices from the Fake Exchange."
        credit_href = "https://fake.example"


class FakeReplay:
    credit = "Binance Vision"
    licence = "CC BY-NC-SA 4.0"
    licence_url = "https://creativecommons.org/licenses/by-nc-sa/4.0/"


class FakeFeed:
    def __init__(self, live: bool, stocks=None) -> None:
        self.live = live
        self.stocks = stocks
        self.replay = FakeReplay()


def test_live_credits_name_binance_and_the_stock_provider_when_it_is_on():
    assert [c["text"] for c in credits_block(FakeFeed(live=True))] == [BINANCE_CREDIT]
    with_stocks = credits_block(FakeFeed(live=True, stocks=FakeStocks()))
    assert with_stocks[1] == {
        "text": "Stock prices from the Fake Exchange.",
        "href": "https://fake.example",
        "licenceText": None,
        "licenceHref": None,
    }


def test_the_credit_of_demo_mode_is_the_recording_with_its_licence_and_nothing_else():
    (credit,) = credits_block(FakeFeed(live=False, stocks=FakeStocks()))

    assert credit["text"] == "Recorded prices from Binance Vision, played back."
    assert credit["licenceText"] == "CC BY-NC-SA 4.0"
    assert credit["licenceHref"] == "https://creativecommons.org/licenses/by-nc-sa/4.0/"
