"""Case reads and intent RPC calls through the existing server-only database port.

Every query is scoped by the verified player or their crew. Helpers are never called as RPCs.
"""

from typing import Any

from server.crews.store import CREW_COLUMNS
from server.game.case_board import deduction_for_pair
from server.game.case_data import CaseData
from server.game.case_rewards import reward_ref, solve_shares
from server.game.case_rows import (
    NPC_ORDER_SUMMARIES,
    SIGNAL_SUMMARIES,
    npc_order_from_row,
    snapshot_from_row,
)
from server.game.case_snapshot import CaseSnapshot, SeatState
from server.game.finale_geometry import normalize_bearing
from server.game.npc_orders import (
    ARRIVE_AFTER_MINUTES,
    ERRAND_MINUTES,
    PIN_MINUTES,
    NpcOrder,
    OrderDecision,
)
from server.supabase_admin import AlreadyApplied, SupabaseAdmin, SupabaseRejected

SNAPSHOT_COLUMNS = (
    CREW_COLUMNS
    + ",case_state(*),case_finds(*),case_deductions(*),case_accusations(*),case_solvers(*)"
    + ",board_pins(*),finale_posts(*),finale_signals(*)"
    + "".join(f",{alias}:finale_signals(*)" for alias, _, _ in SIGNAL_SUMMARIES)
    + ",npc_orders(*)"
    + "".join(f",{alias}:npc_orders(*)" for alias, _, _ in NPC_ORDER_SUMMARIES)
)
FUNCTION_STATUSES = {
    "case_open": ("opened",),
    "case_start_route": ("done",),
    "case_accuse": ("wrong", "solved"),
    "case_clock_forward": ("done",),
    "board_pin": ("done",),
    "board_pair": ("wrong_pair", "formed"),
    "finale_nightfall": ("done",),
    "finale_take_post": ("done",),
    "finale_signal": ("off_target", "locked"),
    "npc_fetch_pin": ("done",),
    "npc_man_light": ("done",),
}
INTENT_FUNCTIONS = tuple(FUNCTION_STATUSES)


def checked_rows(rows) -> list[dict]:
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise SupabaseRejected("The case rows could not be read.")
    return rows


def snapshot_query(crew_id: str) -> dict[str, str]:
    query = {
        "select": SNAPSHOT_COLUMNS,
        "id": f"eq.{crew_id}",
        "limit": "1",
        "finale_posts.ended_second": "is.null",
        "finale_signals.order": "id.desc",
        "finale_signals.limit": "40",
        "npc_orders.order": "order_no.desc",
        "npc_orders.limit": "40",
    }
    for alias, filters, limit in (*SIGNAL_SUMMARIES, *NPC_ORDER_SUMMARIES):
        query[f"{alias}.order"] = "order_no.desc" if alias.startswith("npc_") else "id.desc"
        query[f"{alias}.limit"] = str(limit)
        query.update({f"{alias}.{key}": value for key, value in filters.items()})
    return query


def solve_payments(reply: dict) -> list[dict]:
    payouts = reply.get("payouts")
    if not isinstance(payouts, list) or len(payouts) > 4:
        raise SupabaseRejected("The solve payments could not be read.")
    players = set()
    for item in payouts:
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("playerId"), str)
            or not item["playerId"]
            or item["playerId"] in players
            or type(item.get("paid")) is not int
            or item["paid"] < 0
        ):
            raise SupabaseRejected("The solve payment could not be read.")
        players.add(item["playerId"])
    return payouts


def reply_number(reply: dict, key: str, minimum: int = 0) -> int:
    value = reply.get(key)
    if type(value) is not int or value < minimum:
        raise SupabaseRejected("A case write number could not be read.")
    return value


