"""The world stage: is the coast still dark, or has a crew relit it?

The first crew that solves the case relights the coast for everyone (CASE-FILE 14.1: the stage goes
from `dark` to `relit`, exactly once). A few server rules depend on it: the false light shows on
fog nights only while the coast is dark, the bulletin says "the coast is relit" for 48 hours, and
the Chapter 2 hook starts counting nights from the moment of the first solve.

This file holds only the small shape of that answer and a way to ask for it:

    WorldStage        the stage (`dark` or `relit`) and, once relit, the moment of the first solve
    WorldStageReader  anything with `async read()` that returns a WorldStage
    AlwaysDark        a deterministic dark reader for isolated tests and local tools

Package L3's `game/world_state.py` reads the real table by default. Tests may pass another reader
to create_app(world_stage=...). The table keeps `relit_at timestamptz`, set in the same conditional
update that turns `dark` into `relit`.

Used by: app.py (stores the reader), routes/bulletin.py (the fog line, the relit line and the
Chapter 2 hook), daily/chapter_two_hook.py and the tests.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Protocol

from fastapi import Depends, Request

DARK = "dark"
RELIT = "relit"
STAGES = (DARK, RELIT)


@dataclass(frozen=True)
class WorldStage:
    """The stage of the world. `relit_at` is the first accepted solve, and None while dark."""

    stage: str  # DARK or RELIT
    relit_at: datetime | None  # a time with a timezone once relit, otherwise None

    def __post_init__(self) -> None:
        if self.stage not in STAGES:
            raise ValueError(f"The world stage must be one of {', '.join(STAGES)}.")
        if self.stage == DARK and self.relit_at is not None:
            raise ValueError("A dark world has no time of relighting.")
        if self.stage == RELIT and self.relit_at is None:
            raise ValueError("A relit world needs the time of the relighting.")
        if self.relit_at is not None and self.relit_at.tzinfo is None:
            raise ValueError("The time of the relighting needs a timezone.")


class WorldStageReader(Protocol):
    """Anything that can say what the stage of the world is right now.

    The rules for whoever writes a reader (package L3):
      * read() raises an ApiError (for example SupabaseUnavailable) when the stage cannot be read.
        The bulletin then leaves out the stage lines. Any other error becomes a 500.
      * GET /api/bulletin calls read() on every request, so a reader that asks the database should
        keep its answer for a short time (for example 60 seconds).
    """

    async def read(self) -> WorldStage: ...


class AlwaysDark:
    """A reader for isolated tests and tools: the coast is dark."""

    async def read(self) -> WorldStage:
        return WorldStage(DARK, None)


def get_world_stage(request: Request) -> WorldStageReader:
    """FastAPI dependency: the reader that create_app() stored on the app."""
    return request.app.state.world_stage


# Write `stage_reader: WorldStageDep` in a route and FastAPI hands you the reader.
WorldStageDep = Annotated[WorldStageReader, Depends(get_world_stage)]
