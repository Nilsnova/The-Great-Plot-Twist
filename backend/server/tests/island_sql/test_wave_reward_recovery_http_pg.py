"""Saved reward recovery through real HTTP into disposable PostgreSQL, never a live database."""

from dataclasses import replace

import pytest

pytest.importorskip("psycopg")

from server.flags import parse_flags  # noqa: E402
from server.tests.island_sql.test_recovery_two_player_http_pg import (  # noqa: E402
    HEADERS,
    MEMBER,
    OWNER,
    client_for,
    finish,
    join,
    page,
    ring,
    seed_recovery,
    shift,
)


def test_return_recovers_old_rewards_without_membership_flags_or_a_client_checkpoint(database):
    seed_recovery(database)
    client, admin = client_for(database)
    with client:
        started = ring(client, admin, "return-http-wave")
        shift(database, started["waveId"], 30)
        join(client, started["waveId"])
        prefix = page(client, "owner", started["waveId"])
        closed = finish(client, "owner", started, prefix, "return-close01")
        assert closed.status_code == 200, closed.text
        loot = closed.json()["loot"]
    database.execute("reset role")
    database.execute(
        "update public.island_members set left_at=now() where island_owner=%s and player_id=%s",
        (OWNER, MEMBER),
    )
    shift(database, started["waveId"], 2000)
    previous = database.execute(
        "select balance from public.wallets where player_id=%s",
        (MEMBER,),
    ).fetchone()[0]
    returned_client, _ = client_for(database)
    returned_client.app.state.settings = replace(
        returned_client.app.state.settings, flags=parse_flags("")
    )
    with returned_client:
        # The caller sends no old wave ID, island ID, outcome, amount or checkpoint.
        paid_but_response_lost = returned_client.post(
            "/api/waves/recover", headers=HEADERS["member"], json={}
        )
        assert paid_but_response_lost.status_code == 200, paid_but_response_lost.text
        assert paid_but_response_lost.json()["recovered"] == [
            {
                "waveId": started["waveId"],
                "wave": started["wave"],
                "survived": True,
                "loot": loot,
            }
        ]
        retry = returned_client.post("/api/waves/recover", headers=HEADERS["member"], json={})
        assert retry.status_code == 200, retry.text
        assert retry.json() == {
            "coins": previous + loot,
            "wonWaveBest": started["wave"],
            "recovered": [],
            "hasMore": False,
        }
    assert (
        database.execute(
            "select count(*) from public.wallet_transactions where player_id=%s "
            "and reason='pirate_loot' and ref=%s",
            (MEMBER, f"wave:{started['waveId']}:{MEMBER}"),
        ).fetchone()[0]
        == 1
    )
