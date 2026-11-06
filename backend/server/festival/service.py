"""Festival API coordination: durable receipts first, A7 rules, then atomic database writes."""

from server.clock import Clock
from server.duels import rules
from server.errors import ApiError
from server.festival.content import FestivalContent
from server.festival.store import FestivalStore
from server.festival.timer import festival_timer
from server.festival.view import build_view
from server.game.world_state import read_world_state
from server.supabase_admin import SupabaseAdmin


class FestivalService:
    def __init__(self, content: FestivalContent, clock: Clock) -> None:
        self.content, self.clock = content, clock

    async def view(self, admin: SupabaseAdmin, player_id: str | None, *, arena: bool) -> dict:
        store = FestivalStore(admin)
        world = await read_world_state(admin)
        now = self.clock()
        active = (
            festival_timer(world.relit_at, now, self.content.duration_seconds).phase == "active"
        )
        claims = await store.claims() if active else {}
        mine = await store.mine(player_id) if player_id is not None else None
        return build_view(self.content, world, now, claims, mine, player_id, arena_enabled=arena)

    async def answer(
        self,
        admin: SupabaseAdmin,
        player_id: str,
        receipt: dict,
        *,
        arena: bool,
    ) -> dict:
        return {
            "accepted": receipt["accepted"],
            "reason": receipt.get("reason"),
            "repeat": receipt["repeat"],
            "status": receipt.get("outcome") or receipt["reason"],
            **({"duelId": receipt["duelId"]} if receipt.get("duelId") is not None else {}),
            "festival": await self.view(admin, player_id, arena=arena),
        }

    async def intent(
        self,
        admin: SupabaseAdmin,
        player_id: str,
        kind: str,
        uid: str,
        *,
        arena: bool,
        lamp_id: str | None = None,
        signals: tuple[str, ...] = (),
    ) -> dict:
        store = FestivalStore(admin)
        previous = await store.receipt(player_id, uid)
        if previous is not None:
            return await self.answer(admin, player_id, previous, arena=arena)
        if kind == "claim" and lamp_id not in self.content.lamp_ids:
            raise ApiError(404, "no_such_lamp", "That festival lamp is not available.")
        if kind == "join":
            if not arena:
                raise ApiError(404, "feature_off", "The Keepers' Ring is closed for now.")
            rules.check_sequence(signals, 3)
        for _ in range(2):
            parameters = {"p_player_id": player_id, "p_action_uid": uid}
            if kind == "claim":
                parameters["p_lamp_id"] = lamp_id
                function = "festival_claim"
            elif kind == "leave":
                function = "festival_ring_leave"
            elif kind == "join":
                candidate = await store.candidate(player_id)
                resolution = (
                    None if candidate is None else rules.resolve(candidate["signals"], signals)
                )
                parameters.update(
                    {
                        "p_signals": list(signals),
                        "p_expected_queue_id": None if candidate is None else candidate["id"],
                        "p_round_results": None
                        if resolution is None
                        else list(resolution.round_results),
                        "p_outcome": None if resolution is None else resolution.outcome,
                        "p_day_start": rules.duel_day_start(self.clock()).isoformat(),
                    }
                )
                function = "festival_ring_join"
            else:
                raise ValueError("Unknown festival intent.")
            reply = await store.mutate(function, parameters)
            if reply["status"] != "state_changed":
                return await self.answer(admin, player_id, reply, arena=arena)
        raise ApiError(409, "festival_busy", "The festival changed. Try that action again.")
