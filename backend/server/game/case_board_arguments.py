"""Build board/night RPC arguments from checked server content and the fresh crew snapshot.

Used by: CaseStore. The browser never supplies rewards, readiness or the hidden target.
"""

from server.game.case_board import deduction_for_pair
from server.game.case_rewards import reward_ref
from server.game.finale_geometry import bearing_to, normalize_bearing, on_target, schooner_position
from server.game.finale_rules import light_is_ready


def actor_arguments(snapshot, player_id: str, action_uid: str) -> dict:
    return {"p_crew_id": snapshot.crew_id, "p_player_id": player_id, "p_action_uid": action_uid}


def pin_arguments(snapshot, data, player_id, action_uid, card_id) -> dict:
    return {
        **actor_arguments(snapshot, player_id, action_uid),
        "p_card_id": card_id,
        "p_reward_coins": data.rewards.coin("first_card").amount,
        "p_reward_ref": reward_ref(data, "first_card", card_id=card_id),
    }


def pair_arguments(snapshot, data, player_id, action_uid, card_a, card_b) -> dict:
    deduction = deduction_for_pair(data, card_a, card_b)
    deduction_id = None if deduction is None else deduction.id
    return {
        **actor_arguments(snapshot, player_id, action_uid),
        "p_card_a": card_a,
        "p_card_b": card_b,
        "p_deduction_id": deduction_id,
        "p_wrong_wait_seconds": data.board.wrong_pair_wait_seconds,
        "p_reward_coins": data.rewards.coin("deduction").amount,
        "p_reward_ref": reward_ref(data, "deduction", deduction_id=deduction_id or "none"),
    }


def nightfall_arguments(snapshot, data, player_id, action_uid) -> dict:
    return {
        **actor_arguments(snapshot, player_id, action_uid),
        "p_needs_deduction": data.night.opens_after[0],
        "p_night_seconds": data.night.night_minutes * 60,
        "p_dawn_wait_seconds": data.night.dawn_wait_minutes * 60,
    }


def post_arguments(snapshot, data, player_id, action_uid, light_id) -> dict:
    return {
        **actor_arguments(snapshot, player_id, action_uid),
        "p_light_id": light_id,
        "p_light_ready": light_is_ready(data, snapshot, data.light(light_id)),
        "p_climb_seconds": data.night.climb_minutes * 60,
        "p_night_seconds": data.night.night_minutes * 60,
    }


def signal_arguments(snapshot, data, player_id, action_uid, light_id, bearing) -> dict:
    sent = normalize_bearing(bearing)
    target = schooner_position(snapshot.crew_id, data.night.chart)
    true_bearing = bearing_to(data.light(light_id).chart_xy, target)
    return {
        **actor_arguments(snapshot, player_id, action_uid),
        "p_light_id": light_id,
        "p_bearing": sent,
        "p_on_target": on_target(sent, true_bearing, data.night.tolerance_degrees),
        "p_lock_seconds": data.night.lock_seconds,
        "p_relock_wait_seconds": data.night.relock_wait_seconds,
        "p_night_seconds": data.night.night_minutes * 60,
        "p_lights_needed": data.night.lights_needed,
    }
