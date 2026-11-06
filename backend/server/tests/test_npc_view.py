"""Partner views reveal orders, carried cards and bank reports only at their stored seconds."""

from dataclasses import replace

import pytest

from server.game import npc_view as module
from server.game.case_data import load_case
from server.game.case_snapshot import Find, Formed, Order, Pin, Post
from server.game.case_view import build_case_view
from server.game.npc_lines import load_lines, pick_line
from server.game.npc_view import npc_view
from server.tests.case_fixtures import VIEWER, example_snapshot
from server.tests.test_case_view import without_clock_keys


@pytest.fixture(scope="module")
def data():
    return load_case()


@pytest.fixture(scope="module")
def lines():
    return load_lines()


def base_snapshot():
    return replace(example_snapshot(), finds=(), pins=(), formed=())


def fetch_snapshot():
    order = Order(
        3,
        2,
        "deckhand",
        "fetch",
        "C4",
        2880,
        3780,
        VIEWER,
        route_id="C4.low_tide_cave",
        result_card="C4",
        arrive_second=3120,
        found_second=3480,
        pin_second=3780,
    )
    return replace(
        base_snapshot(),
        orders=(order,),
        orders_count=3,
        finds=(Find(2, "C4", order.route_id, 2880, 3480, VIEWER, True, 3),),
        pins=(Pin(2, "C4", 3780, 2880, VIEWER, True),),
    )


def duty_snapshot():
    order = Order(1, 2, "deckhand", "man_light", "keepers_lamp", 100, 700, VIEWER)
    post = Post("keepers_lamp", 2, 100, 700, npc_id="deckhand", order_no=1)
    return replace(base_snapshot(), orders=(order,), orders_count=1, posts=(post,))


def partner(data, snapshot, lines, now, seat=2):
    return next(row for row in npc_view(data, snapshot, VIEWER, now, lines) if row["seat"] == seat)


def require(condition, message):
    if not condition:
        pytest.fail(message, pytrace=False)


def test_the_spec_partner_example_contains_only_the_agreed_view_fields(data, lines):
    row = partner(data, fetch_snapshot(), lines, 3368)

    assert set(row) == {
        "seat",
        "name",
        "partnerId",
        "kit",
        "kitName",
        "status",
        "canOrder",
        "orders",
        "targets",
        "satchel",
        "job",
    }
    assert (row["seat"], row["partnerId"], row["kit"], row["status"], row["canOrder"]) == (
        2,
        "deckhand",
        "stranger",
        "busy",
        False,
    )
    assert row["satchel"] == []
    assert {key: value for key, value in row["job"].items() if key != "line"} == {
        "orderNo": 3,
        "order": "fetch",
        "target": "C4",
        "total": 900,
        "remaining": 412,
        "done": False,
        "arrived": True,
    }
    require(
        row["job"]["line"] == pick_line(lines, "arrived", "any", 3),
        "The job did not use its canonical arrival line.",
    )


@pytest.mark.parametrize(
    "now,event,variant",
    [
        (2880, "order_accepted", "fetch"),
        (3119, "order_accepted", "fetch"),
        (3120, "arrived", "any"),
        (3479, "arrived", "any"),
        (3480, "found_card", "C4"),
        (3779, "found_card", "C4"),
        (3780, "pinned_card", "C4"),
        (3900, "pinned_card", "C4"),
    ],
)
def test_each_report_uses_only_the_latest_due_bank_event(
    data, lines, monkeypatch, now, event, variant
):
    calls = []

    def choose(bank, name, group, salt, values=None):
        calls.append((bank, name, group, salt, values))
        return "bank-marker"

    monkeypatch.setattr(module, "pick_line", choose)

    row = partner(data, fetch_snapshot(), lines, now)

    assert row["job"]["line"] == "bank-marker"
    assert len(calls) == 1 and calls[0][:4] == (lines, event, variant, 3)


