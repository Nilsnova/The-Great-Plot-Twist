"""Read the shared coast and build its public, spoiler-safe world view.

Used by the world route, the bulletin stage reader and the Island Exchange relit check.
All database reads use the existing server-only admin port; no browser grants are needed.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from server.clock import Clock, utc_now
from server.supabase_admin import SupabaseAdmin, SupabaseNotConfigured, SupabaseRejected
from server.world_stage import DARK, RELIT, WorldStage

WORLD_COLUMNS = "stage,relit_at,solves,extra_lights"
WALL_COLUMNS = "solve_no,added_at,profiles(display_name)"
CACHE_SECONDS = 30


@dataclass(frozen=True)
class WallName:
    name: str
    order: int


@dataclass(frozen=True)
class WorldSnapshot:
    stage: str = DARK
    relit_at: datetime | None = None
    solves: int = 0
    extra_lights: int = 0
    wall: tuple[WallName, ...] = ()


def world_from_row(row: dict) -> WorldSnapshot:
    """Refuse malformed state rather than showing a partly relit coast."""
    try:
        raw_time = row["relit_at"]
        relit_at = None if raw_time is None else datetime.fromisoformat(raw_time)
        stage = WorldStage(row["stage"], relit_at)
        solves, extra = row["solves"], row["extra_lights"]
        if type(solves) is not int or solves < 0 or type(extra) is not int or not 0 <= extra <= 12:
            raise ValueError
        if (stage.stage == DARK and (solves or extra)) or (stage.stage == RELIT and solves < 1):
            raise ValueError
        return WorldSnapshot(stage.stage, relit_at, solves, extra)
    except (KeyError, ValueError, TypeError, AttributeError):
        raise SupabaseRejected("The shared coast state could not be read.") from None


def wall_from_rows(rows: list) -> tuple[WallName, ...]:
    result = []
    if not isinstance(rows, list):
        raise SupabaseRejected("The Wall of Lights could not be read.")
    for row in rows:
        profile = row.get("profiles") if isinstance(row, dict) else None
        order = row.get("solve_no") if isinstance(row, dict) else None
        name = profile.get("display_name") if isinstance(profile, dict) else None
        if not isinstance(name, str) or not name or type(order) is not int or order < 1:
            raise SupabaseRejected("The Wall of Lights could not be read.")
        result.append(WallName(name, order))
    return tuple(result)


async def read_world_state(admin: SupabaseAdmin) -> WorldSnapshot:
    """A laptop without configured credentials sees dark; real read failures stay visible."""
    try:
        rows = await admin.select_rows(
            "world_state", {"select": WORLD_COLUMNS, "id": "eq.1", "limit": "1"}
        )
    except SupabaseNotConfigured:
        return WorldSnapshot()
    if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
        raise SupabaseRejected("The shared coast state could not be read.")
    return world_from_row(rows[0])


async def read_world(admin: SupabaseAdmin) -> WorldSnapshot:
    state = await read_world_state(admin)
    if state.stage == DARK:
        return state
    rows = await admin.select_rows(
        "wall_of_lights",
        {
            "select": WALL_COLUMNS,
            "order": "solve_no.asc,added_at.asc,player_id.asc",
            "limit": "200",
        },
    )
    return WorldSnapshot(
        state.stage, state.relit_at, state.solves, state.extra_lights, wall_from_rows(rows)
    )


def build_world_view(state: WorldSnapshot, line: str) -> dict:
    """Expose names and solve order only, never crew ids, player ids or case explanation."""
    relit = state.stage == RELIT
    return {
        "stage": state.stage,
        "lightsOn": relit,
        "fogBankGone": relit,
        "gullsRestOpen": relit,
        "extraLights": state.extra_lights,
        "solves": state.solves,
        "relitAt": None if state.relit_at is None else state.relit_at.astimezone(UTC).isoformat(),
        "wall": [{"name": entry.name, "order": entry.order} for entry in state.wall]
        if relit
        else [],
        "line": line if relit else None,
    }


class DatabaseWorldStage:
    """The open-world reader port, cached briefly per server instance (never on read errors)."""

    def __init__(self, admin: SupabaseAdmin, *, clock: Clock = utc_now) -> None:
        self.admin = admin
        self.clock = clock
        self.cached: WorldStage | None = None
        self.expires: datetime | None = None

    async def read(self) -> WorldStage:
        now = self.clock()
        if self.cached is not None and self.expires is not None and now < self.expires:
            return self.cached
        state = await read_world_state(self.admin)
        self.cached = WorldStage(state.stage, state.relit_at)
        self.expires = now + timedelta(seconds=CACHE_SECONDS)
        return self.cached


async def relit_check(admin: SupabaseAdmin) -> bool:
    """The Exchange port: fees and Greyfathom listing follow the same shared state."""
    return (await read_world_state(admin)).stage == RELIT
