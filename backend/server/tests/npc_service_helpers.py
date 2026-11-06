"""Immutable receipt fixtures and a scripted NPC store port; decisions and lines are real."""

from dataclasses import replace

from server.game.case_data import load_case
from server.game.case_service import CaseService
from server.game.case_snapshot import Find, Formed, Order
from server.game.npc_lines import load_lines
from server.tests.case_rule_helpers import PLAYER, START, snapshot
from server.tests.case_service2_helpers import Sender
from server.tests.helpers import FakeClock


class Store:
    def __init__(self, crew, record):
        self.current = crew
        self.record = record
        self.records = {record.order_no: record}
        self.actions = {}
        self.replies = []
        self.trace = []
        self.writes = []
        self.on_open = None
        self.after_reply = None

    async def action_lookup(self, player, uid):
        self.trace.append("lookup")
        return self.actions.get((player, uid))

    async def snapshot(self, player, crew_id=None):
        self.trace.append("snapshot")
        return self.current

    async def order_lookup(self, player, crew_id, number):
        self.trace.append(("receipt", player, crew_id, number))
        return self.records.get(number)

    async def open(self, crew, data):
        self.trace.append("open")
        if self.on_open is not None:
            self.current = self.on_open(self.current)
        return {"status": "opened"}

    async def order(self, crew, data, player, uid, seat_no, kind, target, decision):
        self.trace.append("write")
        self.writes.append((crew, player, uid, seat_no, kind, target, decision))
        record = self.record
        reply = {"status": "done", "orderNo": record.order_no, "revision": 7}
        if kind == "fetch":
            reply.update(foundSecond=record.found_second, pinSecond=record.pin_second, coinsPaid=50)
        else:
            reply["onPostSecond"] = record.ready_second
        if self.replies:
            reply = self.replies.pop(0)
        if reply["status"] == "done":
            self.current = replace(
                self.current,
                orders_count=record.order_no,
                orders=(record,),
                write_revision=reply["revision"],
            )
            self.actions[(player, uid)] = {
                "status": "repeat",
                "crewId": crew.crew_id,
                "kind": "order",
                "target": str(record.order_no),
                "outcome": record.kind,
            }
        if self.after_reply is not None:
            self.current = self.after_reply(self.current)
        return reply


def scenario(kind="fetch", *, pin_only=False):
    data = load_case()
    crew = snapshot()
    finds = tuple(
        Find(seat.seat_no, route.card_id, route.id, 0, 0)
        for seat in crew.seats
        for route in data.routes
        if route.starts_in_journal and route.kit == seat.kit
    )
    crew = replace(crew, finds=finds, formed=tuple(Formed(item.id, 0) for item in data.deductions))
    seat_no = 4 if pin_only else 2
    partner = next(seat for seat in crew.seats if seat.seat_no == seat_no)
    target = data.kit(partner.kit).cheap_card
    if kind == "man_light":
        target = next(light.id for light in data.active_lights if light.partners_may_man)
        crew = replace(crew, night_no=1, night_started_second=0)
    clock = FakeClock()
    clock.now = START
    sender = Sender()
    service = CaseService(data, clock=clock, broadcaster=sender, lines=load_lines())
    record = Order(
        3,
        seat_no,
        partner.npc_id,
        kind,
        target,
        11,
        311 if pin_only else (911 if kind == "fetch" else 611),
        PLAYER,
        result_card=target if kind == "fetch" else None,
        arrive_second=251 if kind == "fetch" and not pin_only else None,
        found_second=611 if kind == "fetch" and not pin_only else None,
        pin_second=(311 if pin_only else 911) if kind == "fetch" else None,
    )
    store = Store(crew, record)
    service.store_for = lambda admin: store
    service.view = lambda current, player: (
        None
        if current is None
        else {
            "ordersCount": current.orders_count,
            "writeRevision": current.write_revision,
        }
    )
    return service, store, sender, seat_no, target


async def call(
    service, seat_no, target, *, kind="fetch", paid=False, uid="order0001", player=PLAYER
):
    return await service.order(None, player, seat_no, kind, target, paid, uid)
