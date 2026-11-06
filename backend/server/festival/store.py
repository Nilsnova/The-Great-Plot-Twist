"""Scoped festival rows and four service-only RPCs through the existing admin port.

Private queued signals are used only for A7 resolution and never copied into a response.
"""

from uuid import UUID

from server.duels import rules
from server.festival.content import LAMP_IDS
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

REASONS = frozenset(
    (
        "festival_waiting",
        "festival_ended",
        "lamp_occupied",
        "already_queued",
        "in_duel",
        "not_queued",
        "no_such_lamp",
        "state_changed",
    )
)
OUTCOMES = frozenset(("claimed", "already_claimed", "queued", "paired", "left"))
REPLY_FIELDS = frozenset(
    (
        "status",
        "accepted",
        "reason",
        "outcome",
        "repeat",
        "lampId",
        "queueId",
        "duelId",
    )
)


def require(condition: bool) -> None:
    if not condition:
        raise SupabaseRejected("The festival records could not be read.")


def uuid_text(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        UUID(value)
    except ValueError:
        return False
    return True


def checked_reply(raw: object) -> dict:
    if raw == {"status": "state_changed"}:
        return {
            "status": "state_changed",
            "accepted": False,
            "reason": "state_changed",
            "repeat": False,
        }
    require(isinstance(raw, dict) and raw.keys() <= REPLY_FIELDS)
    require(raw.get("status") in ("done", "refused", "state_changed"))
    require(type(raw.get("accepted")) is bool and type(raw.get("repeat")) is bool)
    require(
        raw.get("reason") is None or (isinstance(raw["reason"], str) and raw["reason"] in REASONS)
    )
    require(
        raw.get("outcome") is None
        or (isinstance(raw["outcome"], str) and raw["outcome"] in OUTCOMES)
    )
    require((raw["status"] == "done") == raw["accepted"])
    if raw["accepted"]:
        require(raw.get("outcome") in OUTCOMES and raw.get("reason") is None)
    else:
        require(raw.get("reason") in REASONS)
    if "lampId" in raw:
        require(raw["lampId"] in LAMP_IDS)
    for key in ("queueId", "duelId"):
        if key in raw and raw[key] is not None:
            require(uuid_text(raw[key]))
    if raw.get("outcome") in ("claimed", "already_claimed"):
        require(raw.get("lampId") in LAMP_IDS)
    if raw.get("outcome") in ("queued", "paired", "left"):
        require(uuid_text(raw.get("queueId")))
    if raw.get("outcome") == "paired":
        require(uuid_text(raw.get("duelId")))
    return dict(raw)


class FestivalStore:
    def __init__(self, admin: SupabaseAdmin) -> None:
        self.admin = admin

    async def claims(self) -> dict[str, str]:
        rows = await self.admin.select_rows(
            "festival_claims",
            {
                "select": "lamp_id,player_id",
                "order": "lamp_id.asc",
                "limit": "12",
            },
        )
        require(isinstance(rows, list) and len(rows) <= 12)
        result = {}
        for row in rows:
            require(isinstance(row, dict) and row.get("lamp_id") in LAMP_IDS)
            require(uuid_text(row.get("player_id")) and row["lamp_id"] not in result)
            result[row["lamp_id"]] = row["player_id"]
        return result

    async def mine(self, player_id: str) -> dict | None:
        rows = await self.admin.select_rows(
            "festival_queue",
            {
                "select": "id,player_id,state,duel_id",
                "player_id": f"eq.{player_id}",
                "order": "created_at.desc,id.desc",
                "limit": "1",
            },
        )
        require(isinstance(rows, list) and len(rows) <= 1)
        if not rows:
            return None
        row = rows[0]
        require(isinstance(row, dict) and row.get("player_id") == player_id)
        require(uuid_text(row.get("id")) and row.get("state") in ("queued", "paired", "left"))
        require(row.get("duel_id") is None or uuid_text(row["duel_id"]))
        return row

    async def receipt(self, player_id: str, uid: str) -> dict | None:
        rows = await self.admin.select_rows(
            "festival_actions",
            {
                "select": "player_id,action_uid,kind,reply",
                "player_id": f"eq.{player_id}",
                "action_uid": f"eq.{uid}",
                "limit": "1",
            },
        )
        require(isinstance(rows, list) and len(rows) <= 1)
        if not rows:
            return None
        row = rows[0]
        require(isinstance(row, dict) and row.get("player_id") == player_id)
        require(row.get("action_uid") == uid and row.get("kind") in ("claim", "join", "leave"))
        return {**checked_reply(row.get("reply")), "repeat": True}

    async def candidate(self, player_id: str) -> dict | None:
        raw = await self.admin.call_function("festival_ring_candidate", {"p_player_id": player_id})
        require(isinstance(raw, dict) and set(raw) == {"candidate"})
        item = raw["candidate"]
        if item is None:
            return None
        require(isinstance(item, dict) and set(item) == {"id", "playerId", "signals"})
        require(
            uuid_text(item["id"]) and uuid_text(item["playerId"]) and item["playerId"] != player_id
        )
        require(isinstance(item["signals"], list) and len(item["signals"]) == 3)
        require(all(signal in rules.SIGNALS for signal in item["signals"]))
        require(rules.sequence_cost(item["signals"]) <= rules.oil_for(3))
        return item

    async def mutate(self, function: str, parameters: dict) -> dict:
        require(function in ("festival_claim", "festival_ring_join", "festival_ring_leave"))
        return checked_reply(await self.admin.call_function(function, parameters))
