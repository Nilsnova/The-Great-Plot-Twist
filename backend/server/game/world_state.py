"""Read checked public world state through the existing server database port.

Used by: the world route, bulletin WorldStageReader port and market relit callback. The
case flag is checked before database or content reads, including the no-argument stage port.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, StrictStr, ValidationError

from server.clock import Clock, utc_now
from server.errors import ApiError
from server.game.case_data import load_case
from server.supabase_admin import SupabaseAdmin, SupabaseAdminError, SupabaseNotConfigured
from server.world_stage import DARK, RELIT, WorldStage

CACHE_SECONDS = 30
WALL_LIMIT = 200
PRIVATE_HEADERS = {"Cache-Control": "private, no-store"}


class WorldRow(BaseModel):
    stage: Literal["dark", "relit"]
    relit_at: StrictStr | None
    solves: int = Field(strict=True, ge=0)
    extra_lights: int = Field(strict=True, ge=0, le=12)


class WallProfile(BaseModel):
    display_name: StrictStr = Field(min_length=1)


class WallRow(BaseModel):
    solve_no: int = Field(strict=True, ge=1)
    added_at: StrictStr
    profiles: WallProfile


@dataclass(frozen=True)
class WorldRecord:
    stage: WorldStage
    solves: int = 0
    extra_lights: int = 0


def unavailable() -> ApiError:
    return ApiError(
        503,
        "database_unavailable",
        "The world state is not available right now. Try again soon.",
        PRIVATE_HEADERS,
    )


def _moment(text: str) -> datetime:
    value = datetime.fromisoformat(text)
    if value.tzinfo is None:
        raise ValueError("A world time needs a timezone.")
    return value.astimezone(UTC)


async def _rows(admin: SupabaseAdmin, table: str, query: dict) -> list[dict]:
    try:
        rows = await admin.select_rows(table, query)
    except SupabaseNotConfigured:
        raise
    except SupabaseAdminError:
        raise unavailable() from None
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise unavailable()
    return rows


async def read_world(admin: SupabaseAdmin | None) -> WorldRecord:
    if admin is None:
        return WorldRecord(WorldStage(DARK, None))
    try:
        rows = await _rows(
            admin,
            "world_state",
            {
                "select": "stage,relit_at,solves,extra_lights",
                "id": "eq.1",
                "limit": "1",
            },
        )
    except SupabaseNotConfigured:
        return WorldRecord(WorldStage(DARK, None))
    if len(rows) != 1:
        raise unavailable()
    try:
        row = WorldRow.model_validate(rows[0])
        moment = None if row.relit_at is None else _moment(row.relit_at)
        return WorldRecord(WorldStage(row.stage, moment), row.solves, row.extra_lights)
    except (ValidationError, ValueError, TypeError):
        raise unavailable() from None


async def _wall(admin: SupabaseAdmin) -> list[dict]:
    try:
        rows = await _rows(
            admin,
            "wall_of_lights",
            {
                "select": "solve_no,added_at,profiles(display_name)",
                "order": "solve_no.asc,added_at.asc",
                "limit": str(WALL_LIMIT),
            },
        )
    except SupabaseNotConfigured:
        raise unavailable() from None
    if len(rows) > WALL_LIMIT:
        raise unavailable()
    try:
        entries = [WallRow.model_validate(row) for row in rows]
        for entry in entries:
            _moment(entry.added_at)
        return [{"name": entry.profiles.display_name, "order": entry.solve_no} for entry in entries]
    except (ValidationError, ValueError, TypeError):
        raise unavailable() from None


def _public_line() -> str:
    return load_case().raw["relighting"]["spoiler_rule"]["everyone_else_sees"]


async def relit_check(admin: SupabaseAdmin | None, *, enabled: bool = False) -> bool:
    """The uncached callback; callers must explicitly enable the case before any read."""
    return enabled and (await read_world(admin)).stage.stage == RELIT


class WorldReader:
    def __init__(
        self,
        admin: SupabaseAdmin | None,
        *,
        enabled: bool = False,
        clock: Clock = utc_now,
        line_loader: Callable[[], str] = _public_line,
    ) -> None:
        self.admin = admin
        self.enabled = enabled
        self.clock = clock
        self.line_loader = line_loader
        self._cached: WorldRecord | None = None
        self._cached_at: datetime | None = None

    async def _record(self) -> WorldRecord:
        if not self.enabled:
            return WorldRecord(WorldStage(DARK, None))
        now = self.clock()
        if self._cached is not None and self._cached_at is not None:
            age = (now - self._cached_at).total_seconds()
            if 0 <= age < CACHE_SECONDS:
                return self._cached
        record = await read_world(self.admin)
        self._cached, self._cached_at = record, now
        return record

    async def read(self) -> WorldStage:
        return (await self._record()).stage

    async def relit_check(self, admin: SupabaseAdmin | None) -> bool:
        """Share this reader's configured admin and cache; the callback admin is unused."""
        return (await self.read()).stage == RELIT

    async def view(self) -> dict:
        record = await self._record()
        is_relit = record.stage.stage == RELIT
        wall, line = [], None
        if is_relit:
            wall = await _wall(self.admin)
            try:
                line = self.line_loader()
                if not isinstance(line, str) or not line.strip():
                    raise ValueError("A public world line is required.")
            except (OSError, ValueError, TypeError, KeyError):
                raise unavailable() from None
        moment = record.stage.relit_at
        return {
            "stage": record.stage.stage,
            "lightsOn": is_relit,
            "fogBankGone": is_relit,
            "gullsRestOpen": is_relit,
            "extraLights": record.extra_lights,
            "solves": record.solves,
            "relitAt": None
            if moment is None
            else moment.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "wall": wall,
            "line": line,
        }
