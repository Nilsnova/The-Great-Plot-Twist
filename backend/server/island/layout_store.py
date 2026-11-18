"""Read trusted placement policy and coordinates together, and fence a grid move against both.

    read_snapshot(owner)      complete policy/rows in one statement; requires the wall policy RPC
    save_wall_move(...)       island_wall_move(): CAS the expected policy and checked raw rows

    read_layout(owner)        the stored cells of an island ({spot: (x, z)}), or None while the
                              table cannot be read (before 20261114110000_island_layout.sql is
                              applied): every answer then shows the fixed spots and no Move button
    save_move(...)            island_move(): one spot to one cell, between waves, compare-and-swap
                              against the rows the server checked (refused busy otherwise)

Positions are stored in half units (x_half = x * 2), so a cell of the grid is always a whole number.

The older read_layout/save_move helpers remain for legacy callers. New game views and Move use
the snapshot protocol; a database failure never grants permission to downgrade stored policy.
"""

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, StrictInt, StrictStr

from server.island.layout import MAX_UNITS, Position, check_wall_policy, island_layout
from server.island.store import Refusal, read_model, refusal_or_none
from server.island.wall_cohort import is_inventory_wall_id
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


@dataclass(frozen=True)
class LayoutSnapshot:
    """The policy and complete rows observed in one database statement snapshot."""

    rule_version: int
    capacity: int
    rows: tuple[LayoutRow, ...]
    island_epoch: str | None = None


async def read_snapshot(admin: SupabaseAdmin, owner: str) -> LayoutSnapshot:
    """Require the policy RPC; a failed read cannot silently downgrade a paid island."""
    reply = await admin.call_function("island_wall_layout_read", {"p_island_owner": owner})
    message = "The island wall layout could not be read."
    if not isinstance(reply, dict) or set(reply) != {
        "ruleVersion",
        "capacity",
        "rows",
        "islandEpoch",
    }:
        raise SupabaseRejected(message)
    try:
        check_wall_policy(reply["ruleVersion"], reply["capacity"])
    except ValueError as error:
        raise SupabaseRejected(message) from error
    epoch = reply["islandEpoch"]
    try:
        if (epoch is None and reply["ruleVersion"] == 1) or (
            epoch is not None and (not isinstance(epoch, str) or str(UUID(epoch)) != epoch)
        ):
            raise ValueError("Invalid island epoch.")
    except ValueError as error:
        raise SupabaseRejected(message) from error
    geometry = island_layout(more=True)
    known = {spot.spot for spot in geometry.spots}
    non_walls = sum(spot.slot != "wall" for spot in geometry.spots)
    if not isinstance(reply["rows"], list) or len(reply["rows"]) > reply["capacity"] + non_walls:
        raise SupabaseRejected(message)
    rows, seen = [], set()
    for raw in reply["rows"]:
        if not isinstance(raw, dict) or set(raw) != {"plot", "x_half", "z_half"}:
            raise SupabaseRejected(message)
        row = read_model(LayoutRow, raw)
        if (
            row.plot in seen
            or (row.plot not in known and not is_inventory_wall_id(row.plot, reply["capacity"]))
            or abs(row.x_half) > MAX_UNITS * HALF
            or abs(row.z_half) > MAX_UNITS * HALF
        ):
            raise SupabaseRejected(message)
        seen.add(row.plot)
        rows.append(row)
    return LayoutSnapshot(
        reply["ruleVersion"], reply["capacity"], tuple(sorted(rows, key=lambda r: r.plot)), epoch
    )


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


def positions_from(rows: Sequence[LayoutRow]) -> dict[str, Position]:
    return {row.plot: (row.x_half / HALF, row.z_half / HALF) for row in rows}


async def read_layout(admin: SupabaseAdmin, owner: str) -> dict[str, Position] | None:
    """{spot: (x, z)} of the spots the island moved, or None while the layout is unavailable."""
    rows = await read_rows(admin, owner)
    return None if rows is None else positions_from(rows)


def seen_rows(rows: Sequence[LayoutRow]) -> list[dict]:
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


async def save_wall_move(
    admin: SupabaseAdmin,
    owner: str,
    mover: str,
    spot_id: str,
    where: Position,
    snapshot: LayoutSnapshot,
) -> Refusal | None:
    """Fence both policy and rows, including a legacy move racing new-policy admission."""
    arguments = {
        "p_island_owner": owner,
        "p_mover": mover,
        "p_plot": spot_id,
        "p_x_half": round(where[0] * HALF),
        "p_z_half": round(where[1] * HALF),
        "p_seen": seen_rows(snapshot.rows),
        "p_expected_rule_version": snapshot.rule_version,
        "p_expected_capacity": snapshot.capacity,
    }
    reply = await admin.call_function("island_wall_move", arguments)
    refusal = refusal_or_none(reply)
    if refusal is None:
        read_model(MovedRow, reply)
    return refusal
