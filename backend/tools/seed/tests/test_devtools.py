"""Run with uv run --with pgserver --with 'psycopg[binary]' pytest tools/seed/tests."""

import json
import subprocess
import sys
from uuid import uuid4

import httpx
import pgserver
import psycopg
import pytest
from fastapi.testclient import TestClient

from tools.seed.database import ROOT, apply_migrations, bootstrap, connect, local_parameters
from tools.seed.demo import CREW_IDS, PLAYER_IDS, seed

sys.path.insert(0, str(ROOT / "scripts/dev"))
from local_api import make_app  # noqa: E402


@pytest.fixture
def scratch(tmp_path):
    server = pgserver.get_server(tmp_path / "pgdata", cleanup_mode="delete")
    try:
        url = server.get_uri()
        with connect(url, scratch=True) as conn:
            bootstrap(conn)
            apply_migrations(conn)
            seed(conn)
        yield url
    finally:
        server.cleanup()


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://postgres@db.example.invalid/postgres",
        "postgresql://postgres@127.0.0.1/postgres?host=db.example.invalid",
        "postgresql://postgres@127.0.0.1/postgres?hostaddr=192.0.2.1",
        "postgresql://postgres@127.0.0.1/postgres?service=production",
        "postgresql://postgres@127.0.0.1/postgres?passfile=/tmp/credentials",
        "host=127.0.0.1,db.example.invalid dbname=scratch user=postgres",
        "host=/tmp,remote dbname=scratch user=postgres",
        "dbname=scratch user=postgres",
        "postgresql://postgres@127.1/postgres",
        "postgresql://postgres@localhost.example.invalid/postgres",
    ],
)
def test_refuses_unsafe_destinations_before_connecting(monkeypatch, url):
    def forbidden(**kwargs):
        pytest.fail("Unsafe target reached psycopg.connect")

    monkeypatch.setattr(psycopg, "connect", forbidden)
    with pytest.raises(ValueError):
        connect(url, scratch=True)


def test_requires_scratch_and_rejects_libpq_environment(monkeypatch):
    url = "postgresql://postgres@127.0.0.1/scratch"
    with pytest.raises(ValueError, match="--scratch"):
        local_parameters(url, scratch=False)
    monkeypatch.setenv("PGSERVICE", "production")
    with pytest.raises(ValueError, match="PG"):
        connect(url, scratch=True)


@pytest.mark.parametrize(
    "host, address",
    [
        ("localhost", "127.0.0.1"),
        ("127.0.0.1", "127.0.0.1"),
        ("::1", "::1"),
        ("/tmp", ""),
    ],
)
def test_local_targets_are_pinned(host, address):
    params = local_parameters(f"host={host} user=postgres dbname=scratch", scratch=True)
    assert params["hostaddr"] == address


def snapshot(conn):
    return {
        table: conn.execute(
            f"select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from public.{table} t"
        ).fetchone()[0]
        for table in [
            "profiles",
            "wallets",
            "wallet_transactions",
            "crews",
            "crew_seats",
            "market_positions",
            "market_trades",
            "entry_profiles",
        ]
    }


def test_seed_idempotence_reset_and_wallet_consistency(scratch):
    with connect(scratch, scratch=True) as conn:
        first = snapshot(conn)
        seed(conn)
        assert snapshot(conn) == first
        assert conn.execute("select count(*) from auth.users").fetchone()[0] == 20
        assert conn.execute("select count(*) from public.crews").fetchone()[0] == 6
        assert conn.execute(
            "select distinct status from public.crews order by status"
        ).fetchall() == [
            ("active",),
            ("finished",),
            ("forming",),
        ]
        assert (
            conn.execute("""
            select count(*) from public.wallets w where w.balance !=
            (select sum(delta) from public.wallet_transactions t where t.player_id=w.player_id)
        """).fetchone()[0]
            == 0
        )
        other = uuid4()
        conn.execute("insert into auth.users(id) values (%s)", (other,))
        # A stopped market board must not prevent --reset rebuilding demo fixtures.
        conn.execute(
            "update public.market_bases set halted_until=now()+interval '1 hour', "
            "frozen_price=base_game_price"
        )
        report = seed(conn, reset=True)
        assert report["players"] == 20 and report["marketPositions"] == 20
        assert conn.execute("select id from auth.users where id=%s", (other,)).fetchone()
        assert conn.execute("select count(*) from public.wallets").fetchone()[0] == 21
        assert not conn.execute(
            "select 1 from public.market_bases where halted_until is not null"
        ).fetchone()


def test_requires_marker_even_for_local_database(tmp_path):
    server = pgserver.get_server(tmp_path / "pgdata", cleanup_mode="delete")
    try:
        with connect(server.get_uri(), scratch=True) as conn:
            with pytest.raises(ValueError, match="identity is missing"):
                seed(conn)
    finally:
        server.cleanup()


def test_start_shell_applies_entire_migration_chain_twice():
    result = subprocess.run(
        [str(ROOT / "scripts/dev/start.sh"), "--check-migrations"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout.strip().splitlines()[-1])
    assert report["migrationPasses"] == 2
    assert report["migrations"] == [
        p.name for p in sorted((ROOT / "supabase/migrations").glob("*.sql"))
    ]
    assert report["seed"]["players"] == 20


def test_local_login_reads_writes_and_crews_without_external_http(scratch, monkeypatch):
    async def forbidden(*args, **kwargs):
        pytest.fail("Local demo attempted an outside HTTP request")

    monkeypatch.setattr(httpx.AsyncClient, "request", forbidden)
    monkeypatch.setenv("SUPABASE_URL", "https://never-connect.example.invalid")
    monkeypatch.setenv("DEMO_MODE", "false")
    with TestClient(make_app(scratch)) as client:
        assert client.get("/api/me").status_code == 401
        assert client.get("/api/dev/players").status_code == 200
        response = client.post(
            "/api/auth/exchange",
            json={
                "code": "dev-player-19",
                "codeVerifier": "x" * 43,
            },
        )
        assert response.status_code == 200
        headers = {"Authorization": f"Bearer {response.json()['accessToken']}"}
        assert client.get("/api/me", headers=headers).json()["id"] == str(PLAYER_IDS[18])
        save = client.get("/api/save", headers=headers).json()
        assert (
            client.put(
                "/api/save",
                headers=headers,
                json={
                    "version": save["version"],
                    "data": {"g22": "saved"},
                },
            ).status_code
            == 200
        )
        assert client.get("/api/save", headers=headers).json()["data"] == {"g22": "saved"}
        assert client.get("/api/weather").json()["source"] == "fallback"
        board = client.get("/api/market")
        assert board.status_code == 200
        assert all(company["status"] == "open" for company in board.json()["companies"])
        assert client.get("/api/market/portfolio", headers=headers).status_code == 200
        trade = client.post(
            "/api/market/trade",
            headers=headers,
            json={
                "companyId": "harbor-trust",
                "side": "buy",
                "units": 1,
                "actionUid": "g22-api-smoke-buy",
            },
        )
        assert trade.status_code == 200, trade.text
        assert client.post("/api/crews", headers=headers).status_code == 200
        started = client.post("/api/crews/me/start", headers=headers)
        assert started.status_code == 200, started.text
        assert started.json()["crew"]["status"] == "active"
        # Seeded nested crew/seat/profile projections also work.
        owner = {"Authorization": "Bearer dev-player-03"}
        crew = client.get("/api/crews/me", headers=owner)
        assert crew.status_code == 200, crew.text
        assert crew.json()["crew"]["id"] == str(CREW_IDS[1])
