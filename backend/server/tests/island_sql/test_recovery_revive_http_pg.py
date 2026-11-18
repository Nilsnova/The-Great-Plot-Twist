"""Paid revival through real HTTP routes and disposable PostgreSQL, used by issue #466."""

import pytest

pytest.importorskip("psycopg")

from server.tests.island_sql.test_recovery_two_player_http_pg import (  # noqa: E402
    HEADERS,
    MEMBER,
    OWNER,
    client_for,
    join,
    page,
    ring,
    seed_recovery,
    shift,
)


def test_paid_revive_survives_a_lost_response_and_leaving_before_retry(database):
    seed_recovery(database)
    client, admin = client_for(database)
    with client:
        started = ring(client, admin, "revivebell01")
        wave_id = started["waveId"]
        shift(database, wave_id, 30)
        join(client, wave_id)
        body = {
            "waveId": wave_id,
            "fallen": started["participantToken"],
            "downAt": 10,
            "actionUid": "paidrevive01",
        }
        old_client = client.post("/api/waves/revive", headers=HEADERS["member"], json=body)
        assert old_client.status_code == 409, old_client.text
        assert old_client.json()["error"]["code"] == "client_update_required"

        body.update({"waveProtocol": 2, "x": 1, "z": 2})
        paid = client.post("/api/waves/revive", headers=HEADERS["member"], json=body)
        assert paid.status_code == 200, f"{paid.text}; {admin.last_database_error}"
        assert paid.json()["journaled"] is True
        assert paid.json()["repeat"] is False
        database.execute("reset role")
        database.execute(
            "update public.island_members set left_at=now() where island_owner=%s and player_id=%s",
            (OWNER, MEMBER),
        )
        retry = client.post("/api/waves/revive", headers=HEADERS["member"], json=body)
        assert retry.status_code == 200, retry.text
        assert retry.json() == {**paid.json(), "repeat": True}
        effects = [
            event
            for event in page(client, "owner", wave_id)["events"]
            if event["type"] == "captain_revive"
        ]
        assert len(effects) == 1
        assert effects[0]["payload"]["command"]["targetId"] == started["participantToken"]
        assert (
            database.execute(
                "select count(*) from public.wallet_transactions where player_id=%s "
                "and reason='captain_revive'",
                (MEMBER,),
            ).fetchone()[0]
            == 1
        )
