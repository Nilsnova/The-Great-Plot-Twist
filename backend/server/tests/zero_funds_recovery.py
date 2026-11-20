"""Fixtures for combined zero-budget domain/API acceptance; used by the zero-funds tests.

Only disposable PostgreSQL is used. Auth identities, the advanced saved island and market
timestamps/readings are explicit fixtures. Controller, snapshot, accounting, construction,
wager, boat and reset functions are the production implementations; none is replaced.
Scripted wave outcomes and stars prove transaction behavior, not combat playability.
"""

import asyncio
from uuid import uuid4

import pytest

pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.island import shared_session_api, shared_wave_template  # noqa: E402
from server.island.catalogue import Weather, load_island, runtime_catalogue  # noqa: E402
from server.island.personal_captain import configuration  # noqa: E402
from server.island.wave_rules import SIM_RULES  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, reconciles, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    add_players,
    as_owner,
    as_server,
    balance,
)
from server.tests.island_sql.test_shared_construction_sql import (  # noqa: E402
    construct,
    intent,
    target,
)
from server.tests.island_sql.test_shared_lifecycle_transactions_sql import (  # noqa: E402
    prepare,
)
from server.tests.shared_wagers_sql.test_shared_wager_transactions_sql import (  # noqa: E402
    make_due,
    open_wager,
    settlement,
)
from server.tests.structure_recovery_pg import TABLES, ScratchRecoveryAdmin  # noqa: E402

CATALOGUE = runtime_catalogue(load_island())
CALM = Weather("calm", "Calm", 1, 0)


class CanonicalAdmin(ScratchRecoveryAdmin):
    """Actual Python services call the same scratch transaction through their real SQL RPCs."""

    async def call_function(self, name, parameters):
        return self._call(name, parameters)

    async def select_rows(self, table, query):
        assert table in TABLES
        return ScratchRecoveryAdmin(self.connection)._select(table, query)


def money(database, treasury):
    as_owner(database)
    row = database.execute(
        "select balance_coins,committed_coins,balance_coins-committed_coins "
        "from public.island_economy_accounts where id=%s",
        (keys(treasury)[0],),
    ).fetchone()
    reconciles(database, keys(treasury)[0])
    return tuple(int(value) for value in row)


def buildings(database, owner):
    as_owner(database)
    return database.execute(
        "select plot,building_type,level from public.islet_buildings "
        "where player_id=%s order by plot",
        (owner,),
    ).fetchall()


def demolished_loss(database, *, pending=False, ship_ready=True):
    """A real member buys, demolishes every defense and loses the whole remaining budget."""
    prepared = prepare(database)
    owner, member, _, treasury, _ = prepared
    if not ship_ready:
        as_owner(database)
        database.execute("update public.islands set wreck_paid=0 where player_id=%s", (owner,))
    # The advanced v1 save needs its retained recovery configuration before a mutation.
    # Generate that fixture from the production catalogue/template, without an invented provider.
    snapshot, _ = asyncio.run(
        shared_wave_template.prepare_shared_wave(
            CanonicalAdmin(database),
            CATALOGUE,
            str(member),
            str(owner),
            CALM,
            42,
            list(SIM_RULES),
        )
    )
    as_owner(database)
    epoch = database.execute(
        "select reset_epoch from public.island_recovery_state where island_owner=%s", (owner,)
    ).fetchone()[0]
    database.execute(
        "insert into public.recovery_wave_states(wave_id,island_owner,reset_epoch,"
        "recovery_version,wave_protocol,initial_snapshot,closed_at,closed_hp) "
        "values(%s,%s,%s,1,2,%s,clock_timestamp(),'{}'::jsonb)",
        (uuid4(), owner, epoch, Jsonb(snapshot)),
    )
    original_wallets = [balance(database, actor) for actor in (owner, member)]
    as_server(database)
    saved_bet = (
        open_wager(database, member, owner, treasury, 10, "zero-pending-001") if pending else None
    )
    for spot, kind, price in (("wall_1", "wall", 10), ("cannon_1", "cannon", 30)):
        built = construct(
            database, member, treasury, intent(spot=spot, kind=kind, coins=str(price))
        )
        assert built["status"] == "done", built
        torn = construct(database, member, treasury, target(built, "demolish", str(price // 2)))
        assert torn["status"] == "done", torn
        assert torn["receipt"]["result"]["refundedCoins"] == str(price // 2)
    assert buildings(database, owner) == []
    available = money(database, treasury)[2]
    assert available == (70 if pending else 80)
    as_server(database)
    all_in = open_wager(database, member, owner, treasury, available, "zero-all-in-001")
    assert all_in["status"] == "done", all_in
    assert money(database, treasury)[2] == 0
    make_due(database, all_in)
    as_server(database)
    lost = settlement(database, all_in, price="99")
    assert lost["status"] == "done" and lost["settlement"]["outcome"] == "lost", lost
    assert lost["settlement"]["returnedPayout"] == "0"
    assert settlement(database, all_in, price="101")["receipt"] == lost["receipt"]
    assert money(database, treasury) == ((10, 10, 0) if pending else (0, 0, 0))
    assert [balance(database, actor) for actor in (owner, member)] == original_wallets
    return prepared, all_in, saved_bet


def add_members(database, prepared, count):
    owner, member, _, treasury, _ = prepared
    actors = [member]
    for _ in range(count - 1):
        actor = uuid4()
        add_players(database, actor)
        as_server(database)
        assert rpc(database, "game_join", actor, owner, 10)["status"] == "joined"
        assert (
            rpc(
                database,
                "personal_captain_initialize",
                actor,
                owner,
                keys(treasury)[1],
                Jsonb(configuration(CATALOGUE)),
            )["captain"]["progressionVersion"]
            == 1
        )
        actors.append(actor)
    return actors


def start_normal_wave(database, room, actor, uid="zero-native-bell-001"):
    as_server(database)
    changed = rpc(
        database,
        "shared_session_settings",
        actor,
        room["owner"],
        keys(room["treasury"])[1],
        room["sessions"][actor],
        room["generations"][actor],
        "zero-countdown-001",
        Jsonb({"countdownSeconds": 0}),
    )
    assert changed["status"] == "done", changed
    return asyncio.run(
        shared_session_api.start_wave(
            CanonicalAdmin(database),
            CATALOGUE,
            CALM,
            str(actor),
            str(room["owner"]),
            keys(room["treasury"])[1],
            str(room["sessions"][actor]),
            str(room["generations"][actor]),
            uid,
            rules=list(SIM_RULES),
        )
    )
