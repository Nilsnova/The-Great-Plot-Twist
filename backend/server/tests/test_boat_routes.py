"""The own boat's games (D057, docs/GAME-V3.md section 4.5): GET and POST /api/island/boat.

Nothing here uses the network: the database is a FakeIslandDatabase (island_helpers.py) that also
answers apply_wallet_transaction like the real one (each player + reason + ref once). The unlock
wave comes from the real campaign.json, the coins from the real boat.json.
"""

import json
from dataclasses import replace

import httpx

from server.flags import parse_flags
from server.island import boat
from server.tests.helpers import assert_error
from server.tests.island_helpers import (
    GUEST,
    GUEST_ID,
    ISLAND_SETTINGS,
    PLAYER,
    PLAYER_ID,
    FakeIslandDatabase,
    World,
)

WITH_GUESTS = replace(ISLAND_SETTINGS, flags=parse_flags("islands,demo"))


class LedgerDatabase(FakeIslandDatabase):
    """FakeIslandDatabase plus the money function: a ref is accepted once and remembered."""

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/rpc/apply_wallet_transaction"):
            self.requests.append(request)
            body = json.loads(request.content)
            key = (body["p_reason"], body["p_ref"])
            if key in self.ledger_refs:
                return httpx.Response(
                    409, json={"code": "23505", "message": "duplicate key value violates unique"}
                )
            self.ledger_refs.add(key)
            self.balance += body["p_delta"]
            return httpx.Response(200, json=self.balance)
        return super().__call__(request)


def world_at(wave: int = 30, wreck_paid: int = 500) -> World:
    world = World(settings=WITH_GUESTS)
    world.database.__class__ = LedgerDatabase
    world.database.progress.update(wave_best=wave, wreck_paid=wreck_paid)
    return world


def claim(world: World, game: str = "dash", stars: int = 3, headers=PLAYER, **body):
    return world.client.post(
        "/api/island/boat", json={"game": game, "stars": stars, **body}, headers=headers
    )


def status(world: World, headers=PLAYER, **params):
    return world.client.get("/api/island/boat", params=params, headers=headers)


# --- the unlock: wave 30 and a repaired wreck ---


def test_the_campaign_opens_the_ship_after_wave_thirty_and_no_longer_later():
    island = world_at(29).island().json()["campaign"]
    assert island["locked"]["ship"] == 30
    assert "ship" not in island["later"]
    assert "ship" in world_at(30).island().json()["campaign"]["open"]


def test_before_wave_thirty_the_boat_is_locked_and_pays_nothing():
    world = world_at(29)
    view = status(world).json()
    assert view["open"] is False
    assert view["reason"] == "locked"
    assert view["unlockWave"] == 30
    refused = claim(world)
    assert_error(refused, 409, "locked")
    assert refused.json()["error"]["message"] == "Opens after wave 30."
    assert world.database.calls("apply_wallet_transaction") == []


def test_at_wave_thirty_the_wreck_must_be_repaired_first():
    world = world_at(30, wreck_paid=400)
    view = status(world).json()
    assert (view["open"], view["reason"]) == (False, "not_repaired")
    assert view["wreck"] == {"paid": 400, "goal": 500}
    refused = claim(world)
    assert_error(refused, 409, "not_repaired")
    assert "100 coins to go" in refused.json()["error"]["message"]


# --- the reward: the server's coins, once per game and wave ---


