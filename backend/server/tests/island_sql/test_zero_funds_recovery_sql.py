"""Combined zero-budget recovery on actual disposable PostgreSQL transactions.

Saved state, market timestamps/readings and wave outcomes are labeled test fixtures.
No canonical authority, domain transaction or economic rule is replaced.
"""

import asyncio
from time import monotonic, sleep

import pytest

pytest.importorskip("psycopg")

from server.island import shared_session_api  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, reconciles, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_owner,
    as_server,
    balance,
)
from server.tests.island_sql.test_shared_construction_sql import construct, intent  # noqa: E402
from server.tests.island_sql.test_shared_lifecycle_native_sql import native_room  # noqa: E402
from server.tests.island_sql.test_shared_lifecycle_transactions_sql import reset  # noqa: E402
from server.tests.island_sql.test_shared_ship_rewards_sql import claim, start  # noqa: E402
from server.tests.shared_wagers_sql.test_shared_wager_transactions_sql import (  # noqa: E402
    make_due,
    settlement,
)
from server.tests.zero_funds_recovery import (  # noqa: E402
    CATALOGUE,
    CanonicalAdmin,
    add_members,
    buildings,
    demolished_loss,
    money,
    start_normal_wave,
)


@pytest.mark.parametrize(
    "active_members,owner_present", [(1, False), (2, False), (4, False), (9, False), (10, True)]
)
def test_empty_defenses_and_lost_all_in_keep_normal_attempts_and_owner_only_reset(
    database,
    active_members,
    owner_present,
):
    prepared, _, _ = demolished_loss(database, ship_ready=False)
    owner, member, _, treasury, code = prepared
    actors = add_members(database, prepared, active_members - int(owner_present))
    if owner_present:
        actors.append(owner)
    # The ten-seat game counts its offline owner. Nine is its legal owner-absent maximum.
    room = native_room(database, prepared=prepared, actors=actors)
    assert money(database, treasury) == (0, 0, 0)
    as_server(database)
    authority = rpc(database, "island_economy_authority", member, owner)
    assert authority["session_leader_id"] == str(member)
    assert reset(database, owner, treasury, code, actor=member) == {
        "status": "refused",
        "reason": "not_owner",
    }
    started = start_normal_wave(database, room, member)
    assert started["wave"] == 31
    assert started["minimumSeconds"] == CATALOGUE.waves.minimum_seconds
    assert started["initialSnapshot"]["structures"] == []
    assert started["initialSnapshot"]["createWave"]["defenses"] == []
    assert len(started["initialSnapshot"]["participants"]) == active_members
    assert all(
        row["captain"]["weapon"] == "musket" for row in started["initialSnapshot"]["participants"]
    )
    assert money(database, treasury) == (0, 0, 0)
    assert reset(database, owner, treasury, code)["reason"] == "wave_running"
    # Preserve the actual configured minimum and server clock. Outcome itself is a fixture.
    limit = monotonic() + CATALOGUE.waves.minimum_seconds + 4
    while True:
        as_owner(database)
        if database.execute(
            "select clock_timestamp()>=starts_at+make_interval(secs=>minimum_seconds) "
            "from public.wave_runs where id=%s",
            (started["waveId"],),
        ).fetchone()[0]:
            break
        assert monotonic() < limit
        sleep(0.02)
    result = asyncio.run(
        shared_session_api.finish_wave(
            CanonicalAdmin(database),
            CATALOGUE,
            str(member),
            started["waveId"],
            str(owner),
            keys(treasury)[1],
            str(room["sessions"][member]),
            str(room["generations"][member]),
            {
                "survived": False,
                "shipsSunk": 0,
                "bonuses": [],
                "rescued": False,
                "checkpoint": None,
                "walls": None,
            },
        )
    )
    assert result["outcome"] == "lost", result
    assert money(database, treasury) == (0, 0, 0) and buildings(database, owner) == []
    assert database.execute(
        "select outcome,loot_coins from public.island_wave_closures where wave_id=%s",
        (started["waveId"],),
    ).fetchone() == ("lost", 0)
    assert database.execute(
        "select wave_best,next_wave from public.islands where player_id=%s", (owner,)
    ).fetchone() == (30, max(1, 30 - CATALOGUE.waves.restart_back))
    as_server(database)
    late_win = asyncio.run(
        shared_session_api.finish_wave(
            CanonicalAdmin(database),
            CATALOGUE,
            str(member),
            started["waveId"],
            str(owner),
            keys(treasury)[1],
            str(room["sessions"][member]),
            str(room["generations"][member]),
            {
                "survived": True,
                "shipsSunk": 0,
                "bonuses": [],
                "rescued": False,
                "checkpoint": None,
                "walls": None,
            },
        )
    )
    assert late_win["outcome"] == "lost" and late_win["repeat"] is True
    assert money(database, treasury) == (0, 0, 0)
    assert reset(database, owner, treasury, code, actor=member)["reason"] == "not_owner"
    personal = {actor: rpc(database, "personal_captain_read", actor) for actor in (owner, *actors)}
    wallets = {actor: balance(database, actor) for actor in (owner, *actors)}
    first = reset(database, owner, treasury, code)
    assert first["status"] == "done" and first["currentEconomy"] is None, first
    assert reset(database, owner, treasury, code)["receipt"] == first["receipt"]
    assert {actor: rpc(database, "personal_captain_read", actor) for actor in personal} == personal
    assert {actor: balance(database, actor) for actor in wallets} == wallets
    new_account = first["receipt"]["result"]["newAccountId"]
    as_owner(database)
    assert database.execute(
        "select balance_coins,committed_coins from public.island_economy_accounts where id=%s",
        (new_account,),
    ).fetchone() == (CATALOGUE.starting_coins, 0)
    assert database.execute(
        "select count(*) from public.island_treasury_transactions "
        "where account_id=%s and reason='starting_coins'",
        (new_account,),
    ).fetchone() == (1,)
    assert money(database, treasury) == (0, 0, 0)
    reconciles(database, new_account)


