"""Arsenal route protocol fixtures, separate from real SQL authority/transaction checks."""

import json

import httpx

from server.tests.island_helpers import ARSENAL_DONE, FakeIslandDatabase


class FakeRuntimeArsenalDatabase(FakeIslandDatabase):
    def __init__(self):
        super().__init__()
        self.shared_arsenal_reply = None
        self.shared_write_reply = None

    def __call__(self, request):
        name = request.url.path.rsplit("/", 1)[-1]
        if request.method != "POST" or name not in (
            "island_shared_arsenal_read",
            "island_shared_arsenal_request",
            "island_arsenal_legacy_request",
        ):
            return super().__call__(request)
        self.requests.append(request)
        if name == "island_shared_arsenal_read":
            return self.answer(self.shared_arsenal_reply)
        if name == "island_shared_arsenal_request":
            return self.answer(self.shared_write_reply)
        command = json.loads(request.content)
        kind = command["p_kind"]
        reply = self.arsenal_replies.get("arsenal_" + kind, ARSENAL_DONE)
        if isinstance(reply, httpx.Response) or reply.get("status") == "refused":
            return self.answer(reply)
        island = next(
            (
                row
                for row in self.islands.values()
                if row.get("player_id") == command["p_island_owner"]
            ),
            None,
        )
        island = island or {
            "player_id": command["p_island_owner"],
            "code": "K7Q2M",
            "wave_best": self.progress["wave_best"],
            "flags": 0,
        }
        return self.answer({**reply, "island": island})


def legacy_calls(world, kind):
    return [
        call
        for call in world.database.calls("island_arsenal_legacy_request")
        if call["p_kind"] == kind
    ]
