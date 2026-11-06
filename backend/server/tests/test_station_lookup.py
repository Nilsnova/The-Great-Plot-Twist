"""The finale's L2 port uses one crew-scoped station read and the canonical starter pack."""

import asyncio

import httpx
import pytest

from server.game.building_catalogue import load_buildings
from server.game.station_lookup import IsletStations, NoStations
from server.supabase_admin import SupabaseRejected
from server.tests.helpers import make_admin

PLAYER = "11111111-2222-4333-8444-555555555555"
OTHER = "22222222-2222-4222-8222-222222222222"


def test_station_query_is_limited_to_the_verified_crew():
    seen = []

    def reply(request):
        seen.append(request)
        return httpx.Response(200, json=[{"player_id": PLAYER}, {"player_id": OTHER}])

    admin, _ = make_admin(reply)
    port = IsletStations(load_buildings())
    assert asyncio.run(port.players_with_signal_station(admin, [PLAYER])) == frozenset({PLAYER})
    assert len(seen) == 1
    assert seen[0].url.params["player_id"] == f"in.({PLAYER})"
    assert seen[0].url.params["building_type"] == "eq.signal_station"
    assert seen[0].url.params["limit"] == "4"


@pytest.mark.parametrize("rows,expected", [([], None), ([{"timber": 0}], 0), ([{"timber": 7}], 7)])
def test_timber_uses_the_real_starter_amount_only_for_a_missing_islet(rows, expected):
    seen = []

    def reply(request):
        seen.append(request)
        return httpx.Response(200, json=rows)

    catalogue = load_buildings()
    actual = asyncio.run(IsletStations(catalogue).timber(make_admin(reply)[0], PLAYER))
    assert actual == (catalogue.starter_timber if expected is None else expected)
    assert seen[0].url.params["player_id"] == f"eq.{PLAYER}"


def test_invalid_material_balance_is_a_private_database_error():
    admin, _ = make_admin(lambda request: httpx.Response(200, json=[{"timber": -1}]))
    with pytest.raises(SupabaseRejected):
        asyncio.run(IsletStations(load_buildings()).timber(admin, PLAYER))


def test_unavailable_station_port_makes_no_database_requests():
    port = NoStations()
    assert asyncio.run(port.players_with_signal_station(object(), [PLAYER])) == frozenset()
    assert asyncio.run(port.timber(object(), PLAYER)) is None
