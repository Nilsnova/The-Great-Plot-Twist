"""Festival HTTP reads preserve privacy, server clocks, strict intents and durable replay."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import Player
from server.duels import rules
from server.festival.content import LAMP_IDS, FestivalContentError, load_content
from server.settings import Settings

PLAYER = "11111111-1111-4111-8111-111111111111"
FRIEND = "22222222-2222-4222-8222-222222222222"
QUEUE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
DUEL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
START = datetime(2026, 11, 6, 12, tzinfo=UTC)
AUTH = {"Authorization": "Bearer local.player.fixture"}
OTHER = {"Authorization": "Bearer local.friend.fixture"}


class Verifier:
    def __init__(self):
        self.calls = []

    async def verify(self, token):
        self.calls.append(token)
        return Player(FRIEND if token == "local.friend.fixture" else PLAYER)


class Database:
    def __init__(self):
        self.world = {
            "stage": "relit",
            "relit_at": START.isoformat(),
            "solves": 4,
            "extra_lights": 3,
        }
        self.reads, self.calls = [], []
        self.claims, self.receipts, self.mine = {}, {}, {}
        self.candidate = None
        self.races = 0

    async def select_rows(self, table, query):
        self.reads.append((table, deepcopy(query)))
        if table == "world_state":
            return [self.world]
        if table == "festival_claims":
            return [{"lamp_id": lamp, "player_id": player} for lamp, player in self.claims.items()]
        player = query["player_id"].removeprefix("eq.")
        if table == "festival_queue":
            return [self.mine[player]] if player in self.mine else []
        if table == "festival_actions":
            uid = query["action_uid"].removeprefix("eq.")
            receipt = self.receipts.get((player, uid))
            return (
                []
                if receipt is None
                else [{"player_id": player, "action_uid": uid, "kind": "claim", "reply": receipt}]
            )
        raise AssertionError("An unexpected table was queried.")

    async def call_function(self, name, params):
        self.calls.append((name, deepcopy(params)))
        if name == "festival_ring_candidate":
            return {"candidate": deepcopy(self.candidate)}
        if self.races:
            self.races -= 1
            return {"status": "state_changed"}
        player, uid = params["p_player_id"], params["p_action_uid"]
        receipt = {"status": "done", "accepted": True, "reason": None, "repeat": False}
        if name == "festival_claim":
            lamp = params["p_lamp_id"]
            self.claims[lamp] = player
            receipt.update(outcome="claimed", lampId=lamp)
        elif name == "festival_ring_join":
            paired = self.candidate is not None
            receipt.update(outcome="paired" if paired else "queued", queueId=QUEUE)
            self.mine[player] = {
                "id": QUEUE,
                "player_id": player,
                "state": "paired" if paired else "queued",
                "duel_id": DUEL if paired else None,
            }
            if paired:
                receipt["duelId"] = DUEL
        else:
            receipt.update(outcome="left", queueId=QUEUE)
            self.mine.pop(player, None)
        self.receipts[player, uid] = deepcopy(receipt)
        return receipt


def setup(*, enabled=True, arena=True):
    database, verifier = Database(), Verifier()
    now = [START + timedelta(hours=1)]
    app = create_app(
        Settings(flags={"festival": enabled, "arena": arena}),
        verifier=verifier,
        admin=database,
        clock=lambda: now[0],
    )
    return TestClient(app), database, verifier, now


def test_public_and_signed_in_views_map_story_lights_without_leaking_owners_or_signals():
    client, database, verifier, _ = setup()
    database.claims = {LAMP_IDS[0]: PLAYER, LAMP_IDS[1]: FRIEND}
    public = client.get("/api/festival")
    assert public.status_code == 200 and public.headers["cache-control"] == "private, no-store"
    body = public.json()
    assert body["phase"] == "active" and body["remainingSeconds"] == 47 * 3600
    assert [lamp["lit"] for lamp in body["lamps"]] == [True] * 3 + [False] * 9
    assert sum(lamp["claimed"] for lamp in body["lamps"]) == 2
    assert not any(lamp["claimedByMe"] for lamp in body["lamps"])
    assert not verifier.calls
    private = client.get("/api/festival", headers=AUTH)
    assert private.json()["lamps"][0]["claimedByMe"]
    assert not private.json()["lamps"][1]["claimedByMe"]
    assert (
        PLAYER not in private.text and FRIEND not in private.text and "signals" not in private.text
    )
    assert database.world["extra_lights"] == 3


def test_exact_end_hides_claims_and_queue_without_sliding_first_relighting():
    client, database, _, now = setup()
    database.claims[LAMP_IDS[0]] = PLAYER
    database.mine[PLAYER] = {"id": QUEUE, "player_id": PLAYER, "state": "queued", "duel_id": None}
    now[0] = START + timedelta(hours=48, microseconds=-1)
    assert client.get("/api/festival", headers=AUTH).json()["remainingSeconds"] == 1
    now[0] = START + timedelta(hours=48)
    ended = client.get("/api/festival", headers=AUTH).json()
    assert ended["phase"] == "ended" and ended["remainingSeconds"] == 0
    assert not any(lamp["claimed"] for lamp in ended["lamps"])
    assert ended["ring"] == {"available": False, "queued": False, "duelId": None}
    assert ended["endsAt"] == "2026-11-08T12:00:00Z"


@pytest.mark.parametrize(
    "url,body",
    (
        ("/api/festival", None),
        ("/api/festival/claim", {"lampId": LAMP_IDS[0], "actionUid": "claim001"}),
        ("/api/festival/ring/join", {"signals": ["shade"] * 3, "actionUid": "join0001"}),
        ("/api/festival/ring/leave", {"actionUid": "leave001"}),
    ),
)
def test_off_gate_refuses_before_auth_database_or_mutation(url, body):
    client, database, verifier, _ = setup(enabled=False)
    response = client.get(url) if body is None else client.post(url, json=body)
    assert response.status_code == 404 and response.json()["error"]["code"] == "feature_off"
    assert response.headers["cache-control"] == "private, no-store"
    assert not database.reads and not database.calls and not verifier.calls


@pytest.mark.parametrize(
    "body",
    (
        {"actionUid": "claim001"},
        {"lampId": LAMP_IDS[0], "actionUid": True},
        {"lampId": LAMP_IDS[0], "actionUid": "short"},
        {"lampId": LAMP_IDS[0], "actionUid": "claim001", "playerId": FRIEND},
        {"lampId": LAMP_IDS[0], "actionUid": "claim001", "price": 0},
    ),
)
def test_claim_bodies_reject_missing_and_extra_client_facts(body):
    client, database, _, _ = setup()
    response = client.post("/api/festival/claim", headers=AUTH, json=body)
    assert response.status_code == 422 and not database.calls


def test_writes_need_login_and_own_reads_are_scoped_to_the_verified_player():
    client, database, _, _ = setup()
    body = {"lampId": LAMP_IDS[0], "actionUid": "claim001"}
    assert client.post("/api/festival/claim", json=body).status_code == 401
    response = client.post("/api/festival/claim", headers=OTHER, json=body)
    assert response.status_code == 200
    assert database.calls[-1][1]["p_player_id"] == FRIEND
    for table, query in database.reads:
        if table in ("festival_queue", "festival_actions"):
            assert query["player_id"] == f"eq.{FRIEND}"


def test_receipt_replay_precedes_unknown_target_expiry_and_ring_oil_checks():
    client, database, _, now = setup()
    first = client.post(
        "/api/festival/claim", headers=AUTH, json={"lampId": LAMP_IDS[0], "actionUid": "claim001"}
    ).json()
    assert first["accepted"] and not first["repeat"]
    now[0] = START + timedelta(hours=49)
    repeated = client.post(
        "/api/festival/claim",
        headers=AUTH,
        json={"lampId": "unknown_lamp", "actionUid": "claim001"},
    ).json()
    assert repeated["accepted"] and repeated["repeat"] and repeated["status"] == "claimed"
    assert repeated["festival"]["phase"] == "ended" and len(database.calls) == 1
    replay = client.post(
        "/api/festival/ring/join",
        headers=AUTH,
        json={"signals": ["flash"] * 3, "actionUid": "claim001"},
    ).json()
    assert replay["repeat"] and len(database.calls) == 1


def test_unknown_lamp_is_an_error_and_ring_reuses_a7_resolution_without_client_results():
    client, database, _, _ = setup()
    assert (
        client.post(
            "/api/festival/claim", headers=AUTH, json={"lampId": "missing", "actionUid": "claim001"}
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/festival/ring/join",
            headers=AUTH,
            json={"signals": ["flash"] * 3, "actionUid": "join0001"},
        ).json()["error"]["code"]
        == "not_enough_oil"
    )
    first, second = ["flash", "shade", "shade"], ["mirror", "shade", "shade"]
    database.candidate = {"id": QUEUE, "playerId": FRIEND, "signals": first}
    result = client.post(
        "/api/festival/ring/join", headers=AUTH, json={"signals": second, "actionUid": "join0002"}
    )
    assert result.status_code == 200 and result.json()["duelId"] == DUEL
    arguments = database.calls[-1][1]
    expected = rules.resolve(first, second)
    assert arguments["p_round_results"] == list(expected.round_results)
    assert arguments["p_outcome"] == expected.outcome
    assert arguments["p_expected_queue_id"] == QUEUE
    assert "signals" not in result.text and FRIEND not in result.text
    assert not any("stake" in key or "price" in key for key in arguments)


def test_ring_needs_arena_but_existing_receipt_and_leave_still_work():
    client, database, _, _ = setup(arena=False)
    assert (
        client.post(
            "/api/festival/ring/join",
            headers=AUTH,
            json={"signals": ["shade"] * 3, "actionUid": "join0001"},
        ).status_code
        == 404
    )
    assert not database.calls
    assert (
        client.post(
            "/api/festival/ring/leave", headers=AUTH, json={"actionUid": "leave001"}
        ).status_code
        == 200
    )


@pytest.mark.parametrize("races,status", ((1, 200), (2, 409)))
def test_queue_races_retry_once_then_return_a_bounded_busy_answer(races, status):
    client, database, _, _ = setup()
    database.races = races
    response = client.post(
        "/api/festival/ring/join",
        headers=AUTH,
        json={"signals": ["shade"] * 3, "actionUid": "join0001"},
    )
    assert response.status_code == status
    assert len([name for name, _ in database.calls if name == "festival_ring_join"]) == 2


def test_malformed_private_candidate_does_not_escape_or_become_a_duel():
    client, database, _, _ = setup()
    database.candidate = {"id": QUEUE, "playerId": PLAYER, "signals": ["shade"] * 3}
    response = client.post(
        "/api/festival/ring/join",
        headers=AUTH,
        json={"signals": ["shade"] * 3, "actionUid": "join0001"},
    )
    assert response.status_code == 502 and PLAYER not in response.text
    assert [name for name, _ in database.calls] == ["festival_ring_candidate"]


def test_query_parameters_are_refused_without_fetching_world_or_queuing():
    client, database, _, _ = setup()
    assert client.get("/api/festival?festival=1").status_code == 422
    assert not database.calls and not database.reads


def test_configuration_must_keep_the_approved_duration_and_canonical_spots(tmp_path):
    import json

    from server.festival.content import CONTENT_PATH

    original = json.loads(CONTENT_PATH.read_text())
    path = tmp_path / "festival.json"
    for fields in ({"durationSeconds": 60}, {"lampIds": ["unapproved"]}, {"durationSeconds": True}):
        path.write_text(json.dumps({**original, **fields}))
        with pytest.raises(FestivalContentError):
            load_content(path)
