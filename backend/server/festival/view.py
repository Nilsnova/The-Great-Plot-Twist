"""Build a public festival timer with optional own-player state; never expose queue signals."""

import math
from datetime import UTC, datetime

from server.festival.content import FestivalContent
from server.festival.timer import festival_timer
from server.game.world_state import WorldSnapshot


def iso_second(value: datetime | None) -> str | None:
    return (
        None
        if value is None
        else value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
    )


def build_view(
    content: FestivalContent,
    world: WorldSnapshot,
    now: datetime,
    claims: dict[str, str],
    mine: dict | None,
    player_id: str | None,
    *,
    arena_enabled: bool,
) -> dict:
    timer = festival_timer(world.relit_at, now, content.duration_seconds)
    active = timer.phase == "active"
    return {
        "phase": timer.phase,
        "startsAt": iso_second(timer.starts_at),
        "endsAt": iso_second(timer.ends_at),
        "remainingSeconds": math.ceil(timer.remaining_seconds),
        "lamps": [
            {
                "id": lamp,
                "label": f"Festival lamp {index + 1}",
                "lit": index < world.extra_lights,
                "claimed": active and lamp in claims,
                "claimedByMe": active and player_id is not None and claims.get(lamp) == player_id,
            }
            for index, lamp in enumerate(content.lamp_ids)
        ],
        "ring": {
            "available": active and arena_enabled,
            "queued": active and mine is not None and mine["state"] == "queued",
            "duelId": mine["duel_id"] if mine is not None and mine["state"] == "paired" else None,
        },
        "serverTime": iso_second(now),
    }
