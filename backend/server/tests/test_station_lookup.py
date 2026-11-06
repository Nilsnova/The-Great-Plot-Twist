"""The station port delegates L2 reads and preserves its missing-islet timber contract."""

import asyncio
from unittest.mock import AsyncMock

from server.game import station_lookup
from server.game.building_catalogue import load_buildings
from server.game.station_lookup import IsletStations, NoStations
from server.tests.case_fixtures import KEEPER, VIEWER


def test_no_stations_never_reads_an_admin():
    port = NoStations()
    admin = object()

    assert asyncio.run(port.players_with_signal_station(admin, [VIEWER])) == frozenset()
    assert asyncio.run(port.timber(admin, VIEWER)) is None


def test_l2_station_lookup_uses_the_existing_single_crew_read(monkeypatch):
    read = AsyncMock(return_value=frozenset({KEEPER}))
    monkeypatch.setattr(station_lookup.islet_store, "players_with_signal_station", read)
    admin = object()
    players = [VIEWER, KEEPER]

    assert asyncio.run(IsletStations().players_with_signal_station(admin, players)) == {KEEPER}
    read.assert_awaited_once_with(admin, players)


def test_l2_timber_uses_the_held_balance_including_zero(monkeypatch):
    read = AsyncMock(return_value=0)
    monkeypatch.setattr(station_lookup.islet_store, "read_timber", read)
    admin = object()

    assert asyncio.run(IsletStations().timber(admin, VIEWER)) == 0
    read.assert_awaited_once_with(admin, VIEWER)


def test_an_unbuilt_islet_has_the_catalogue_starter_timber(monkeypatch):
    monkeypatch.setattr(station_lookup.islet_store, "read_timber", AsyncMock(return_value=None))

    assert asyncio.run(IsletStations().timber(object(), VIEWER)) == load_buildings().starter_timber
