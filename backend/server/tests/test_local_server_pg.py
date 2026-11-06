"""Opt-in API golden path over the actual full migration chain and SQL functions.

Run with CASE_PG_SCRATCH=1 and uv --with pgserver --with 'psycopg[binary]'. These checks
derive case actions only from the public API view; no case solution is copied into fixtures.
"""

import asyncio
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.supabase_admin import SupabaseRejected
from tools.local_players import PLAYERS
from tools.local_server import create_local_app

pytestmark = pytest.mark.skipif(
    os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in disposable PostgreSQL checks"
)
INTRO = [
    "to_desk",
    "take_key",
    "desk_back",
    "to_shore",
    "take_lantern",
    "shore_back",
    "to_tower",
    "unlock_door",
    "climb",
    "untie",
]


def request_ok(client, method, url, **kwargs):
    response = client.request(method, url, **kwargs)
    assert response.status_code == 200
    return response.json()


def test_actual_api_golden_path_and_disposable_cleanup(monkeypatch):
    pytest.importorskip("pgserver")
    pytest.importorskip("psycopg")
    app = create_local_app({"LOCAL_TEST_SERVER": "1", "APP_ENV": "local"})
    database = app.state.local_database
    with TestClient(app) as client:
        directory = Path(database.directory.name)
        headers = []
        for index, player in enumerate(PLAYERS):
            login = request_ok(client, "POST", "/api/local/sign-in", json={"player": player.name})
            assert login["playerId"] == player.id
            assert login["isHost"] is (index == 0)
            headers.append({"Authorization": f"Bearer {login['accessToken']}"})
        assert client.post("/api/local/sign-in", json={"player": "unknown"}).status_code == 401
        assert client.get("/api/me").status_code == 401
        assert (
            client.get(
                "/api/me", headers={"Authorization": "Bearer local.unknown.fixture"}
            ).status_code
            == 401
        )
        for header in headers[1:]:
            assert (
                client.post(
                    "/api/host/case/clock",
                    headers=header,
                    json={"seconds": 60, "actionUid": "denied001"},
                ).status_code
                == 403
            )

        # Server-side story referee and wallet grant, not pre-seeded entry profiles.
        for header in headers:
            intro = request_ok(
                client, "POST", "/api/intro/complete", headers=header, json={"actions": INTRO}
            )
            assert intro["coinsPaid"] > 0 and not intro["alreadyGranted"]
            retry = request_ok(
                client, "POST", "/api/intro/complete", headers=header, json={"actions": INTRO}
            )
            assert retry["alreadyGranted"] and retry["coinsPaid"] == 0
        assert request_ok(client, "GET", "/api/case", headers=headers[0]) == {"case": None}
        crew = request_ok(client, "POST", "/api/crews", headers=headers[0])["crew"]
        joined = request_ok(
            client, "POST", "/api/crews/join", headers=headers[1], json={"code": crew["code"]}
        )["crew"]
        assert joined["id"] == crew["id"] and joined["mySeat"] == 2
        active = request_ok(client, "POST", "/api/crews/me/start", headers=headers[0])["crew"]
        assert active["status"] == "active"
        assert sum(seat["holder"] == "partner" for seat in active["seats"]) == 2

        # The embedded read must keep one snapshot if another request changes a crew.
        admin = app.state.admin
        original_raw = admin._raw
        changed = []

        def concurrent_change(connection, table, filters, order=None):
            rows = original_raw(connection, table, filters, order)
            if table == "crew_seats" and not changed:
                with database.connect() as writer:
                    writer.execute(
                        "update crews set status = 'finished' where id = %s", (crew["id"],)
                    )
                changed.append(True)
            return rows

        with monkeypatch.context() as patch:
            patch.setattr(admin, "_raw", concurrent_change)
            consistent = asyncio.run(
                admin.select_rows(
                    "crew_seats",
                    {"select": "crews(status)", "player_id": f"eq.{PLAYERS[0].id}", "limit": "1"},
                )
            )
        assert changed and consistent[0]["crews"]["status"] == "active"
        with database.connect() as writer:
            writer.execute("update crews set status = 'active' where id = %s", (crew["id"],))

        # Separate player remains isolated despite the admin port bypassing RLS.
        assert request_ok(client, "GET", "/api/crews/me", headers=headers[2]) == {"crew": None}
        assert request_ok(client, "GET", "/api/case", headers=headers[2]) == {"case": None}
        other = request_ok(client, "GET", "/api/me", headers=headers[2])
        assert other["crews"] == []
        view = request_ok(client, "GET", "/api/case", headers=headers[0])["case"]
        routes = [route for spot in view["search"]["spots"] for route in spot.get("routes", [])]
        route = next(route for route in routes if route["canStart"] and route["price"] == 0)
        payload = {"routeId": route["id"], "actionUid": "golden0001"}
        searched = request_ok(client, "POST", "/api/case/search", headers=headers[0], json=payload)
        assert searched["accepted"]
        repeated = request_ok(client, "POST", "/api/case/search", headers=headers[0], json=payload)
        assert repeated["repeat"]
        clock = request_ok(
            client,
            "POST",
            "/api/host/case/clock",
            headers=headers[0],
            json={"seconds": 60, "actionUid": "clock0001"},
        )
        assert clock["accepted"]
        assert clock["case"]["minute"] >= view["minute"] + 1
        with database.connect() as connection:
            count = connection.execute(
                "select count(*) from case_actions where player_id = %s and action_uid = %s",
                (PLAYERS[0].id, "golden0001"),
            ).fetchone()[0]
            assert count == 1

        # Both plain metadata reads and nested crew/case projections use actual database rows.
        rows = asyncio.run(
            app.state.admin.select_rows(
                "captain_name_rerolls",
                {"select": "player_id", "player_id": f"eq.{PLAYERS[0].id}", "limit": "1"},
            )
        )
        assert rows == []
        for table, query in (
            ("auth.users", {"select": "*"}),
            ("profiles", {"select": "id", "id": "or.true"}),
            ("profiles", {"select": "id", "offset": "1"}),
            ("profiles", {"select": "auth_users(*)"}),
            ("profiles", {"select": None}),
            ("profiles", {"select": "id", "id": None}),
            ("captain_name_rerolls", {"select": "unknown_column"}),
        ):
            with pytest.raises(SupabaseRejected):
                asyncio.run(app.state.admin.select_rows(table, query))
        with pytest.raises(SupabaseRejected):
            asyncio.run(app.state.admin.call_function("apply_wallet_transaction", {}))

        deleted = request_ok(
            client, "DELETE", "/api/me", headers=headers[1], json={"confirm": True}
        )
        assert deleted == {"deleted": True}
        assert client.get("/api/me", headers=headers[1]).status_code == 401
        assert client.post("/api/local/sign-in", json={"player": "friend"}).status_code == 401
        with database.connect() as connection:
            for table, key in (
                ("profiles", "id"),
                ("wallets", "player_id"),
                ("entry_profiles", "player_id"),
                ("crew_seats", "player_id"),
            ):
                # Table and column names here are fixed test constants.
                assert (
                    connection.execute(
                        f"select count(*) from {table} where {key} = %s", (PLAYERS[1].id,)
                    ).fetchone()[0]
                    == 0
                )
    assert database.uri is None and database.directory is None
    assert not directory.exists()