@pytest.mark.parametrize(
    "now,held,pinned,busy",
    [
        (3479, False, False, True),
        (3480, True, False, True),
        (3779, True, False, True),
        (3780, True, True, False),
    ],
)
def test_satchel_hold_pin_and_busy_boundaries_are_independent(data, lines, now, held, pinned, busy):
    row = partner(data, fetch_snapshot(), lines, now)

    assert bool(row["satchel"]) == held
    if held:
        assert row["satchel"] == [{"id": "C4", "title": data.card("C4").title, "pinned": pinned}]
    assert row["canOrder"] == (not busy)
    assert row["status"] == ("busy" if busy else "idle")


@pytest.mark.parametrize("kit", ["informant", "stranger", "true_keeper", "witness"])
def test_buttons_and_lead_labels_never_hint_at_kit_or_route_conditions(data, lines, kit):
    snapshot = base_snapshot()
    snapshot = replace(
        snapshot,
        seats=tuple(
            replace(seat, kit=kit) if seat.seat_no == 2 else seat for seat in snapshot.seats
        ),
    )
    row = partner(data, snapshot, lines, 0)

    assert row["canOrder"]
    assert row["targets"]["fetch"] == [
        {"id": card.id, "label": card.title} for card in data.cards if not card.opens_after
    ]
    assert row["targets"]["man_light"] == [
        {"id": light.id, "label": light.name}
        for light in data.night.lights
        if light.id in data.partners.may_man_lights
    ]


def test_fetch_targets_open_with_deductions_and_exclude_even_pending_pin_rows(data, lines):
    snapshot = replace(
        base_snapshot(),
        formed=tuple(Formed(row.id, 0) for row in data.deductions),
        pins=(Pin(2, "C4", 900, 0, VIEWER, True),),
    )

    row = partner(data, snapshot, lines, 1)

    assert [target["id"] for target in row["targets"]["fetch"]] == [
        card.id for card in data.cards if card.id != "C4"
    ]


def test_witness_starts_holding_its_card_and_can_request_its_short_pin(data, lines):
    route = next(
        row for row in data.active_routes if row.starts_in_journal and row.kit == "witness"
    )
    snapshot = replace(base_snapshot(), finds=(Find(4, route.card_id, route.id, 0, 0),))
    row = partner(data, snapshot, lines, 0, seat=4)

    assert row["satchel"] == [
        {"id": route.card_id, "title": data.card(route.card_id).title, "pinned": False}
    ]
    assert route.card_id in [target["id"] for target in row["targets"]["fetch"]]
    assert row["status"] == "idle" and row["job"] is None


@pytest.mark.parametrize("now,done", [(299, False), (300, True)])
def test_a_pin_only_job_is_arrived_at_once_and_uses_its_own_bank_variant(data, lines, now, done):
    route = next(
        row for row in data.active_routes if row.starts_in_journal and row.kit == "witness"
    )
    order = Order(
        1,
        4,
        "cook",
        "fetch",
        route.card_id,
        0,
        300,
        VIEWER,
        result_card=route.card_id,
        pin_second=300,
    )
    snapshot = replace(
        base_snapshot(),
        orders=(order,),
        finds=(Find(4, route.card_id, route.id, 0, 0),),
        pins=(Pin(4, route.card_id, 300, 0, VIEWER, True),),
    )
    row = partner(data, snapshot, lines, now, seat=4)
    expected = (
        pick_line(lines, "pinned_card", route.card_id, 1)
        if done
        else pick_line(lines, "order_accepted", "pin", 1, {"minutes": 5})
    )

    assert row["job"]["arrived"] and row["job"]["done"] == done
    require(row["job"]["line"] == expected, "The pin-only job used a wrong bank line.")


@pytest.mark.parametrize(
    "now,status,arrived", [(699, "busy", False), (700, "on_duty", True), (1200, "on_duty", True)]
)
def test_man_light_uses_the_recorded_post_arrival(data, lines, now, status, arrived):
    row = partner(data, duty_snapshot(), lines, now)

    assert row["status"] == status
    assert row["job"]["arrived"] == arrived
    assert row["canOrder"] == (status != "busy")
    event, variant = ("manning_light", "any") if arrived else ("order_accepted", "man_light")
    expected = pick_line(
        lines, event, variant, 1, {"minutes": 10, "light": data.light("keepers_lamp").name}
    )
    require(row["job"]["line"] == expected, "The man-light job used a wrong bank line.")


