"""Deterministic G22 fixtures, using only the current migrated schema."""

import hashlib
import json
from datetime import UTC, datetime
from uuid import NAMESPACE_URL, UUID, uuid5

import psycopg
from psycopg import sql

from server.crews.seats import Seat, partner_seats
from server.market.companies import load_companies
from server.market.game_day import game_day_start
from server.market.positions import FEE_BASIS_POINTS, fee_for
from server.market.replay import load_replay, replay_minute
from server.market.store_calls import open_arguments
from tools.seed.database import ROOT, require_marker

PLAYER_IDS = [uuid5(NAMESPACE_URL, f"plot-twist/g22/player/{i}") for i in range(1, 21)]
CREW_IDS = [uuid5(NAMESPACE_URL, f"plot-twist/g22/crew/{i}") for i in range(6)]
KITS = json.loads((ROOT / "backend/content/entry_kits.json").read_text())["kits"]
COMPANIES = tuple(company for company in load_companies() if not company.is_stock)


def wallet_once(conn: psycopg.Connection, player: UUID, delta: int, reason: str, ref: str) -> None:
    exists = conn.execute(
        "select 1 from public.wallet_transactions where player_id=%s and reason=%s and ref=%s",
        (player, reason, ref),
    ).fetchone()
    if not exists:
        conn.execute(
            "select public.apply_wallet_transaction(%s,%s,%s,%s)", (player, delta, reason, ref)
        )


def seed(conn: psycopg.Connection, *, reset: bool = False) -> dict:
    """One transaction; reset replaces only demo users/crews and their cascaded progress."""
    require_marker(conn)
    conn.execute("select pg_advisory_xact_lock(220022)")
    if reset:
        conn.execute("delete from public.crews where id = any(%s)", (CREW_IDS,))
        conn.execute("delete from auth.users where id = any(%s)", (PLAYER_IDS,))
    story_hash = hashlib.sha256((ROOT / "backend/content/story.json").read_bytes()).hexdigest()
    for i, player in enumerate(PLAYER_IDS):
        conn.execute(
            "insert into auth.users (id,email) values (%s,%s) on conflict do nothing",
            (player, f"demo-{i + 1:02d}@example.invalid"),
        )
        conn.execute(
            "select public.assign_captain_name(%s,%s,%s)",
            (player, f"Captain-{str(player)[:6]}", f"Demo Puffin {i + 10}"),
        )
        kit = KITS[i % len(KITS)]
        conn.execute(
            "select public.grant_entry_kit(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                player,
                kit["ending"],
                kit["decision"],
                i % 4 == 0,
                kit["id"],
                kit["startPlace"],
                kit["coins"],
                11,
                story_hash,
            ),
        )
        wallet_once(conn, player, 300, "event_reward", "g22-demo-event")
        wallet_once(conn, player, -50, "clue_purchase", "g22-demo-clue")

    # Both modes in all three real states; no fictitious future tables/columns.
    codes = ["G22AAA", "G22AAB", "G22AAC", "G22AAD", "G22AAE", "G22AAF"]
    for i, crew in enumerate(CREW_IDS):
        status = ("forming", "active", "finished")[i % 3]
        mode = "solo" if i < 3 else "crew"
        owner_index = i * 2
        conn.execute(
            """
            insert into public.crews (id,created_by,mode,status,code,started_at)
            values (%s,%s,%s,%s,%s,%s) on conflict (id) do nothing
        """,
            (
                crew,
                PLAYER_IDS[owner_index],
                mode,
                status,
                codes[i],
                None if status == "forming" else datetime.now(UTC),
            ),
        )
        humans = [
            Seat(
                seat,
                str(PLAYER_IDS[owner_index + seat - 1]),
                None,
                KITS[(owner_index + seat - 1) % len(KITS)]["id"],
                None,
            )
            for seat in range(1, 2 if mode == "solo" else 3)
        ]
        seats = humans if status == "forming" else [*humans, *partner_seats(humans)]
        for seat in seats:
            conn.execute(
                """
                insert into public.crew_seats (crew_id,seat_no,player_id,npc_id,kit)
                values (%s,%s,%s,%s,%s) on conflict (crew_id,seat_no) do nothing
            """,
                (
                    crew,
                    seat.seat_no,
                    seat.player_id,
                    seat.npc_id,
                    seat.kit,
                ),
            )

    now = datetime.now(UTC)
    prices = replay_minute(load_replay(), [company.symbol for company in COMPANIES], now).prices
    for i, player in enumerate(PLAYER_IDS):
        ref = "market:open:g22-demo-position"
        if conn.execute(
            "select 1 from public.exchange_events where player_id=%s and ref=%s", (player, ref)
        ).fetchone():
            continue
        company = COMPANIES[i % len(COMPANIES)]
        params = open_arguments(
            str(player),
            company.id,
            "rising",
            "replay",
            prices[company.symbol],
            25,
            fee_for(25, FEE_BASIS_POINTS),
            FEE_BASIS_POINTS,
            ref,
            game_day_start(now),
        )
        reply = conn.execute(
            sql.SQL("select public.exchange_open_position({})").format(
                sql.SQL(",").join(sql.SQL("{} => %s").format(sql.Identifier(key)) for key in params)
            ),
            list(params.values()),
        ).fetchone()[0]
        if reply["status"] != "done":
            raise RuntimeError("Demo purchase refused; use --reset for changed demo fixtures.")
    return {
        "players": 20,
        "crews": 6,
        "crewStates": ["forming", "active", "finished"],
        "marketPositions": conn.execute(
            "select count(*) from public.exchange_positions where player_id=any(%s)",
            (PLAYER_IDS,),
        ).fetchone()[0],
        "skipped": [
            "islets (not seeded)",
            "predictions (not seeded)",
            "duels (not seeded)",
            "case/festival/sports (disabled, no live provider or shared-world writes)",
        ],
    }
