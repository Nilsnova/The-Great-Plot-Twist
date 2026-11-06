"""Minimum NPC HTTP orders keep exact receipts, server-owned dialogue and safe retries."""

from dataclasses import dataclass, replace

import pytest

from server.game.case_snapshot import CaseSnapshot
from server.game.npc_lines import load_bank, pick_line
from server.game.npc_orders import NpcOrder
from server.tests.case_api_helpers import FRIEND_HEADER, HEADER, client_and_store
from server.tests.case_rule_helpers import PLAYER
from server.tests.helpers import assert_error
from server.tests.test_board_routes_api import Recorder
from server.tests.test_npc_orders import generic_card, timed_data

ORDER = {"seat": 2, "order": "fetch", "target": "C1", "actionUid": "order0001"}


@dataclass(frozen=True)
class OrderedSnapshot(CaseSnapshot):
    npc_orders: tuple[NpcOrder, ...] = ()
    orders_count: int = 0


def npc_client(*, enabled=True, real_view=False):
    client, store, service, clock = client_and_store(enabled=enabled)
    store.current = OrderedSnapshot(**vars(store.current))
    if not real_view:
        service.view = lambda state, viewer: (
            {"writeRevision": state.write_revision} if state else None
        )
    service.lines = load_bank()
    service.broadcaster = Recorder()
    store.receipts = {}
    store.receipt_queries = []

    async def receipt(player, uid, crew):
        store.receipt_queries.append((player, uid, crew))
        return store.receipts.get((player, uid, crew))

    async def write(current, player, uid, seat_no, kind, target, *, decision=None):
        scripted = store.scripted_reply("order")
        if scripted is not None:
            return scripted
        now = store.now()
        seat = next(item for item in current.seats if item.seat_no == seat_no)
        order = NpcOrder(
            current.orders_count + 1,
            seat_no,
            seat.npc_id,
            kind,
            target,
            now,
            now + 600 if kind == "man_light" else decision.ready_second,
            ordered_by=player,
            route_id=decision.route.id if decision and decision.route else None,
            result_card=target if kind == "fetch" else None,
            arrive_second=decision.arrive_second if decision else None,
            found_second=decision.found_second if decision else None,
            pin_second=decision.pin_second if decision else None,
        )
        store.current = replace(
            current,
            npc_orders=(*current.npc_orders, order),
            orders_count=order.order_no,
            write_revision=current.write_revision + 1,
        )
        store.receipts[(player, uid, current.crew_id)] = order
        store.remember(player, uid, "order", target, kind)
        store.actions[(player, uid)]["actionUid"] = uid
        reply = {
            "status": "done",
            "orderNo": order.order_no,
            "revision": store.current.write_revision,
        }
        if kind == "fetch":
            return {
                **reply,
                "foundSecond": order.found_second,
                "pinSecond": order.pin_second,
                "coinsPaid": 50,
            }
        return {**reply, "onPostSecond": order.ready_second}

    async def fetch(current, data, player, uid, seat, card, decision):
        return await write(current, player, uid, seat, "fetch", card, decision=decision)

    async def man_light(current, data, player, uid, seat, light):
        return await write(current, player, uid, seat, "man_light", light)

    store.npc_fetch = fetch
    store.npc_man_light = man_light
    store.npc_order_for_action = receipt
    return client, store, service, clock


def post(client, body=None, headers=HEADER):
    return client.post("/api/crews/me/orders", headers=headers, json=body or ORDER)


def test_order_route_requires_case_flag_and_verified_login():
    client, store, _, _ = npc_client(enabled=False)
    response = post(client)
    assert_error(response, 404, "feature_off")
    assert response.headers["cache-control"] == "private, no-store"
    assert store.calls == []
    client, store, _, _ = npc_client()
    response = post(client, headers={})
    assert_error(response, 401, "unauthorized")
    assert response.headers["cache-control"] == "private, no-store"
    assert store.calls == []


