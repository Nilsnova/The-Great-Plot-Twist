"""Bulletin and market ports share the same flag-gated, checked world stage cache."""

import asyncio

from server.game.world_state import WorldReader, relit_check
from server.tests.test_world_read import NOW, Database
from server.world_stage import RELIT, WorldStage


def test_market_and_bulletin_share_the_checked_stage_and_first_relit_time():
    database = Database(relit=True)
    world = WorldReader(database, enabled=True, clock=lambda: NOW)

    assert asyncio.run(world.read()) == WorldStage(RELIT, NOW)
    assert asyncio.run(world.relit_check(database))
    assert len(database.calls) == 1


def test_the_market_callback_uses_the_readers_admin_and_cache():
    database = Database(relit=True)
    other = Database()
    world = WorldReader(database, enabled=True, clock=lambda: NOW)

    assert asyncio.run(world.relit_check(other))
    assert other.calls == []


def test_the_uncached_bridge_is_also_flag_gated_and_uses_checked_rows():
    database = Database(relit=True)

    assert not asyncio.run(relit_check(database))
    assert database.calls == []
    assert asyncio.run(relit_check(database, enabled=True))
