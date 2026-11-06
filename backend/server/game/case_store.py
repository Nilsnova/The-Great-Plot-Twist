"""Case reads and intent RPC calls through the existing server-only database port.

Every query is scoped by the verified player or their crew. Helpers are never called as RPCs.
"""

from dataclasses import replace
from typing import Any

from server.crews.store import CREW_COLUMNS
from server.game.case_board_arguments import (
    nightfall_arguments,
    pair_arguments,
    pin_arguments,
    post_arguments,
    signal_arguments,
)
from server.game.case_data import CaseData
from server.game.case_rewards import reward_ref, solve_shares
from server.game.case_rows import snapshot_from_row
from server.game.case_snapshot import CaseSnapshot
from server.game.station_lookup import NoStations, StationLookup
from server.supabase_admin import AlreadyApplied, SupabaseAdmin, SupabaseRejected

SNAPSHOT_COLUMNS = (
    CREW_COLUMNS
    + ",case_state(*),case_finds(*),case_deductions(*),case_accusations(*),case_solvers(*)"
    + ",board_pins(*),finale_posts(*),finale_signals(*)"
)
INTENT_FUNCTIONS = (
    "case_open",
    "case_start_route",
    "case_accuse",
    "case_clock_forward",
    "board_pin",
    "board_pair",
    "finale_nightfall",
    "finale_take_post",
    "finale_signal",
)
REPLY_STATUSES = (
    "opened",
    "started",
    "wrong",
    "solved",
    "done",
    "repeat",
    "refused",
    "wrong_pair",
    "formed",
    "off_target",
    "locked",
)


def checked_rows(rows) -> list[dict]:
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise SupabaseRejected("The case rows could not be read.")
    return rows


def solve_payments(reply: dict) -> list[dict]:
    payouts = reply.get("payouts")
    if not isinstance(payouts, list) or len(payouts) > 4:
        raise SupabaseRejected("The solve payments could not be read.")
    for item in payouts:
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("playerId"), str)
            or type(item.get("paid")) is not int
            or item["paid"] < 0
        ):
            raise SupabaseRejected("The solve payment could not be read.")
    return payouts


async def run_function(admin: SupabaseAdmin, name: str, params: dict[str, Any]) -> dict:
    if name not in INTENT_FUNCTIONS:
        raise ValueError("Only case intent functions may be called through this store.")
    try:
        reply = await admin.call_function(name, params)
    except AlreadyApplied:
        raise SupabaseRejected("A case write unexpectedly violated a unique constraint.") from None
    if not isinstance(reply, dict) or reply.get("status") not in REPLY_STATUSES:
        raise SupabaseRejected("The case write answer could not be read.")
    if reply["status"] == "refused" and not isinstance(reply.get("reason"), str):
        raise SupabaseRejected("The case refusal could not be read.")
    if reply["status"] == "repeat":
        action_from_row(reply, camel_case=True)
    if reply["status"] in (
        "done",
        "wrong",
        "solved",
        "wrong_pair",
        "formed",
        "off_target",
        "locked",
    ):
        if type(reply.get("revision")) is not int or reply["revision"] < 1:
            raise SupabaseRejected("The case write revision could not be read.")
    if (
        reply["status"] == "done"
        and name in ("case_start_route", "case_clock_forward")
        and (type(reply.get("now")) is not int or reply["now"] < 0)
    ):
        raise SupabaseRejected("The case write clock could not be read.")
    if reply["status"] == "solved":
        solve_payments(reply)
    check_board_reply(name, reply)
    return reply


def check_board_reply(name: str, reply: dict) -> None:
    statuses = {
        "board_pin": ("done",),
        "board_pair": ("formed", "wrong_pair"),
        "finale_nightfall": ("done",),
        "finale_take_post": ("done",),
        "finale_signal": ("locked", "off_target"),
    }
    if name in statuses and reply["status"] not in (*statuses[name], "repeat", "refused"):
        raise SupabaseRejected("The board write status could not be read.")
    fields = {
        "board_pin": ("coinsPaid",),
        "finale_nightfall": ("nightNo", "endsSecond"),
        "finale_take_post": ("onPostSecond",),
    }
    if reply["status"] == "done":
        for field in fields.get(name, ()):
            if type(reply.get(field)) is not int or reply[field] < 0:
                raise SupabaseRejected("The board write answer could not be read.")
    if reply["status"] in ("wrong_pair", "off_target"):
        if type(reply.get("seconds")) is not int or reply["seconds"] < 0:
            raise SupabaseRejected("The board wait could not be read.")
    if reply["status"] == "formed":
        solve_payments(reply)
    if reply["status"] == "locked" and not isinstance(reply.get("parted"), bool):
        raise SupabaseRejected("The light lock answer could not be read.")