@pytest.mark.parametrize(
    "extra",
    [
        {"seat": True},
        {"seat": "2"},
        {"seat": 0},
        {"seat": 5},
        {"order": "pair"},
        {"order": "search"},
        {"order": "pin"},
        {"order": "wait"},
        {"target": 4},
        {"allowPaid": "false"},
        {"playerId": PLAYER},
        {"minutes": 0},
        {"price": 0},
        {"line": "untrusted"},
        {"actionUid": "short"},
    ],
)
def test_order_shape_is_strict_and_does_not_accept_fill_values(extra):
    client, store, _, _ = npc_client()
    response = post(client, {**ORDER, **extra})
    assert_error(response, 422, "validation_error")
    assert response.headers["cache-control"] == "private, no-store"
    assert store.calls == []


def test_paid_errands_are_refused_before_rules_but_after_exact_repeat_lookup():
    client, store, _, _ = npc_client()
    assert_error(post(client, {**ORDER, "allowPaid": True}), 422, "paid_errands_off")
    assert store.calls == []
    assert post(client).json()["accepted"]
    repeat = post(client, {**ORDER, "allowPaid": True, "target": "unknown"}).json()
    assert repeat["accepted"] and repeat["repeat"]
    assert store.calls == ["order"]


def test_fetch_response_uses_exact_stored_deadlines_and_reward():
    client, store, service, _ = npc_client()
    response = post(client)
    assert response.status_code == 200
    answer = response.json()
    assert answer["accepted"] and answer["reason"] is None and answer["coinsPaid"] == 50
    assert answer["order"] == {
        "number": 1,
        "seat": 2,
        "order": "fetch",
        "target": "C1",
        "orderedAt": 0,
        "arriveAt": 240,
        "foundAt": 600,
        "pinAt": 900,
        "readyAt": 900,
        "price": 0,
    }
    expected = pick_line(service.lines, "order_accepted", "go", 1, {"minutes": 10})
    assert answer["message"] == answer["line"] == expected
    assert service.broadcaster.events == [
        (store.current.crew_id, "partner_changed", {"version": 2})
    ]


def test_witness_fetch_only_pins_for_five_minutes_and_repeat_keeps_exact_line():
    client, store, service, _ = npc_client()
    body = {**ORDER, "seat": 4, "target": "C2"}
    answer = post(client, body).json()
    assert answer["accepted"] and answer["order"]["arriveAt"] is None
    assert answer["order"]["foundAt"] is None and answer["order"]["readyAt"] == 300
    expected = pick_line(service.lines, "order_accepted", "pin", 1, {"minutes": 5})
    assert answer["message"] == answer["line"] == expected
    store.current = replace(store.current, status="finished", npc_orders=())
    repeat = post(client, {**body, "seat": 1, "target": "unknown"}).json()
    assert repeat["accepted"] and repeat["repeat"] and repeat["line"] == expected
    assert not {"order", "coinsPaid", "minutes"}.intersection(repeat)
    assert len(service.broadcaster.events) == 1


def test_an_order_retried_on_a_different_endpoint_still_gets_its_exact_receipt():
    client, store, _, _ = npc_client()
    first = post(client).json()
    response = client.post(
        "/api/case/search",
        headers=HEADER,
        json={"routeId": "C8.missing_route", "actionUid": ORDER["actionUid"]},
    )
    assert response.status_code == 200
    answer = response.json()
    assert answer["accepted"] and answer["repeat"] and answer["line"] == first["line"]
    assert store.calls == ["order"]


def test_man_light_accepts_only_public_lights_and_takes_ten_minutes():
    client, store, service, _ = npc_client()
    light = next(item for item in service.data.active_lights if item.partners_may_man)
    store.current = replace(store.current, night_no=1, night_started_second=0)
    answer = post(client, {**ORDER, "order": "man_light", "target": light.id}).json()
    assert answer["accepted"] and answer["order"]["readyAt"] == 600
    assert answer["order"]["arriveAt"] is None and answer["order"]["pinAt"] is None
    expected = pick_line(
        service.lines, "order_accepted", "man_light", 1, {"minutes": 10, "light": light.name}
    )
    assert answer["message"] == answer["line"] == expected
    assert store.calls == ["order"]


