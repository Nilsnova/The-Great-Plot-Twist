"""Scripted store port for service orchestration; decisions use the real case rules."""

from dataclasses import replace
from itertools import combinations

from server.game.case_board import deduction_for_pair
from server.game.case_data import load_case
from server.game.case_service import CaseService
from server.game.case_snapshot import Find, Formed, Pin, Post
from server.game.finale_geometry import bearing_to, schooner_position
from server.tests.case_rule_helpers import FRIEND, PLAYER, START, snapshot
from server.tests.helpers import FakeClock


class Store:
    def __init__(self, current, replies):
        self.current = current
        self.replies = list(replies)
        self.actions = {}
        self.trace = []
        self.writes = []
        self.after_write = None

    async def action_lookup(self, player, uid):
        self.trace.append("lookup")
        return self.actions.get((player, uid))

    async def snapshot(self, player, crew_id=None):
        self.trace.append("snapshot")
        return self.current

    async def open(self, current, data):
        self.trace.append("open")
        return {"status": "opened"}

    async def write(self, kind, args):
        self.trace.append(kind)
        self.writes.append((kind, args))
        reply = self.replies.pop(0)
        if reply.get("revision"):
            self.current = replace(self.current, write_revision=reply["revision"])
        if self.after_write is not None:
            self.current = self.after_write(self.current)
        return reply

    async def pin(self, *args):
        return await self.write("pin", args)

    async def pair(self, *args):
        return await self.write("pair", args)

    async def nightfall(self, *args):
        return await self.write("nightfall", args)

    async def post(self, *args):
        return await self.write("post", args)

    async def signal(self, *args):
        return await self.write("signal", args)


class Sender:
    def __init__(self):
        self.events = []

    async def send(self, *event):
        self.events.append(event)
        return True


def scenario(kind, reply, *, wrong=False):
    data = load_case()
    crew = snapshot()
    starts = tuple(
        Find(seat.seat_no, route.card_id, route.id, 0, 0)
        for seat in crew.seats
        for route in data.routes
        if route.starts_in_journal and route.kit == seat.kit
    )
    crew = replace(crew, finds=starts)
    card = data.cards[0]
    cards = data.deductions[0].cards
    if wrong:
        cards = next(
            pair
            for pair in combinations((card.id for card in data.cards), 2)
            if deduction_for_pair(data, *pair) is None
        )
    light = next(light for light in data.active_lights if light.ready.get("from_start"))
    if kind == "pin":
        crew = replace(crew, finds=(*starts, Find(1, card.id, card.routes[0].id, 0, 0)))
        targets = (card.id,)
    elif kind == "pair":
        crew = replace(crew, pins=(Pin(1, cards[0], 0, 0, PLAYER), Pin(3, cards[1], 0, 0, FRIEND)))
        targets = cards
    else:
        crew = replace(crew, formed=tuple(Formed(value, 0) for value in data.night.opens_after))
        targets = () if kind == "nightfall" else (light.id,)
        if kind != "nightfall":
            crew = replace(crew, night_no=1, night_started_second=0)
        if kind == "signal":
            crew = replace(crew, posts=(Post(light.id, 1, 0, 0, PLAYER),))
            bearing = bearing_to(light.chart_xy, schooner_position(crew.crew_id, data.night.chart))
            targets = (light.id, (bearing + (180 if wrong else 0)) % 360)
    clock = FakeClock()
    clock.now = START
    sender = Sender()
    service = CaseService(data, clock=clock, broadcaster=sender)
    store = Store(crew, [reply])
    service.store_for = lambda admin: store
    service.view = lambda current, player: (
        None if current is None else {"writeRevision": current.write_revision}
    )
    return service, store, sender, targets


async def intent(service, kind, targets, uid="intent0001"):
    return await getattr(service, kind)(None, PLAYER, *targets, uid)