def action_from_row(row: dict, *, camel_case: bool = False) -> dict:
    if not isinstance(row, dict):
        raise SupabaseRejected("The remembered action could not be read.")
    crew_key = "crewId" if camel_case else "crew_id"
    for key in (crew_key, "kind", "outcome"):
        if not isinstance(row.get(key), str) or not row[key]:
            raise SupabaseRejected("The remembered action could not be read.")
    if row.get("target") is not None and not isinstance(row["target"], str):
        raise SupabaseRejected("The remembered action target could not be read.")
    return {
        "status": "repeat",
        "crewId": row[crew_key],
        "kind": row["kind"],
        "target": row.get("target"),
        "outcome": row["outcome"],
    }


class CaseStore:
    def __init__(self, admin: SupabaseAdmin, *, stations: StationLookup | None = None) -> None:
        self.admin = admin
        self.stations = stations or NoStations()

    async def action_lookup(self, player_id: str, action_uid: str) -> dict | None:
        rows = await self.admin.select_rows(
            "case_actions",
            {
                "select": "crew_id,kind,target,outcome",
                "player_id": f"eq.{player_id}",
                "action_uid": f"eq.{action_uid}",
                "limit": "1",
            },
        )
        rows = checked_rows(rows)
        return None if not rows else action_from_row(rows[0])

    async def crew_for_player(self, player_id: str) -> str | None:
        rows = await self.admin.select_rows(
            "crew_seats",
            {
                "select": "crew_id,crews(status,updated_at)",
                "player_id": f"eq.{player_id}",
                "order": "crews(updated_at).desc",
                "limit": "20",
            },
        )
        rows = checked_rows(rows)
        for statuses in (("forming", "active"), ("finished",)):
            for row in rows:
                if not isinstance(row.get("crews"), dict) or not isinstance(
                    row.get("crew_id"), str
                ):
                    raise SupabaseRejected("The player's crew could not be read.")
                if row["crews"].get("status") in statuses:
                    return row["crew_id"]
        return None

    async def snapshot(self, player_id: str, crew_id: str | None = None) -> CaseSnapshot | None:
        selected = crew_id or await self.crew_for_player(player_id)
        if selected is None:
            return None
        rows = await self.admin.select_rows(
            "crews",
            {
                "select": SNAPSHOT_COLUMNS,
                "id": f"eq.{selected}",
                "limit": "1",
                "finale_posts.ended_second": "is.null",
                "finale_signals.order": "id.desc",
                "finale_signals.limit": "40",
            },
        )
        rows = checked_rows(rows)
        if not rows:
            return None
        profiles = await self.admin.select_rows(
            "entry_profiles",
            {
                "select": "read_log",
                "player_id": f"eq.{player_id}",
                "limit": "1",
            },
        )
        wallets = await self.admin.select_rows(
            "wallets",
            {
                "select": "balance",
                "player_id": f"eq.{player_id}",
                "limit": "1",
            },
        )
        profiles, wallets = checked_rows(profiles), checked_rows(wallets)
        read_log = profiles[0].get("read_log", False) if profiles else False
        coins = wallets[0].get("balance", 0) if wallets else 0
        if not isinstance(read_log, bool) or type(coins) is not int or coins < 0:
            raise SupabaseRejected("The player's case profile could not be read.")
        snapshot = snapshot_from_row(rows[0], read_log=read_log, coins=coins, viewer=player_id)
        if snapshot.seat_for_player(player_id) is None:
            return None
        players = tuple(seat.player_id for seat in snapshot.seats if seat.player_id is not None)
        stations = await self.stations.players_with_signal_station(self.admin, players)
        timber = await self.stations.timber(self.admin, player_id)
        return replace(snapshot, station_players=stations, timber=timber)

    async def open(self, snapshot: CaseSnapshot, data: CaseData) -> dict:
        return await run_function(self.admin, "case_open", open_arguments(snapshot.crew_id, data))

    async def start_route(self, snapshot, data, player_id, action_uid, route_id) -> dict:
        params = start_arguments(snapshot.crew_id, data, player_id, action_uid, route_id)
        return await run_function(self.admin, "case_start_route", params)

    async def accuse(self, snapshot, data, player_id, action_uid, suspect, relight_open) -> dict:
        params = accuse_arguments(snapshot, data, player_id, action_uid, suspect, relight_open)
        return await run_function(self.admin, "case_accuse", params)

    async def clock_forward(self, snapshot, player_id, action_uid, seconds) -> dict:
        params = clock_arguments(snapshot.crew_id, player_id, action_uid, seconds)
        return await run_function(self.admin, "case_clock_forward", params)

    async def pin(self, snapshot, data, player_id, action_uid, card_id) -> dict:
        params = pin_arguments(snapshot, data, player_id, action_uid, card_id)
        return await run_function(self.admin, "board_pin", params)

    async def pair(self, snapshot, data, player_id, action_uid, card_a, card_b) -> dict:
        params = pair_arguments(snapshot, data, player_id, action_uid, card_a, card_b)
        return await run_function(self.admin, "board_pair", params)

    async def nightfall(self, snapshot, data, player_id, action_uid) -> dict:
        params = nightfall_arguments(snapshot, data, player_id, action_uid)
        return await run_function(self.admin, "finale_nightfall", params)

    async def post(self, snapshot, data, player_id, action_uid, light_id) -> dict:
        params = post_arguments(snapshot, data, player_id, action_uid, light_id)
        return await run_function(self.admin, "finale_take_post", params)

    async def signal(self, snapshot, data, player_id, action_uid, light_id, bearing) -> dict:
        params = signal_arguments(snapshot, data, player_id, action_uid, light_id, bearing)
        return await run_function(self.admin, "finale_signal", params)