@pytest.mark.parametrize(
    "mode,reason,minutes",
    [
        ("busy", "busy", 15),
        ("kit", "wrong_kit", None),
        ("window", "locked_window", 8),
        ("lead", "not_ready", None),
    ],
)
def test_four_refusal_groups_use_only_bank_lines_and_never_write(mode, reason, minutes):
    client, store, service, _ = npc_client()
    if mode == "busy":
        store.current = replace(
            store.current, npc_orders=(NpcOrder(1, 2, "deckhand", "fetch", "C1", 0, 900),)
        )
    elif mode == "kit":
        service.data, _ = generic_card(kinds=("kit",))
    elif mode == "window":
        service.data, _ = timed_data()
    else:
        service.data, _ = generic_card(opens_after=("D1",))
    answer = post(client).json()
    assert not answer["accepted"] and answer["reason"] == reason
    values = {"minutes": minutes or 0, "price": 0}
    expected = pick_line(service.lines, "cannot_do_it", reason, 0, values)
    assert answer["message"] == answer["line"] == expected
    if minutes is not None:
        assert answer["minutes"] == minutes
    assert not {"payPrice", "price", "seconds"}.intersection(answer)
    assert store.calls == service.broadcaster.events == []


@pytest.mark.parametrize(
    "reason",
    ["no_lead", "already_have", "not_carrying", "not_nightfall", "light_taken", "no_coins"],
)
def test_sql_race_reasons_map_to_minimum_not_ready(reason):
    client, store, service, _ = npc_client()
    store.scripted["order"] = [{"status": "refused", "reason": reason}]
    answer = post(client).json()
    assert not answer["accepted"] and answer["reason"] == "not_ready"
    assert answer["message"] == answer["line"]
    assert service.broadcaster.events == []


def test_sql_busy_rounds_seconds_up_and_reopens_no_more_than_once():
    client, store, service, _ = npc_client()
    store.scripted["order"] = [
        {"status": "refused", "reason": "case_not_open"},
        {"status": "refused", "reason": "busy", "seconds": 61},
    ]
    answer = post(client).json()
    assert answer["reason"] == "busy" and answer["minutes"] == 2
    assert store.calls == ["order", "order"] and service.broadcaster.events == []


def test_sql_window_race_uses_server_window_at_returned_minute():
    client, store, service, clock = npc_client()
    service.data, _ = timed_data()
    clock.advance(8 * 60)
    store.scripted["order"] = [{"status": "refused", "reason": "locked_window", "minute": 16}]
    answer = post(client).json()
    assert answer["reason"] == "locked_window" and answer["minutes"] == 12
    assert service.broadcaster.events == []


@pytest.mark.parametrize(
    "seat,status,code",
    [
        (1, "active", "not_a_partner"),
        (2, "forming", "crew_not_started"),
        (2, "finished", "crew_finished"),
    ],
)
def test_orders_require_a_partner_of_the_players_active_crew(seat, status, code):
    client, store, _, _ = npc_client()
    store.current = replace(store.current, status=status)
    assert_error(post(client, {**ORDER, "seat": seat}), 409, code)
    assert store.calls == []


def test_unknown_targets_are_404_and_a_different_player_cannot_reuse_an_order_uid():
    client, store, _, _ = npc_client()
    assert_error(post(client, {**ORDER, "target": "unknown"}), 404, "no_such_card")
    assert post(client).json()["accepted"]
    response = post(client, headers=FRIEND_HEADER).json()
    assert not response.get("repeat") and response["reason"] == "busy"
    assert store.calls == ["order"]


def test_sql_repeat_uses_the_exact_receipt_without_a_second_nudge():
    client, store, service, _ = npc_client()
    first = post(client).json()
    action = store.actions.pop((PLAYER, ORDER["actionUid"]))
    store.current = replace(store.current, npc_orders=())
    store.scripted["order"] = [action]
    answer = post(client).json()
    assert answer["accepted"] and answer["repeat"] and answer["line"] == first["line"]
    assert store.calls == ["order", "order"] and len(service.broadcaster.events) == 1


