"""Tests for POST /api/waves/revive (captain health, docs/GAME-V3.md section 3): a teammate who
helps a fallen captain up pays 20 + 5 x the wave number.

The payment rules (the wallet first, one payment per actionUid, only a player in the running
wave, the price from the wave's own number) are decided by wave_revive() in
supabase/migrations/20261112050000_captain_revive.sql; its real SQL is tested in
island_sql/test_captain_revive_sql.py. Here the database is a fake (island_helpers.py), so these
tests check the membership check, what the server sends, how it reads the answer and every
refusal. Nothing uses the network.
"""

from dataclasses import replace
from pathlib import Path

import httpx
import pytest

from server.flags import parse_flags
from server.island.catalogue import load_island
from server.tests.helpers import assert_error
from server.tests.island_helpers import (
    GUEST,
    GUEST_ID,
    ISLAND_SETTINGS,
    PLAYER_ID,
    REVIVED,
    WAVE_ID,
    World,
)
from server.wallet import WALLET_REASONS

MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "20261112050000_captain_revive.sql"
)


def refused(reason: str, **extra) -> dict:
    return {"status": "refused", "reason": reason, **extra}


def test_a_revive_pays_through_wave_revive_with_the_price_of_islands_json():
    world = World()

    reply = world.revive()

    assert reply.status_code == 200
    assert reply.json() == {"price": 35, "coins": 65, "repeat": False}
    assert world.database.calls("wave_revive") == [
        {
            "p_player_id": PLAYER_ID,
            "p_wave_id": WAVE_ID,
            "p_fallen": "p-k3x9q2",
            "p_action_uid": "help-0001",
            "p_base": 20,
            "p_per_wave": 5,
        }
    ]
    revive = load_island().revive
    assert (revive.base, revive.per_wave, revive.price(1), revive.price(3)) == (20, 5, 25, 35)


def test_a_repeated_click_answers_the_first_price_and_says_so():
    world = World()
    world.database.revive_reply = {**REVIVED, "repeat": True}

    assert world.revive().json() == {"price": 35, "coins": 65, "repeat": True}


@pytest.mark.parametrize(
    ("reply", "status", "code"),
    [
        (refused("insufficient_funds", price=35), 409, "insufficient_funds"),
        (refused("not_in_wave"), 403, "not_in_wave"),
        (refused("wave_over"), 409, "wave_over"),
        (refused("no_such_wave"), 404, "no_such_wave"),
        (refused("not_member"), 403, "not_member"),
        (refused("player_not_set_up"), 404, "player_not_set_up"),
        (refused("something_new"), 502, "database_error"),
        ({"status": "done", "price": "35"}, 502, "database_error"),
    ],
)
def test_a_revive_the_database_refuses(reply, status, code):
    world = World()
    world.database.revive_reply = reply

    answer = world.revive()

    assert_error(answer, status, code)
    if code == "insufficient_funds":
        assert "35 coins" in answer.json()["error"]["message"]


def test_the_outcome_is_unknown_when_the_database_is_away():
    world = World()
    world.database.revive_reply = httpx.Response(503, json={"message": "unavailable"})

    assert world.revive().status_code in (502, 503)


def test_only_a_member_of_the_game_revives_on_somebody_elses_island():
    world = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("islands,demo")))

    assert_error(world.revive(headers=GUEST), 403, "not_member")
    assert world.database.calls("wave_revive") == []
    world.database.games.add(PLAYER_ID, GUEST_ID)
    assert world.revive(headers=GUEST).status_code == 200
    assert world.database.calls("wave_revive")[0]["p_player_id"] == GUEST_ID


def test_pirate_point_is_open_to_everybody_and_an_unknown_wave_is_404():
    world = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("islands,demo")))
    world.database.wave_places[WAVE_ID] = {"place": "pirate_point", "island_owner": None}

    assert world.revive(headers=GUEST).status_code == 200

    world.database.wave_places.clear()
    assert_error(world.revive(), 404, "no_such_wave")
    assert len(world.database.calls("wave_revive")) == 1


@pytest.mark.parametrize(
    "body",
    [
        {"fallen": "p k3"},
        {"fallen": ""},
        {"fallen": "p" * 65},
        {"actionUid": "short"},
        {"waveId": "not-a-wave"},
        {"price": 1},
    ],
)
def test_a_revive_that_does_not_fit_is_refused(body):
    world = World()

    assert_error(world.revive(**body), 422, "validation_error")
    assert world.database.calls("wave_revive") == []


def test_the_islands_flag_and_a_login_are_needed():
    off = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("")))
    assert_error(off.revive(), 404, "feature_off")
    assert_error(World().revive(headers={}), 401, "unauthorized")


def test_the_wallet_reason_and_the_migration_agree():
    assert ("captain_revive", "spend") in WALLET_REASONS
    sql = MIGRATION.read_text(encoding="utf-8")
    assert "('captain_revive', 'spend'," in sql
    assert "security invoker" in sql and "set search_path = ''" in sql
    assert "from public, anon, authenticated, service_role;" in sql
    assert "to service_role;" in sql
    # The wallet is locked before anything else is read.
    body = sql.split("create or replace function public.wave_revive", 1)[1]
    assert body.index("from public.wallets where player_id = p_player_id for update") < body.index(
        "from public.captain_revives"
    )
    assert "public.apply_wallet_transaction(p_player_id, -v_price, 'captain_revive', v_ref)" in body
