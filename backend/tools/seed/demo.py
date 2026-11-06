"""Deterministic G22 fixtures, using only the current migrated schema."""

import hashlib
import json
from datetime import UTC, datetime
from decimal import Decimal
from uuid import NAMESPACE_URL, UUID, uuid5

import psycopg

from server.market.feed import load_replay, replay_snapshot
from server.market.rules import market_day_start
from server.market.trade_rules import (
    DAILY_BUY_CAP_COINS,
    FEE_BASIS_POINTS,
    MAX_TRADE_COINS,
    MIN_HOLD_SECONDS,
    buy_amounts,
)
from tools.seed.database import ROOT, require_marker

PLAYER_IDS = [uuid5(NAMESPACE_URL, f"plot-twist/g22/player/{i}") for i in range(1, 21)]
CREW_IDS = [uuid5(NAMESPACE_URL, f"plot-twist/g22/crew/{i}") for i in range(6)]
KITS = json.loads((ROOT / "backend/content/entry_kits.json").read_text())["kits"]
COMPANIES = json.loads(
    (ROOT / "backend/content/market/companies.json").read_text(), parse_float=Decimal
)["companies"]


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
    """One transaction; reset replaces demo users/crews and restarts the replay board."""
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
        for seat in range(1, 5):
            if status == "forming" and seat > (1 if mode == "solo" else 2):
                continue
            human = seat == 1 or (mode == "crew" and seat == 2)
            player_index = owner_index + seat - 1
            conn.execute(
                """
                insert into public.crew_seats (crew_id,seat_no,player_id,npc_id,kit)
                values (%s,%s,%s,%s,%s) on conflict (crew_id,seat_no) do nothing
            """,
                (
                    crew,
                    seat,
                    PLAYER_IDS[player_index] if human else None,
                    None if human else {2: "deckhand", 3: "bosun", 4: "cook"}[seat],
                    KITS[player_index % len(KITS)]["id"],
                ),
            )

    now = datetime.now(UTC)
    prices = replay_snapshot(load_replay(), [c["symbol"] for c in COMPANIES], now).prices
    for company in COMPANIES:
        version = 0
        if reset:
            row = conn.execute(
                "select version from public.market_bases where company_id=%s", (company["id"],)
            ).fetchone()
            version = row[0] if row else 0
        conn.execute(
            "select public.market_set_base(%s,%s,%s,%s,'replay',null,null,%s)",
            (company["id"], company["startPrice"], prices[company["symbol"]], now, version),
        )
    for i, player in enumerate(PLAYER_IDS):
        ref = "g22-demo-market-buy"
        if conn.execute(
            "select 1 from public.market_trades where player_id=%s and ref=%s", (player, ref)
        ).fetchone():
            continue
        company = COMPANIES[i % len(COMPANIES)]
        amounts = buy_amounts(2, company["startPrice"])
        reply = conn.execute(
            """
            select public.market_trade(%s,%s,'buy',2,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
            (
                player,
                company["id"],
                company["startPrice"],
                amounts.gross,
                amounts.fee,
                ref,
                MIN_HOLD_SECONDS,
                DAILY_BUY_CAP_COINS,
                market_day_start(now),
                FEE_BASIS_POINTS,
                MAX_TRADE_COINS,
            ),
        ).fetchone()[0]
        if reply["status"] != "done":
            raise RuntimeError("Demo purchase refused; use --reset for changed demo fixtures.")
    return {
        "players": 20,
        "crews": 6,
        "crewStates": ["forming", "active", "finished"],
        "marketPositions": conn.execute(
            "select count(*) from public.market_positions where player_id=any(%s)",
            (PLAYER_IDS,),
        ).fetchone()[0],
        "skipped": ["islets (no migration)", "predictions (no migration)", "duels (no migration)"],
    }