@pytest.mark.parametrize("reason", ["seat_changed", "not_in_crew", "state_changed"])
def test_sql_crew_races_remain_http_conflicts(reason):
    client, store, service, _ = npc_client()
    store.scripted["order"] = [{"status": "refused", "reason": reason}]
    assert_error(post(client), 409, "crew_busy")
    assert service.broadcaster.events == []


def test_the_order_route_uses_the_shared_case_write_budget():
    client, store, service, _ = npc_client()
    for _ in range(10):
        assert post(client).status_code == 200
    assert_error(post(client), 429, "too_many_requests")
    assert store.calls == ["order"] and len(service.broadcaster.events) == 1


def test_a_case_that_stays_closed_uses_no_more_than_one_reopen():
    client, store, service, _ = npc_client()
    store.scripted["order"] = [{"status": "refused", "reason": "case_not_open"}] * 2
    assert_error(post(client), 502, "database_error")
    assert store.calls == ["order", "order"] and service.broadcaster.events == []


def test_partner_light_refusals_map_to_minimum_groups():
    client, store, service, _ = npc_client()
    public = next(item for item in service.data.active_lights if item.partners_may_man)
    home = next(item for item in service.data.active_lights if not item.partners_may_man)
    for light, reason in [(public, "not_ready"), (home, "wrong_kit")]:
        answer = post(client, {**ORDER, "order": "man_light", "target": light.id}).json()
        assert not answer["accepted"] and answer["reason"] == reason
        assert answer["line"] == answer["message"]
    assert store.calls == service.broadcaster.events == []


def test_no_crew_or_unknown_light_uses_the_shared_http_error_contract():
    client, store, _, _ = npc_client()
    assert_error(
        post(client, {**ORDER, "order": "man_light", "target": "unknown"}), 404, "no_such_light"
    )
    store.current = None
    assert_error(post(client), 404, "no_crew")
    assert store.calls == []


def test_a_broken_bank_disables_the_case_without_logging_its_contents(monkeypatch, caplog):
    from server.game import case_service
    from server.game.npc_lines import NpcLinesError
    from server.settings import Settings

    def broken_bank():
        raise NpcLinesError("private bank contents")

    monkeypatch.setattr(case_service, "load_bank", broken_bank)
    assert case_service.case_or_none(Settings()) is None
    assert "private bank contents" not in caplog.text


def test_a_racing_refusal_uses_the_fresh_accepted_order_count_for_its_line():
    client, store, service, _ = npc_client()

    async def became_busy(current, data, player, uid, seat, card, decision):
        store.calls.append("order")
        store.current = replace(current, orders_count=3)
        return {"status": "refused", "reason": "busy", "seconds": 61}

    store.npc_fetch = became_busy
    answer = post(client).json()
    expected = pick_line(service.lines, "cannot_do_it", "busy", 3, {"minutes": 2})
    assert answer["reason"] == "busy" and answer["line"] == expected
    assert service.broadcaster.events == []


def test_real_case_view_gets_the_bank_and_advances_partner_dialogue_without_writes():
    client, store, service, clock = npc_client(real_view=True)
    answer = post(client, {**ORDER, "seat": 4, "target": "C2"}).json()
    witness = next(item for item in answer["case"]["partners"] if item["seat"] == 4)
    assert witness["status"] == "busy" and witness["job"]["remaining"] == 300
    assert witness["job"]["line"] == answer["line"]
    assert witness["job"]["done"] is False
    clock.advance(300)
    after = client.get("/api/case", headers=HEADER).json()["case"]
    witness = next(item for item in after["partners"] if item["seat"] == 4)
    expected = pick_line(service.lines, "pinned_card", "C2", 1, {})
    assert witness["status"] == "idle" and witness["job"]["done"] is True
    assert witness["job"]["line"] == expected
    assert after["writeRevision"] == answer["case"]["writeRevision"]
    assert store.calls == ["order"] and len(service.broadcaster.events) == 1