@pytest.mark.parametrize("reset_before_payout", [False, True])
def test_pending_original_wager_is_a_legitimate_zero_funds_source_not_a_new_run_grant(
    database,
    reset_before_payout,
):
    prepared, _, pending = demolished_loss(database, pending=True, ship_ready=False)
    owner, member, _, treasury, code = prepared
    assert buildings(database, owner) == [] and money(database, treasury) == (10, 10, 0)
    replacement = reset(database, owner, treasury, code) if reset_before_payout else None
    make_due(database, pending)
    as_server(database)
    paid = settlement(database, pending, price="101")
    assert paid["settlement"]["returnedPayout"] == "20"
    assert paid["receipt"]["origin"]["accountId"] == keys(treasury)[0]
    assert settlement(database, pending)["receipt"] == paid["receipt"]
    assert money(database, treasury) == (20, 0, 20)
    if replacement:
        account = replacement["receipt"]["result"]["newAccountId"]
        as_owner(database)
        assert database.execute(
            "select balance_coins,committed_coins from public.island_economy_accounts where id=%s",
            (account,),
        ).fetchone() == (CATALOGUE.starting_coins, 0)
        assert paid["currentEconomy"] is None
        reconciles(database, account)
    else:
        rebuilt = construct(database, member, treasury, intent(coins="10"))
        assert rebuilt["status"] == "done" and money(database, treasury) == (10, 0, 10)


def test_ship_improvements_fund_rebuilding_without_entry_charge_or_player_multiplier(
    database,
):
    prepared, _, _ = demolished_loss(database)
    owner, member, _, treasury, _ = prepared
    as_server(database)
    opened = start(database, member, owner, treasury)
    assert opened["status"] == "started" and money(database, treasury) == (0, 0, 0)
    as_server(database)
    paid = claim(database, member, opened, 1)
    assert paid["receipt"]["result"]["coins"] == "12"
    built = construct(database, member, treasury, intent(coins="10"))
    assert built["status"] == "done" and money(database, treasury) == (2, 0, 2)
    as_server(database)
    improved = start(database, member, owner, treasury, uid="zero-ship-start2")
    second = claim(database, member, improved, 3, uid="zero-ship-claim2")
    assert second["receipt"]["result"]["coins"] == "24"
    assert money(database, treasury) == (26, 0, 26)
    as_server(database)
    repeated = start(database, owner, owner, treasury, uid="zero-ship-start3")
    assert (
        claim(database, owner, repeated, 3, uid="zero-ship-claim3")["receipt"]["result"]["coins"]
        == "0"
    )
    assert money(database, treasury) == (26, 0, 26)


@pytest.mark.parametrize("wave,wreck,reason", [(29, 500, "locked"), (30, 499, "not_repaired")])
def test_zero_funds_never_waive_ship_unlock_or_wreck_requirements(database, wave, wreck, reason):
    prepared, _, _ = demolished_loss(database)
    owner, member, _, treasury, _ = prepared
    as_owner(database)
    database.execute(
        "update public.islands set wave_best=%s,wreck_paid=%s where player_id=%s",
        (wave, wreck, owner),
    )
    as_server(database)
    assert start(database, member, owner, treasury)["reason"] == reason
    assert money(database, treasury) == (0, 0, 0)