def test_l2_build_retry_isolation_and_delete_with_the_expanded_chain():
    pytest.importorskip("pgserver")
    pytest.importorskip("psycopg")
    app = create_local_app({"LOCAL_TEST_SERVER": "1", "APP_ENV": "local"})
    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {PLAYERS[0].token}"}
        friend = {"Authorization": f"Bearer {PLAYERS[1].token}"}
        assert client.get("/api/bulletin").status_code == 404
        request_ok(client, "POST", "/api/intro/complete", headers=headers, json={"actions": INTRO})
        before = request_ok(client, "GET", "/api/islet", headers=headers)
        plot = next(spot for spot in before["spots"] if spot["canBuild"])
        payload = {"plot": plot["plot"], "type": plot["type"], "actionUid": "build0001"}
        built = request_ok(client, "POST", "/api/islet/build", headers=headers, json=payload)
        assert built["coins"] == before["coins"] - built["coinsPaid"]
        assert built["timber"] == before["timber"] - built["timberPaid"]
        assert client.post("/api/islet/build", headers=headers, json=payload).status_code == 409
        other = request_ok(client, "GET", "/api/islet", headers=friend)
        assert other["timber"] == before["timber"]
        assert all(spot["level"] is None for spot in other["spots"])
        request_ok(client, "DELETE", "/api/me", headers=headers, json={"confirm": True})
        with app.state.local_database.connect() as connection:
            for table in ("islets", "islet_buildings"):
                assert (
                    connection.execute(
                        f"select count(*) from {table} where player_id = %s", (PLAYERS[0].id,)
                    ).fetchone()[0]
                    == 0
                )


def test_current_case_embeds_keep_recent_signals_and_bounded_earned_summaries():
    """The local port executes the current PostgREST aliases and per-relation bounds."""
    pytest.importorskip("pgserver")
    pytest.importorskip("psycopg")
    from server.game.case_store import snapshot_query

    app = create_local_app({"LOCAL_TEST_SERVER": "1", "APP_ENV": "local"})
    with TestClient(app) as client:
        header = {"Authorization": f"Bearer {PLAYERS[0].token}"}
        request_ok(client, "POST", "/api/intro/complete", headers=header, json={"actions": INTRO})
        crew = request_ok(client, "POST", "/api/crews", headers=header)["crew"]
        request_ok(client, "POST", "/api/crews/me/start", headers=header)
        request_ok(client, "GET", "/api/case", headers=header)
        with app.state.local_database.connect() as database:
            for number in range(42):
                database.execute(
                    "insert into public.finale_signals "
                    "(crew_id, night_no, light_id, post_seat_no, aimed_by, aimed_seat_no, "
                    "bearing, on_target, case_second, holds_until_second, parted) "
                    "values (%s, 1, %s, 1, %s, 1, 0, %s, %s, %s, %s)",
                    (
                        crew["id"],
                        "keepers_lamp" if number == 0 else "harbor_light",
                        PLAYERS[0].id,
                        number == 0,
                        number,
                        90 if number == 0 else None,
                        number == 0,
                    ),
                )
        rows = asyncio.run(app.state.admin.select_rows("crews", snapshot_query(crew["id"])))
        row = rows[0]
        assert len(row["finale_signals"]) == 40
        assert row["finale_signals"][0]["case_second"] == 41
        assert len(row["finale_parted_signals"]) == 1
        assert row["finale_parted_signals"][0]["case_second"] == 0
        assert row["finale_latest_harbor_light"][0]["case_second"] == 41
        assert row["finale_miss_harbor_light"][0]["case_second"] == 41
        assert row["finale_lock_keepers_lamp"][0]["case_second"] == 0
        assert row["finale_posts"] == []
        # Bad aliases and embedded limits remain errors, with no SQL interpolation.
        for changes in (
            {"select": "bad:profiles(*)"},
            {"finale_signals.limit": "10001"},
            {"unknown.limit": "1"},
        ):
            with pytest.raises(SupabaseRejected):
                asyncio.run(
                    app.state.admin.select_rows("crews", {**snapshot_query(crew["id"]), **changes})
                )
        assert request_ok(client, "GET", "/api/world")["stage"] == "dark"