def test_ended_or_replaced_partner_posts_no_longer_count_as_duty(data, lines):
    snapshot = duty_snapshot()
    for post in (
        replace(snapshot.posts[0], ended_second=701),
        replace(snapshot.posts[0], npc_id="another-partner"),
    ):
        row = partner(data, replace(snapshot, posts=(post,)), lines, 701)
        assert row["status"] == "idle" and row["canOrder"]
    taken_over = replace(
        snapshot,
        seats=tuple(
            replace(seat, npc_id=None, player_id="new-player") if seat.seat_no == 2 else seat
            for seat in snapshot.seats
        ),
    )
    assert 2 not in [row["seat"] for row in npc_view(data, taken_over, VIEWER, 701, lines)]


def test_a_new_fetch_ends_duty_in_the_view_and_an_orderless_partner_does_nothing(data, lines):
    snapshot = duty_snapshot()
    before = build_case_view(data, snapshot, VIEWER, 702, lines=lines)
    fresh = replace(
        fetch_snapshot().orders[0],
        order_no=2,
        ordered_second=701,
        ready_second=1601,
        arrive_second=941,
        found_second=1301,
        pin_second=1601,
    )
    snapshot = replace(
        snapshot,
        orders=(*snapshot.orders, fresh),
        posts=(replace(snapshot.posts[0], ended_second=701),),
        write_revision=snapshot.write_revision + 1,
    )

    assert partner(data, snapshot, lines, 702)["status"] == "busy"
    after = build_case_view(data, snapshot, VIEWER, 702, lines=lines)
    assert after["writeRevision"] == before["writeRevision"] + 1
    assert without_clock_keys(before) != without_clock_keys(after)
    idle = partner(data, base_snapshot(), lines, 100000)
    assert idle["status"] == "idle" and idle["job"] is None and idle["satchel"] == []


def test_partner_arrival_find_pin_and_duty_landings_change_structure_without_a_write(data, lines):
    for snapshot, boundaries in ((fetch_snapshot(), (3120, 3480, 3780)), (duty_snapshot(), (700,))):
        for boundary in boundaries:
            before = build_case_view(data, snapshot, VIEWER, boundary - 1, lines=lines)
            after = build_case_view(data, snapshot, VIEWER, boundary, lines=lines)
            assert without_clock_keys(before) != without_clock_keys(after)
            assert before["writeRevision"] == after["writeRevision"]


def test_only_countdowns_change_between_partner_boundaries(data, lines):
    snapshot = fetch_snapshot()
    for start in (2890, 3130, 3490):
        first = without_clock_keys(npc_view(data, snapshot, VIEWER, start, lines))
        for now in range(start + 1, start + 10):
            assert without_clock_keys(npc_view(data, snapshot, VIEWER, now, lines)) == first


def test_bank_injection_preserves_legacy_views_and_credit_counts_from_order_acceptance(data, lines):
    snapshot = fetch_snapshot()

    assert build_case_view(data, snapshot, VIEWER, 2881)["partners"] == []
    view = build_case_view(data, snapshot, VIEWER, 2881, lines=lines)
    assert len(view["partners"]) == 2
    assert view["credits"][0]["pins"] == 1
    assert partner(data, snapshot, lines, 2881)["satchel"] == []


def test_a_nonmember_has_no_partner_view(data, lines):
    assert npc_view(data, base_snapshot(), "not-seated", 0, lines) == []


def test_the_board_waits_for_a_partner_pin_while_credit_counts_from_acceptance(data, lines):
    snapshot = fetch_snapshot()
    before = build_case_view(data, snapshot, VIEWER, 3779, lines=lines)
    after = build_case_view(data, snapshot, VIEWER, 3780, lines=lines)

    assert before["board"]["cards"][0]["state"] == "new"
    assert before["board"]["cards"][0]["pinnedBy"] == []
    assert after["board"]["cards"][0]["state"] == "pinned"
    assert after["board"]["cards"][0]["pinnedBy"] == [
        {"seat": 2, "label": "the Deckhand", "byPartner": True}
    ]
    assert before["credits"][0]["pins"] == after["credits"][0]["pins"] == 1
