"""Replaceable crew records for partner decision tests, with no protected story prose.

Used by: the NPC order, refusal and kit tests.
"""

from dataclasses import replace

from server.game.case_snapshot import Formed, Order
from server.tests.case_rule_helpers import PLAYER, snapshot


def open_crew(data):
    return replace(snapshot(), formed=tuple(Formed(item.id, 0) for item in data.deductions))


def partner_card(data, partner):
    return data.card(data.kit(partner.kit).cheap_card)


def stored_order(crew, ready_second, **changes):
    order = Order(1, 2, crew.seats[1].npc_id, "fetch", "C1", 0, ready_second, PLAYER)
    return replace(order, **changes)


def replace_routes(data, card, routes):
    return replace(
        data,
        cards=tuple(
            replace(item, routes=tuple(routes)) if item.id == card.id else item
            for item in data.cards
        ),
    )
