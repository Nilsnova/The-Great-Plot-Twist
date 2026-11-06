"""Build minimum NPC intent arguments from the chosen server route and canonical durations.

Used by: CaseStore. Clients never choose rewards, paid routes, time results or NPC identity.
"""

from server.game.case_board_arguments import actor_arguments
from server.game.case_rewards import reward_ref
from server.game.npc_orders import ARRIVE_AFTER_MINUTES, ERRAND_MINUTES, PIN_MINUTES
from server.supabase_admin import SupabaseRejected


def order_arguments(snapshot, data, player_id, action_uid, seat_no, kind, target, decision):
    if kind not in ("fetch", "man_light") or not decision.accepted or decision.price:
        raise SupabaseRejected("That partner intent is not available.")
    partner = next((seat for seat in snapshot.seats if seat.seat_no == seat_no), None)
    if partner is None or partner.npc_id is None or partner.player_id is not None:
        raise SupabaseRejected("The partner seat could not be read.")
    shared = {
        **actor_arguments(snapshot, player_id, action_uid),
        "p_seat_no": seat_no,
        "p_npc_id": partner.npc_id,
    }
    if kind == "man_light":
        if not data.light(target).partners_may_man:
            raise SupabaseRejected("That light cannot be held by a partner.")
        return "npc_man_light", {
            **shared,
            "p_light_id": target,
            "p_travel_seconds": ERRAND_MINUTES * 60,
            "p_night_seconds": data.night.night_minutes * 60,
        }
    route = None if decision.route_id is None else data.route(decision.route_id)
    window = None if route is None or route.open_when == "always" else data.window(route.open_when)
    return "npc_fetch_pin", {
        **shared,
        "p_card_id": target,
        "p_route_id": None if route is None else route.id,
        "p_needs_deductions": list(data.card(target).opens_after),
        "p_window": None
        if window is None
        else {
            "every": window.every_minutes,
            "from": window.from_minute,
            "open": window.open_minutes,
        },
        "p_errand_seconds": ERRAND_MINUTES * 60,
        "p_arrive_seconds": ARRIVE_AFTER_MINUTES * 60,
        "p_pin_seconds": PIN_MINUTES * 60,
        "p_price": 0,
        "p_purchase_ref": None,
        "p_reward_coins": data.rewards.coin("first_card").amount,
        "p_reward_ref": reward_ref(data, "first_card", card_id=target),
    }
