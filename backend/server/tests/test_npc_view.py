"""Partner jobs settle by effective case seconds without writes or unearned card prose."""

import json
from dataclasses import replace

import pytest

from server.game.case_data import load_case
from server.game.case_snapshot import Find, Pin, Post
from server.game.case_view import build_case_view
from server.game.npc_lines import load_bank, pick_line
from server.game.npc_orders import NpcOrder
from server.game.npc_view import build_partners_view
from server.tests.case_rule_helpers import PLAYER, snapshot


@pytest.fixture(scope="module")
def data():
    return load_case()


@pytest.fixture(scope="module")
def lines():
    return load_bank()


def fetching():
    order = NpcOrder(
        3,
        2,
        "deckhand",
        "fetch",
        "C4",
        2880,
        3780,
        PLAYER,
        "C4.low_tide_cave",
        "C4",
        0,
        3120,
        3480,
        3780,
    )
    find = Find(2, "C4", "C4.low_tide_cave", 2880, 3480, PLAYER, True, 3)
    pin = Pin(2, "C4", 3780, 2880, PLAYER, True)
    return replace(snapshot(), orders_count=3, npc_orders=(order,), finds=(find,), pins=(pin,))


def partner(data, current, second, lines, seat=2):
    return next(
        row for row in build_partners_view(data, current, second, lines) if row["seat"] == seat
    )


def test_fetch_arrival_find_and_pin_boundaries_are_stable_and_repeated_reads_do_nothing(
    data, lines
):
    current = fetching()
    before = partner(data, current, 3119, lines)
    arrived = partner(data, current, 3120, lines)
    found = partner(data, current, 3480, lines)
    pinned = partner(data, current, 3780, lines)
    assert before["status"] == arrived["status"] == found["status"] == "busy"
    assert not before["job"]["arrived"] and arrived["job"]["arrived"]
    assert arrived["job"]["remaining"] == 660
    assert arrived["satchel"] == []
    assert found["satchel"] == [{"id": "C4", "title": data.card("C4").title, "pinned": False}]
    assert not found["canOrder"] and pinned["canOrder"] and pinned["status"] == "idle"
    assert pinned["satchel"][0]["pinned"] and pinned["job"]["done"]
    assert pinned == partner(data, current, 3780, lines)
    assert current.npc_orders[0].ready_second == 3780 and current.pins[0].pinned_second == 3780


def test_the_example_partner_job_has_exact_numbers_and_latest_bank_line(data, lines):
    row = partner(data, fetching(), 3368, lines)
    assert row["job"] == {
        "orderNo": 3,
        "order": "fetch",
        "target": "C4",
        "total": 900,
        "remaining": 412,
        "done": False,
        "arrived": True,
        "line": pick_line(lines, "arrived", "any", 3, {}),
    }
    assert row["kit"] == "stranger" and row["partnerId"] == "deckhand"


def test_a_partner_card_text_is_not_sent_one_second_before_it_lands(data, lines):
    current = fetching()
    before = json.dumps(build_case_view(data, current, PLAYER, 3479, lines=lines))
    after = build_case_view(data, current, PLAYER, 3480, lines=lines)
    assert data.card("C4").text not in before
    assert any(card["id"] == "C4" for card in after["board"]["cards"])


def test_fetch_targets_do_not_hint_at_kit_windows_or_busy_eligibility(data, lines):
    current = fetching()
    row = partner(data, current, 3000, lines)
    targets = {item["id"] for item in row["targets"]["fetch"]}
    assert "C4" not in targets  # A pending pin is already reserved, not offered a second time.
    assert targets == {card.id for card in data.cards if not card.opens_after and card.id != "C4"}
    assert {item["id"] for item in row["targets"]["man_light"]} == {"keepers_lamp", "harbor_light"}
    assert set(row["orders"][0]) == {"id", "label"}


def test_witness_partner_starts_with_c2_and_pin_only_has_no_trip(data, lines):
    current = replace(snapshot(), finds=(Find(4, "C2", "C2.radio_words", 0, 0),))
    row = partner(data, current, 0, lines, seat=4)
    assert row["satchel"] == [{"id": "C2", "title": data.card("C2").title, "pinned": False}]
    order = NpcOrder(1, 4, "cook", "fetch", "C2", 10, 310, PLAYER, result_card="C2", pin_second=310)
    row = partner(data, replace(current, orders_count=1, npc_orders=(order,)), 10, lines, seat=4)
    assert row["job"]["arrived"] and row["job"]["total"] == 300
    assert row["job"]["line"] == pick_line(lines, "order_accepted", "pin", 1, {"minutes": 5})


def test_light_duty_starts_at_ready_second_and_survives_dawn_until_post_ends(data, lines):
    order = NpcOrder(1, 2, "deckhand", "man_light", "harbor_light", 100, 700, PLAYER)
    post = Post(1, "harbor_light", 2, 100, 700, npc_id="deckhand", order_no=1)
    current = replace(
        snapshot(),
        npc_orders=(order,),
        orders_count=1,
        posts=(post,),
        night_no=1,
        night_started_second=0,
    )
    assert partner(data, current, 699, lines)["status"] == "busy"
    assert partner(data, current, 700, lines)["status"] == "on_duty"
    assert partner(data, current, 9999, lines)["status"] == "on_duty"
    ended = replace(current, posts=(replace(post, ended_second=900),))
    assert partner(data, ended, 900, lines)["status"] == "idle"


def test_takeover_removes_partner_controls_but_running_find_still_lands_in_seat(data, lines):
    current = fetching()
    seats = tuple(
        replace(seat, player_id="friend", npc_id=None) if seat.seat_no == 2 else seat
        for seat in current.seats
    )
    takeover = replace(current, seats=seats)
    assert all(row["seat"] != 2 for row in build_partners_view(data, takeover, 3480, lines))
    view = build_case_view(data, takeover, "friend", 3480, lines=lines)
    assert any(card["id"] == "C4" for card in view["board"]["cards"])


def test_partner_projection_is_same_for_every_crew_player_and_contains_no_case_solution(
    data, lines
):
    current = fetching()
    first = build_case_view(data, current, PLAYER, 3368, lines=lines)
    other = build_case_view(data, current, current.seats[2].player_id, 3368, lines=lines)
    assert first["partners"] == other["partners"]
    encoded = json.dumps(first["partners"])
    assert data.accusation.culprit not in encoded
    assert "ordered_by" not in encoded and "actionUid" not in encoded
