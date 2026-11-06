"""The app shares the checked relighting state with the bulletin port and Exchange v2."""

import asyncio

from fastapi.testclient import TestClient

from server.app import create_app
from server.flags import parse_flags
from server.settings import Settings
from server.tests.helpers import FakeClock
from server.tests.test_world_read import Database
from server.world_stage import DARK, RELIT


def test_world_relighting_reaches_the_public_route_bulletin_port_and_market_rules():
    database = Database(relit=True)
    app = create_app(Settings(demo_mode=True, flags=parse_flags("case,market")), admin=database)
    client = TestClient(app)
    world = client.get("/api/world")
    assert world.status_code == 200 and world.json()["stage"] == RELIT
    assert world.headers["cache-control"] == "public, max-age=30, s-maxage=30"
    assert asyncio.run(app.state.world_stage.read()).relit_at is not None
    board = asyncio.run(app.state.market.snapshot(database, trading_enabled=True))
    assert board.basis_points == 100
    greyfathom = next(row for row in board.states if row.company.id == "greyfathom-salvage")
    assert greyfathom.delisted is True and not greyfathom.can_open
    assert sum(table == "world_state" for table, _ in database.calls) == 1


def test_case_off_prevents_world_reads_from_every_default_consumer():
    database = Database(relit=True)
    app = create_app(Settings(demo_mode=True), admin=database)
    assert TestClient(app).get("/api/world").status_code == 404
    assert asyncio.run(app.state.world_stage.read()).stage == DARK
    assert asyncio.run(app.state.market.is_relit(database)) is False
    assert database.calls == []


def test_the_shared_world_cache_observes_relighting_at_the_clock_boundary():
    database = Database()
    clock = FakeClock()
    app = create_app(
        Settings(demo_mode=True, flags=parse_flags("case")), admin=database, clock=clock
    )
    assert asyncio.run(app.state.world_stage.read()).stage == DARK
    database.rows = Database(relit=True).rows
    clock.advance(29)
    assert asyncio.run(app.state.market.is_relit(database)) is False
    clock.advance(1)
    assert asyncio.run(app.state.market.is_relit(database)) is True