def validate_reply(name: str, reply: dict) -> None:
    status = reply["status"]
    if status in ("refused", "repeat", "opened"):
        return
    reply_number(reply, "revision", 1)
    if status in ("wrong", "wrong_pair", "off_target"):
        reply_number(reply, "seconds")
    if status in ("solved", "formed"):
        solve_payments(reply)
    if name in ("case_start_route", "case_clock_forward"):
        reply_number(reply, "now")
    if name == "case_start_route":
        if reply_number(reply, "readySecond") < reply["now"]:
            raise SupabaseRejected("The case write deadline could not be read.")
    if name == "board_pin":
        reply_number(reply, "coinsPaid")
    if name == "finale_nightfall":
        reply_number(reply, "nightNo", 1)
        reply_number(reply, "endsSecond")
    if name == "finale_take_post":
        reply_number(reply, "onPostSecond")
    if name in ("npc_fetch_pin", "npc_man_light"):
        reply_number(reply, "orderNo", 1)
        if name == "npc_fetch_pin":
            pin = reply_number(reply, "pinSecond")
            if reply.get("foundSecond") is not None:
                if reply_number(reply, "foundSecond") > pin:
                    raise SupabaseRejected("The partner deadlines could not be read.")
            elif "foundSecond" not in reply:
                raise SupabaseRejected("The partner deadline could not be read.")
            reply_number(reply, "coinsPaid")
        else:
            reply_number(reply, "onPostSecond")
    if status == "locked" and type(reply.get("parted")) is not bool:
        raise SupabaseRejected("The fog-parting answer could not be read.")


