"""Exclusive festival lamp reservations; future storage must serialize these decisions."""

from dataclasses import dataclass

from server.festival.timer import FestivalTimer


@dataclass(frozen=True)
class LampClaim:
    lamp_id: str
    player_id: str


@dataclass(frozen=True)
class ClaimDecision:
    status: str
    claims: tuple[LampClaim, ...]


def visible_claims(claims: tuple[LampClaim, ...], timer: FestivalTimer) -> tuple[LampClaim, ...]:
    """Claims expire at the festival boundary, without erasing durable replay records."""
    return claims if timer.phase == "active" else ()


def claim_lamp(
    player_id: str,
    lamp_id: str,
    lamp_ids: tuple[str, ...],
    claims: tuple[LampClaim, ...],
    timer: FestivalTimer,
) -> ClaimDecision:
    """One owner per lamp; the same owner repeating a claim leaves it unchanged.

    A player may claim different lamps: the request limits each player/lamp pair,
    not each player's total. actionUid replay belongs to the future storage layer.
    """
    if not player_id or not player_id.strip():
        raise ValueError("A verified player is required.")
    if lamp_id not in lamp_ids:
        return ClaimDecision("unknown_lamp", claims)
    if timer.phase != "active":
        return ClaimDecision("closed", claims)
    for claim in claims:
        if claim.lamp_id == lamp_id:
            status = "repeated" if claim.player_id == player_id else "occupied"
            return ClaimDecision(status, claims)
    return ClaimDecision("claimed", (*claims, LampClaim(lamp_id, player_id)))
