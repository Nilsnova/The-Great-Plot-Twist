"""Frozen outcomes of partner eligibility and order decisions, without bank text.

Used by: npc_orders, the case service, partner views and deterministic tests.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class RouteChoice:
    route_id: str | None = None
    reason: str | None = None
    minutes: int = 0


@dataclass(frozen=True)
class OrderDecision:
    accepted: bool
    reason: str | None = None
    raw_reason: str | None = None
    event: str = "order_accepted"
    variant: str = "fetch"
    minutes: int = 0
    price: int = 0
    route_id: str | None = None
    result_card: str | None = None
    arrive_second: int | None = None
    found_second: int | None = None
    pin_second: int | None = None
    ready_second: int | None = None
