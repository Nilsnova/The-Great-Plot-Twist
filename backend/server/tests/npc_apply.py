"""Test-only NPC writes mirror SQL after the production partner decision accepts.

Used by: the 69-crew case proof. Effective seconds settle by reads; this helper never runs itself.
"""

from dataclasses import replace

from server.game.case_data import CaseData
from server.game.case_snapshot import CaseSnapshot, Find, Order, Pin, Post, SeatState
from server.game.npc_orders import decide_order


class NpcApplyFailure(ValueError):
    """A planned partner action failed, without including content in diagnostics."""


def leave_post(snapshot: CaseSnapshot, seat_no: int, now: int) -> CaseSnapshot:
    old_lights = {
        post.light_id
        for post in snapshot.posts
        if post.seat_no == seat_no and post.ended_second is None
    }
    posts = tuple(
        replace(post, ended_second=now)
        if post.seat_no == seat_no and post.ended_second is None
        else post
        for post in snapshot.posts
    )
    signals = tuple(
        replace(signal, ended_second=now)
        if signal.light_id in old_lights
        and signal.night_no == snapshot.night_no
        and signal.on_target
        and signal.ended_second is None
        and signal.holds_until_second is not None
        and signal.holds_until_second > now
        else signal
        for signal in snapshot.signals
    )
    return replace(snapshot, posts=posts, signals=signals)


def _fetch_rows(snapshot: CaseSnapshot, order: Order) -> CaseSnapshot:
    finds = snapshot.finds
    if order.found_second is not None:
        finds = (
            *finds,
            Find(
                order.seat_no,
                order.result_card,
                order.route_id,
                order.ordered_second,
                order.found_second,
                order.ordered_by,
                True,
                order.order_no,
                order.price,
            ),
        )
    pin = Pin(
        order.seat_no,
        order.result_card,
        order.pin_second,
        order.ordered_second,
        order.ordered_by,
        True,
    )
    return replace(snapshot, finds=finds, pins=(*snapshot.pins, pin))


def _post_row(snapshot: CaseSnapshot, order: Order) -> CaseSnapshot:
    old = next(
        (
            post
            for post in snapshot.posts
            if post.light_id == order.target and post.ended_second is None
        ),
        None,
    )
    if old is not None:
        snapshot = leave_post(snapshot, old.seat_no, order.ordered_second)
    post = Post(
        order.target,
        order.seat_no,
        order.ordered_second,
        order.ready_second,
        npc_id=order.npc_id,
        order_no=order.order_no,
        id=max((post.id for post in snapshot.posts), default=0) + 1,
    )
    return replace(snapshot, posts=(*snapshot.posts, post))


def apply_order(
    data: CaseData,
    snapshot: CaseSnapshot,
    actor: SeatState,
    partner: SeatState,
    kind: str,
    target: str,
    now: int,
) -> tuple[CaseSnapshot, Order]:
    decision = decide_order(data, snapshot, actor, partner, kind, target, now)
    if not decision.accepted:
        raise NpcApplyFailure("The production partner order rule refused a planned step.")
    if decision.price != 0 or decision.ready_second is None:
        raise NpcApplyFailure("The partner proof needs a free order with a fixed ready second.")
    order = Order(
        snapshot.orders_count + 1,
        partner.seat_no,
        partner.npc_id,
        kind,
        target,
        now,
        decision.ready_second,
        actor.player_id,
        decision.route_id,
        decision.result_card,
        decision.price,
        decision.arrive_second,
        decision.found_second,
        decision.pin_second,
    )
    snapshot = leave_post(snapshot, partner.seat_no, now)
    snapshot = _fetch_rows(snapshot, order) if kind == "fetch" else _post_row(snapshot, order)
    return replace(
        snapshot,
        orders=(*snapshot.orders, order),
        orders_count=order.order_no,
        write_revision=snapshot.write_revision + 1,
    ), order
