"""T7: read-only weekly island ranking; never return invitation codes or player IDs."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from pydantic import BaseModel, Field, StrictInt

from server.errors import ApiError
from server.island.store import read_display_name, read_model
from server.supabase_admin import SupabaseAdmin

PAGE_SIZE = 100
MAX_PAGES = 20


class WaveRow(BaseModel):
    island_owner: UUID
    wave: StrictInt = Field(ge=1, le=1000)


class Entry(BaseModel):
    rank: int
    name: str
    wave: int


class Leaderboard(BaseModel):
    weekStart: datetime
    weekEnd: datetime
    entries: list[Entry]


async def weekly(admin: SupabaseAdmin, now: datetime | None = None) -> Leaderboard:
    """Scan highest waves first until ten distinct islands or the end, not ten runs.

    The fixed cutoff excludes finishes during pagination. A bounded scan fails visibly
    rather than returning an incomplete ranking. IDs only break ties internally.
    """
    now = (now or datetime.now(UTC)).astimezone(UTC)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=now.weekday())
    end = start + timedelta(days=7)
    best: dict[str, int] = {}
    for page in range(MAX_PAGES):
        rows = await admin.select_rows(
            "wave_runs",
            {
                "select": "island_owner,wave",
                "place": "eq.island",
                "survived": "eq.true",
                "expired": "eq.false",
                "and": (
                    f"(finished_at.gte.{start.isoformat()},"
                    f"finished_at.lt.{end.isoformat()},finished_at.lte.{now.isoformat()})"
                ),
                "order": "wave.desc,island_owner.asc,id.asc",
                "limit": str(PAGE_SIZE),
                "offset": str(page * PAGE_SIZE),
            },
        )
        for raw in rows:
            row = read_model(WaveRow, raw)
            best.setdefault(str(row.island_owner), row.wave)
            if len(best) == 10:
                break
        if len(best) == 10 or len(rows) < PAGE_SIZE:
            break
    else:
        raise ApiError(503, "leaderboard_unavailable", "The leaderboard is busy. Try again later.")
    entries = []
    previous, rank = None, 0
    for position, (owner, wave) in enumerate(best.items(), 1):
        if wave != previous:
            rank = position
        entries.append(Entry(rank=rank, name=await read_display_name(admin, owner), wave=wave))
        previous = wave
    return Leaderboard(weekStart=start, weekEnd=end, entries=entries)