async def run_function(admin: SupabaseAdmin, name: str, params: dict[str, Any]) -> dict:
    if name not in INTENT_FUNCTIONS:
        raise ValueError("Only case intent functions may be called through this store.")
    try:
        reply = await admin.call_function(name, params)
    except AlreadyApplied:
        raise SupabaseRejected("A case write unexpectedly violated a unique constraint.") from None
    if not isinstance(reply, dict) or reply.get("status") not in (
        *FUNCTION_STATUSES[name],
        "repeat",
        "refused",
    ):
        raise SupabaseRejected("The case write answer could not be read.")
    if reply["status"] == "refused":
        if not isinstance(reply.get("reason"), str) or not reply["reason"]:
            raise SupabaseRejected("The case refusal could not be read.")
        if "seconds" in reply:
            reply_number(reply, "seconds")
        if "minute" in reply:
            reply_number(reply, "minute")
    if reply["status"] == "repeat":
        action_from_row(reply, camel_case=True)
        if reply["kind"] == "order":
            reply = {**reply, "actionUid": params["p_action_uid"]}
    validate_reply(name, reply)
    return reply


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
    def __init__(self, admin: SupabaseAdmin) -> None:
        self.admin = admin

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
        if not rows:
            return None
        action = action_from_row(rows[0])
        return {**action, "actionUid": action_uid} if action["kind"] == "order" else action

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
        rows = await self.admin.select_rows("crews", snapshot_query(selected))
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
        return snapshot if snapshot.seat_for_player(player_id) is not None else None

    async def npc_order_for_action(
        self, player_id: str, action_uid: str, crew_id: str
    ) -> NpcOrder | None:
        rows = checked_rows(
            await self.admin.select_rows(
                "npc_orders",
                {
                    "select": "*",
                    "crew_id": f"eq.{crew_id}",
                    "ordered_by": f"eq.{player_id}",
                    "action_uid": f"eq.{action_uid}",
                    "limit": "1",
                },
            )
        )
        if not rows:
            return None
        row = rows[0]
        if len(rows) != 1 or (row.get("crew_id"), row.get("ordered_by"), row.get("action_uid")) != (
            crew_id,
            player_id,
            action_uid,
        ):
            raise SupabaseRejected("The partner order receipt could not be read.")
        return npc_order_from_row(row)

    async def npc_fetch(
        self,
        snapshot: CaseSnapshot,
        data: CaseData,
        player_id: str,
        action_uid: str,
        seat_no: int,
        card_id: str,
        decision: OrderDecision,
    ) -> dict:
        seat = npc_seat(snapshot, seat_no)
        card = data.card(card_id)
        route = decision.route
        if not decision.accepted or (route is not None and route.card_id != card_id):
            raise ValueError("An accepted matching fetch decision is required.")
        window = (
            None if route is None or route.open_when == "always" else data.window(route.open_when)
        )
        params = intent_arguments(snapshot, player_id, action_uid)
        params.update(
            p_seat_no=seat_no,
            p_npc_id=seat.npc_id,
            p_card_id=card_id,
            p_route_id=None if route is None else route.id,
            p_needs_deductions=list(card.opens_after),
            p_window=None
            if window is None
            else {
                "every": window.every_minutes,
                "from": window.from_minute,
                "open": window.open_minutes,
            },
            p_errand_seconds=ERRAND_MINUTES * 60,
            p_arrive_seconds=ARRIVE_AFTER_MINUTES * 60,
            p_pin_seconds=PIN_MINUTES * 60,
            p_price=0,
            p_purchase_ref=None,
            p_reward_coins=data.rewards.coin("first_card").amount,
            p_reward_ref=reward_ref(data, "first_card", card_id=card_id),
        )
        return await run_function(self.admin, "npc_fetch_pin", params)

    async def npc_man_light(
        self,
        snapshot: CaseSnapshot,
        data: CaseData,
        player_id: str,
        action_uid: str,
        seat_no: int,
        light_id: str,
    ) -> dict:
        seat = npc_seat(snapshot, seat_no)
        light = next((light for light in data.active_lights if light.id == light_id), None)
        if light is None or not light.partners_may_man:
            raise ValueError("A public light is required for a partner order.")
        params = intent_arguments(snapshot, player_id, action_uid)
        params.update(
            p_seat_no=seat_no,
            p_npc_id=seat.npc_id,
            p_light_id=light_id,
            p_travel_seconds=ERRAND_MINUTES * 60,
            p_night_seconds=data.night.night_minutes * 60,
        )
        return await run_function(self.admin, "npc_man_light", params)

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

    async def pin(
        self, snapshot: CaseSnapshot, data: CaseData, player_id: str, action_uid: str, card_id: str
    ) -> dict:
        data.card(card_id)
        params = intent_arguments(snapshot, player_id, action_uid)
        params.update(
            p_card_id=card_id,
            p_reward_coins=data.rewards.coin("first_card").amount,
            p_reward_ref=reward_ref(data, "first_card", card_id=card_id),
        )
        return await run_function(self.admin, "board_pin", params)

    async def pair(
        self,
        snapshot: CaseSnapshot,
        data: CaseData,
        player_id: str,
        action_uid: str,
        a: str,
        b: str,
    ) -> dict:
        data.card(a)
        data.card(b)
        deduction = deduction_for_pair(data, a, b)
        deduction_id = None if deduction is None else deduction.id
        params = intent_arguments(snapshot, player_id, action_uid)
        params.update(
            p_card_a=a,
            p_card_b=b,
            p_deduction_id=deduction_id,
            p_wrong_wait_seconds=data.board.wrong_pair_wait_seconds,
            p_reward_coins=data.rewards.coin("deduction").amount,
            p_reward_ref=reward_ref(data, "deduction", deduction_id=deduction_id or "none"),
        )
        return await run_function(self.admin, "board_pair", params)

    async def nightfall(
        self, snapshot: CaseSnapshot, data: CaseData, player_id: str, action_uid: str
    ) -> dict:
        params = intent_arguments(snapshot, player_id, action_uid)
        params.update(
            p_needs_deduction=data.night.opens_after[0],
            p_night_seconds=data.night.night_minutes * 60,
            p_dawn_wait_seconds=data.night.dawn_wait_minutes * 60,
        )
        return await run_function(self.admin, "finale_nightfall", params)

    async def take_post(
        self,
        snapshot: CaseSnapshot,
        data: CaseData,
        player_id: str,
        action_uid: str,
        light_id: str,
        light_ready: bool,
    ) -> dict:
        params = intent_arguments(snapshot, player_id, action_uid)
        params.update(
            p_light_id=light_id,
            p_light_ready=light_ready,
            p_climb_seconds=data.night.climb_minutes * 60,
            p_night_seconds=data.night.night_minutes * 60,
        )
        return await run_function(self.admin, "finale_take_post", params)

    async def signal(
        self,
        snapshot: CaseSnapshot,
        data: CaseData,
        player_id: str,
        action_uid: str,
        light_id: str,
        bearing: float,
        on_target: bool,
    ) -> dict:
        params = intent_arguments(snapshot, player_id, action_uid)
        params.update(
            p_light_id=light_id,
            p_bearing=normalize_bearing(bearing),
            p_on_target=on_target,
            p_lock_seconds=data.night.lock_seconds,
            p_relock_wait_seconds=data.night.relock_wait_seconds,
            p_night_seconds=data.night.night_minutes * 60,
            p_lights_needed=data.night.lights_needed,
        )
        return await run_function(self.admin, "finale_signal", params)


def npc_seat(snapshot: CaseSnapshot, seat_no: int) -> SeatState:
    seat = next((seat for seat in snapshot.seats if seat.seat_no == seat_no), None)
    if seat is None or seat.npc_id is None or seat.player_id is not None:
        raise ValueError("The partner store requires a partner seat.")
    return seat


def intent_arguments(snapshot: CaseSnapshot, player_id: str, action_uid: str) -> dict:
    return {
        "p_crew_id": snapshot.crew_id,
        "p_player_id": player_id,
        "p_action_uid": action_uid,
    }


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
