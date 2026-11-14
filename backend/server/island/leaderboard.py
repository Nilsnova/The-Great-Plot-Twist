"""T7 and T45: read-only island rankings, this UTC week or all time.

Used by: GET /api/island/leaderboard (backend/server/routes/island.py).
Scores come only from finished winning island runs in `wave_runs`, never from the
island's current or best-wave column, so a restart or a later reset cannot lower a
score (decision D046). Never returns invitation codes or player IDs.
"""

from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, StrictInt

from server.errors import ApiError
from server.island.store import read_display_name, read_model
from server.supabase_admin import SupabaseAdmin

PAGE_SIZE = 100
MAX_PAGES = 20
TOP = 10

Scope = Literal["week", "all"]


class WaveRow(BaseModel):
    id: UUID
    island_owner: UUID
    wave: StrictInt = Field(ge=1, le=1000)


class CaptainRow(BaseModel):
    player_id: UUID


class Entry(BaseModel):
    rank: int
    name: str
    wave: int
    crew: int  # captains who fought the scoring run: 1 is solo


class Leaderboard(BaseModel):
    scope: Scope
    weekStart: datetime | None
    weekEnd: datetime | None
    entries: list[Entry]


def week_of(now: datetime) -> tuple[datetime, datetime]:
    """Monday 00:00 UTC of this week, and the next Monday."""
    start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=now.weekday())
    return start, start + timedelta(days=7)


async def weekly(admin: SupabaseAdmin, now: datetime | None = None) -> Leaderboard:
    now = (now or datetime.now(UTC)).astimezone(UTC)
    start, end = week_of(now)
    window = {
        "and": (
            f"(finished_at.gte.{start.isoformat()},"
            f"finished_at.lt.{end.isoformat()},finished_at.lte.{now.isoformat()})"
        )
    }
    entries = await ranked(admin, await best_runs(admin, window))
    return Leaderboard(scope="week", weekStart=start, weekEnd=end, entries=entries)


async def all_time(admin: SupabaseAdmin, now: datetime | None = None) -> Leaderboard:
    """Every winning run ever finished up to this request: this board never resets."""
    now = (now or datetime.now(UTC)).astimezone(UTC)
    runs = await best_runs(admin, {"finished_at": f"lte.{now.isoformat()}"})
    return Leaderboard(scope="all", weekStart=None, weekEnd=None, entries=await ranked(admin, runs))


async def best_runs(admin: SupabaseAdmin, window: dict[str, str]) -> list[WaveRow]:
    """Scan highest waves first until ten distinct islands or the end, not ten runs.

    Equal waves come earliest finish first, so the island that reached a wave first is
    listed first (D046). The fixed cutoff excludes finishes during pagination. A bounded
    scan fails visibly rather than returning an incomplete ranking.
    """
    best: dict[UUID, WaveRow] = {}
    for page in range(MAX_PAGES):
        query = {
            "select": "id,island_owner,wave",
            "place": "eq.island",
            "survived": "eq.true",
            "expired": "eq.false",
            **window,
            "order": "wave.desc,finished_at.asc,id.asc",
            "limit": str(PAGE_SIZE),
            "offset": str(page * PAGE_SIZE),
        }
        rows = await admin.select_rows("wave_runs", query)
        for raw in rows:
            run = read_model(WaveRow, raw)
            best.setdefault(run.island_owner, run)
            if len(best) == TOP:
                return list(best.values())
        if len(rows) < PAGE_SIZE:
            return list(best.values())
    raise ApiError(503, "leaderboard_unavailable", "The leaderboard is busy. Try again later.")


async def ranked(admin: SupabaseAdmin, runs: list[WaveRow]) -> list[Entry]:
    """Competition ranks (1, 1, 3): equal waves share a rank number."""
    entries = []
    previous, rank = None, 0
    for position, run in enumerate(runs, 1):
        if run.wave != previous:
            rank = position
        name = await read_display_name(admin, str(run.island_owner))
        crew = await crew_size(admin, run.id)
        entries.append(Entry(rank=rank, name=name, wave=run.wave, crew=crew))
        previous = run.wave
    return entries


async def crew_size(admin: SupabaseAdmin, wave_id: UUID) -> int:
    """How many captains joined the scoring run. Only the count leaves the server."""
    rows = await admin.select_rows(
        "wave_participants", {"select": "player_id", "wave_id": f"eq.{wave_id}"}
    )
    captains = [read_model(CaptainRow, raw) for raw in rows]
    # The bell-ringer is always a participant (migration 20261110020000 backfilled old
    # runs), so an empty answer would be a gap in old data: show it as solo, never 0.
    return max(1, len(captains))
