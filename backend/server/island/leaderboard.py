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

from server.island.store import NameRow, read_model, unreadable
from server.supabase_admin import SupabaseAdmin

TOP = 10

Scope = Literal["week", "all"]


class WaveRow(BaseModel):
    id: UUID
    island_owner: UUID
    wave: StrictInt = Field(ge=1, le=1000)


class CaptainRow(BaseModel):
    wave_id: UUID
    player_id: UUID


class NameOwnerRow(NameRow):
    id: UUID


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
    runs = await best_runs(admin, now, start, end)
    entries = await ranked(admin, runs)
    return Leaderboard(scope="week", weekStart=start, weekEnd=end, entries=entries)


async def all_time(admin: SupabaseAdmin, now: datetime | None = None) -> Leaderboard:
    """Every winning run ever finished up to this request: this board never resets."""
    now = (now or datetime.now(UTC)).astimezone(UTC)
    runs = await best_runs(admin, now)
    return Leaderboard(scope="all", weekStart=None, weekEnd=None, entries=await ranked(admin, runs))


async def best_runs(
    admin: SupabaseAdmin,
    cutoff: datetime,
    window_start: datetime | None = None,
    window_end: datetime | None = None,
) -> list[WaveRow]:
    """Ask the database for the top ten best winning runs, one per island (D046)."""
    rows = await admin.call_function(
        "leaderboard_best_runs",
        {
            "p_cutoff": cutoff.isoformat(),
            "p_window_start": window_start.isoformat() if window_start else None,
            "p_window_end": window_end.isoformat() if window_end else None,
        },
    )
    if not isinstance(rows, list) or len(rows) > TOP:
        raise unreadable()
    return [read_model(WaveRow, row) for row in rows]


async def ranked(admin: SupabaseAdmin, runs: list[WaveRow]) -> list[Entry]:
    """Competition ranks (1, 1, 3): equal waves share a rank number.

    Two batched reads for the whole board (names, then crews), not two per row.
    """
    if not runs:
        return []
    names = await read_names(admin, [run.island_owner for run in runs])
    crews = await crew_sizes(admin, [run.id for run in runs])
    entries = []
    previous, rank = None, 0
    for position, run in enumerate(runs, 1):
        if run.wave != previous:
            rank = position
        entries.append(
            Entry(rank=rank, name=names[run.island_owner], wave=run.wave, crew=crews[run.id])
        )
        previous = run.wave
    return entries


async def read_names(admin: SupabaseAdmin, owners: list[UUID]) -> dict[UUID, str]:
    """The captain names of some islands in one read: profiles with id=in.(...)."""
    wanted = sorted({str(owner) for owner in owners})
    query = {
        "select": "id,display_name",
        "id": f"in.({','.join(wanted)})",
        "limit": str(len(wanted)),
    }
    rows = await admin.select_rows("profiles", query)
    names = {row.id: row.display_name for row in (read_model(NameOwnerRow, raw) for raw in rows)}
    if any(owner not in names for owner in owners):
        raise unreadable()  # the island row exists, so the profile must exist (cascade)
    return names


MAX_CREW = 10  # the most captains a game room holds (game_full)


async def crew_sizes(admin: SupabaseAdmin, wave_ids: list[UUID]) -> dict[UUID, int]:
    """How many captains joined each scoring run, in one read. Only the counts leave the server."""
    wanted = [str(wave_id) for wave_id in wave_ids]
    query = {"select": "wave_id,player_id", "wave_id": f"in.({','.join(wanted)})"}
    rows = await admin.select_rows("wave_participants", query)
    counts: dict[UUID, int] = dict.fromkeys(wave_ids, 0)
    for raw in rows:
        captain = read_model(CaptainRow, raw)
        if captain.wave_id in counts:
            counts[captain.wave_id] += 1
    # The bell-ringer is always a participant (migration 20261110020000 backfilled old
    # runs), so an empty answer would be a gap in old data: show it as solo, never 0.
    # A room holds at most MAX_CREW captains, but wave_participants also keeps people who
    # joined and left, so cap the count: the browser refuses a row above MAX_CREW, and one
    # such row would hide the whole board.
    return {wave_id: min(MAX_CREW, max(1, n)) for wave_id, n in counts.items()}