def test_a_round_pays_the_servers_coins_once_per_game_and_wave():
    world = world_at(30)
    view = status(world).json()
    assert view["open"] is True
    assert view["games"] == [
        {"id": "broadside", "paid": False, "best": 36},
        {"id": "dash", "paid": False, "best": 36},
    ]

    first = claim(world, "dash", 2).json()
    assert first == {
        "game": "dash", "stars": 2, "coins": 24, "paid": True, "already": False,
        "balance": 124, "wave": 30,
    }  # fmt: skip
    (call,) = world.database.calls("apply_wallet_transaction")
    assert call == {
        "p_player_id": PLAYER_ID,
        "p_delta": 24,
        "p_reason": "boat_game",
        "p_ref": f"boat:{PLAYER_ID}:30:dash",
    }
    again = claim(world, "dash", 3).json()
    assert (again["paid"], again["already"], again["coins"]) == (False, True, 0)
    assert len(world.database.calls("apply_wallet_transaction")) == 1
    assert [item["paid"] for item in status(world).json()["games"]] == [False, True]
    # The other game still pays at this wave; the next won wave pays the dash again.
    assert claim(world, "broadside", 1).json()["coins"] == 12
    world.database.progress.update(wave_best=31)
    assert claim(world, "dash", 3).json()["coins"] == 36


def test_no_stars_pay_nothing_and_keep_the_payment_open():
    world = world_at(40)
    nothing = claim(world, "broadside", 0).json()
    assert (nothing["paid"], nothing["already"], nothing["coins"]) == (False, False, 0)
    assert world.database.calls("apply_wallet_transaction") == []
    assert claim(world, "broadside", 3).json()["coins"] == 42


def test_a_second_tab_that_claimed_first_is_not_paid_twice():
    world = world_at(30)
    # The ledger check says "not yet", but the money function finds the ref (claimed meanwhile).
    world.database.read_ledger = lambda request: httpx.Response(200, json=[])
    world.database.ledger_refs.add(("boat_game", f"boat:{PLAYER_ID}:30:dash"))
    answer = claim(world, "dash", 3)
    assert answer.status_code == 200
    assert (answer.json()["paid"], answer.json()["already"]) == (False, True)


def test_bad_claims_are_refused_before_any_coin_moves():
    world = world_at(30)
    assert_error(claim(world, "kraken", 3), 400, "bad_game")
    assert_error(claim(world, "dash", 4), 422, "bad_stars")
    assert_error(claim(world, "dash", -1), 422, "bad_stars")
    assert claim(world, "dash", "3").status_code == 422  # a string is not a whole number
    assert claim(world, "dash", 3, score=999).status_code == 422  # no extra fields
    assert world.database.calls("apply_wallet_transaction") == []


def test_the_coins_grow_slowly_with_the_wave_and_stop_at_the_cap():
    assert [boat.coins_for(3, wave) for wave in (30, 50, 99, 100, 250)] == [36, 48, 75, 78, 78]
    assert [boat.coins_for(stars, 30) for stars in (-1, 0, 1, 2, 3, 9)] == [0, 0, 12, 24, 36, 36]


# --- a friend's game ---


def game_of_owner(world: World, member: bool = True) -> None:
    world.database.islands["K7Q2M"] = {
        "player_id": PLAYER_ID, "code": "K7Q2M", "wave_best": 30, "flags": 9,
    }  # fmt: skip
    world.database.names[PLAYER_ID] = "Captain Gull"
    if member:
        world.database.games.add(PLAYER_ID, GUEST_ID)


def test_a_member_sails_the_hosts_boat_and_is_paid_into_their_own_wallet():
    world = world_at(30)
    game_of_owner(world)
    answer = claim(world, "broadside", 3, headers=GUEST, code="ISLE-K7Q2M")
    assert answer.status_code == 200
    (call,) = world.database.calls("apply_wallet_transaction")
    assert call["p_player_id"] == GUEST_ID
    assert call["p_ref"] == f"boat:{PLAYER_ID}:30:broadside"


def test_a_stranger_cannot_sail_someone_elses_boat():
    world = world_at(30)
    game_of_owner(world, member=False)
    assert_error(claim(world, headers=GUEST, code="ISLE-K7Q2M"), 403, "not_member")
    assert_error(status(world, headers=GUEST, code="ISLE-K7Q2M"), 403, "not_member")
    assert world.database.calls("apply_wallet_transaction") == []
