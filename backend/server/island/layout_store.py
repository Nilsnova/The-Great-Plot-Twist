"""The database part of flexible placement (T36, D041): read an island's layout, move a spot.

    read_layout(owner)        the stored cells of an island ({spot: (x, z)}), or None while the
                              table cannot be read (before 20261114110000_island_layout.sql is
                              applied): every answer then shows the fixed spots and no Move button
    save_move(...)            island_move(): one spot to one cell, between waves, compare-and-swap
                              against the rows the server checked (refused busy otherwise)

Positions are stored in half units (x_half = x * 2), so a cell of the grid is always a whole number.

Used by: service.py (every island answer) and placement.py (POST /api/island/move).
"""

import logging
from typing import Literal

from pydantic import BaseModel, StrictInt, StrictStr

from server.island.layout import Position
from server.island.store import Refusal, read_model, refusal_or_none
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

logger = logging.getLogger(__name__)

# One row per spot at most (22 island spots); a little room for a future slot.
MAX_LAYOUT_ROWS = 30
HALF = 2  # half units per unit


class LayoutRow(BaseModel):
    plot: StrictStr
    x_half: StrictInt
    z_half: StrictInt


class MovedRow(BaseModel):
    status: Literal["done"]


async def read_rows(admin: SupabaseAdmin, owner: str) -> list[LayoutRow] | None:
    """The island's layout rows in plot order, or None when the table cannot be read."""
    query = {
        "select": "plot,x_half,z_half",
        "island_owner": f"eq.{owner}",
        "order": "plot.asc",
        "limit": str(MAX_LAYOUT_ROWS),
    }
    try:
        rows = await admin.select_rows("island_layout", query)
    except SupabaseRejected:
        # Before the migration the table is missing (the database answers 404): fixed spots.
        logger.warning("The island layout could not be read; the fixed spots are shown.")
        return None
    return [read_model(LayoutRow, row) for row in rows]


def positions_from(rows: list[LayoutRow]) -> dict[str, Position]:
    return {row.plot: (row.x_half / HALF, row.z_half / HALF) for row in rows}


async def read_layout(admin: SupabaseAdmin, owner: str) -> dict[str, Position] | None:
    """{spot: (x, z)} of the spots the island moved, or None while the layout is unavailable."""
    rows = await read_rows(admin, owner)
    return None if rows is None else positions_from(rows)


def seen_rows(rows: list[LayoutRow]) -> list[dict]:
    """The rows as island_move() compares them: in plot order by code point (collate "C")."""
    ordered = sorted(rows, key=lambda row: row.plot)
    return [{"plot": row.plot, "x_half": row.x_half, "z_half": row.z_half} for row in ordered]


async def save_move(
    admin: SupabaseAdmin,
    owner: str,
    mover: str,
    spot_id: str,
    where: Position,
    seen: list[LayoutRow],
) -> Refusal | None:
    """Run island_move(). None when the move is stored; a Refusal (wave_running, busy,
    no_island) changed nothing."""
    arguments = {
        "p_island_owner": owner,
        "p_mover": mover,
        "p_plot": spot_id,
        "p_x_half": round(where[0] * HALF),
        "p_z_half": round(where[1] * HALF),
        "p_seen": seen_rows(seen),
    }
    reply = await admin.call_function("island_move", arguments)
    refusal = refusal_or_none(reply)
    if refusal is None:
        read_model(MovedRow, reply)
    return refusal