def open_arguments(crew_id: str, data: CaseData) -> dict:
    cards = [
        {"kit": route.kit, "card_id": route.card_id, "route_id": route.id}
        for route in data.routes
        if route.starts_in_journal
    ]
    return {"p_crew_id": crew_id, "p_case_id": data.case_id, "p_start_cards": cards}


def start_arguments(
    crew_id: str, data: CaseData, player_id: str, action_uid: str, route_id: str
) -> dict:
    route = data.route(route_id)
    card = data.card(route.card_id)
    window = None if route.open_when == "always" else data.window(route.open_when)
    window_json = (
        None
        if window is None
        else {
            "every": window.every_minutes,
            "from": window.from_minute,
            "open": window.open_minutes,
        }
    )
    return {
        "p_crew_id": crew_id,
        "p_player_id": player_id,
        "p_action_uid": action_uid,
        "p_card_id": card.id,
        "p_route_id": route.id,
        "p_needs_deductions": list(card.opens_after),
        "p_window": window_json,
        "p_timer_seconds": route.timer_minutes * 60,
        "p_coins": 0,
        "p_purchase_ref": None,
    }


def accuse_arguments(
    snapshot: CaseSnapshot,
    data: CaseData,
    player_id: str,
    action_uid: str,
    suspect: str,
    relight_open: bool,
) -> dict:
    reward = data.rewards.coin("solve_share")
    payouts = [
        {"player_id": payout.player_id, "share": payout.share}
        for payout in solve_shares(data, snapshot, player_id)
        if payout.contributor
    ]
    return {
        "p_crew_id": snapshot.crew_id,
        "p_player_id": player_id,
        "p_action_uid": action_uid,
        "p_suspect": suspect,
        "p_culprit": data.accusation.culprit,
        "p_needs_deductions": list(data.accusation.needs_deductions),
        "p_wrong_wait_seconds": data.accusation.wrong_wait_seconds,
        "p_share_base": reward.base,
        "p_share_max": reward.maximum,
        "p_share_ref": reward_ref(data, "solve_share"),
        "p_payouts": payouts,
        "p_expected_revision": snapshot.write_revision,
        "p_expected_crew_version": snapshot.crew_version,
        "p_relight_open": relight_open,
    }


def clock_arguments(crew_id: str, player_id: str, action_uid: str, seconds: int) -> dict:
    return {
        "p_crew_id": crew_id,
        "p_player_id": player_id,
        "p_action_uid": action_uid,
        "p_seconds": seconds,
    }
