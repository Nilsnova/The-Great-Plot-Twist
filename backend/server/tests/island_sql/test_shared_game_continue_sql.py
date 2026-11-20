"""Real persisted provider, host Continue and immutable native bell replay.

Disposable PostgreSQL only. Every successful RPC commits, including deferred
constraints. This does not exercise hosted HTTP or rendered browser behavior.
"""

import asyncio

import pytest

pytest.importorskip("psycopg")

from server.errors import ApiError  # noqa: E402
from server.island import games  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    as_owner,
    keys,
    ready,
    rpc,
)
from server.tests.island_sql.test_islands_and_waves_sql import balance  # noqa: E402
from server.tests.island_sql.test_shared_session_api_sql import (  # noqa: E402
    SQLAdmin,
    room,
    start,
)


class ContinueAdmin(SQLAdmin):
    async def select_rows(self, table, query):
        self.calls.append(("select:" + table, query))
        self.connection.execute("set local role service_role")
        if table == "islands":
            assert query == {
                "select": "player_id,code,wave_best,flags",
                "player_id": query["player_id"], "limit": "1",
            }
            assert query["player_id"].startswith("eq.")
            row = self.connection.execute(
                "select player_id::text,code,wave_best,flags from public.islands "
                "where player_id=%s limit 1", (query["player_id"][3:],),
            ).fetchone()
            result = [] if row is None else [dict(zip(
                ("player_id", "code", "wave_best", "flags"), row, strict=True
            ))]
        else:
            assert table == "profiles" and query["select"] == "display_name"
            assert query["id"].startswith("eq.") and query["limit"] == "1"
            row = self.connection.execute(
                "select display_name from public.profiles where id=%s limit 1",
                (query["id"][3:],),
            ).fetchone()
            result = [] if row is None else [{"display_name": row[0]}]
        self.connection.commit()
        return result


class AdmissionRaceAdmin(ContinueAdmin):
    async def call_function(self, name, arguments):
        result = await super().call_function(name, arguments)
        if name == "island_economy_context":
            assert result["status"] == "legacy"
            owner = arguments["p_island_owner"]
            await super().call_function("island_treasury_admit", {
                "p_actor_id": owner, "p_island_owner": owner,
                "p_action_uid": "continue_admit_001", "p_starting_coins": 200,
            })
        return result


def test_admitted_host_continue_never_opens_or_pays_and_preserves_native_replay(database):
    prepared = room(database)
    _, _, owner, member, _, treasury, _, _ = prepared
    bell = start(database, prepared)
    as_owner(database)
    before_wallets = (balance(database, owner), balance(database, member))
    before_economy = rpc(database, "island_economy_context", owner)
    before_rows = database.execute(
        "select count(*) from public.island_treasury_transactions where account_id=%s",
        (keys(treasury)[0],),
    ).fetchone()[0]
    database.commit()
    admin = ContinueAdmin(database)

    first, created = asyncio.run(games.create(admin, 1000, str(owner)))
    again, repeated_created = asyncio.run(games.create(admin, 1000, str(owner)))

    assert not created and not repeated_created and first == again
    assert first.host_id == str(owner) and first.role == "host" and first.wave_best == 2
    assert first.members == 2
    assert [name for name, _ in admin.calls] == [
        "island_economy_context", "select:islands", "game_join", "select:profiles",
    ] * 2
    replay = start(database, prepared)
    assert replay["historical"] is True and replay["economy"] is None
    assert replay["waveId"] == bell["waveId"]
    assert replay["initialSnapshot"] == bell["initialSnapshot"]
    assert rpc(database, "island_economy_context", owner) == before_economy
    as_owner(database)
    assert (balance(database, owner), balance(database, member)) == before_wallets
    assert database.execute(
        "select count(*) from public.island_treasury_transactions where account_id=%s",
        (keys(treasury)[0],),
    ).fetchone()[0] == before_rows


def test_committed_admission_between_discovery_and_open_refuses_before_private_grant(database):
    owner, member, _, _ = ready(database, admitted=False)
    as_owner(database)
    before_wallets = (balance(database, owner), balance(database, member))
    database.commit()
    admin = AdmissionRaceAdmin(database)

    with pytest.raises(ApiError) as caught:
        asyncio.run(games.create(admin, 1000, str(owner)))

    assert (caught.value.status_code, caught.value.code) == (409, "economy_context_required")
    assert [name for name, _ in admin.calls] == [
        "island_economy_context", "island_treasury_admit", "island_open",
    ]
    assert rpc(database, "island_economy_context", owner)["economy"]["treasury"] == {
        "balanceCoins": "200", "committedCoins": "0", "availableCoins": "200",
    }
    as_owner(database)
    assert (balance(database, owner), balance(database, member)) == before_wallets
