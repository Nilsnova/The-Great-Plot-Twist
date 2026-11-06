"""Pure FIFO pairing proposals for the Keepers' Ring; A7 alone creates duels."""

from dataclasses import dataclass

from server.festival.timer import FestivalTimer


@dataclass(frozen=True)
class RingDecision:
    status: str
    queue: tuple[str, ...]
    pair: tuple[str, str] | None = None


def join_ring(
    player_id: str,
    queue: tuple[str, ...],
    active_players: frozenset[str],
    timer: FestivalTimer,
    *,
    arena_enabled: bool,
) -> RingDecision:
    """Propose two distinct idle players; do not charge coins or mutate a duel.

    Future storage must lock the queue, deduplicate actionUid and invoke A7 in one
    transaction. A proposal is not proof that a duel exists or stakes were paid.
    """
    if not player_id or not player_id.strip():
        raise ValueError("A verified player is required.")
    if timer.phase != "active" or not arena_enabled:
        return RingDecision("closed", queue)
    if player_id in active_players:
        return RingDecision("in_duel", queue)
    waiting = tuple(dict.fromkeys(player for player in queue if player not in active_players))
    if player_id in waiting:
        return RingDecision("repeated", waiting)
    if not waiting:
        return RingDecision("queued", (player_id,))
    return RingDecision("paired", waiting[1:], (waiting[0], player_id))
