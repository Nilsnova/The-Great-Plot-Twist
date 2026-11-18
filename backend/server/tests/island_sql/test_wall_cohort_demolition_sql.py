"""Perimeter refund boundaries and current permission before immutable demolition replay."""

import json

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_demolish_sql import (  # noqa: E402
    MEMBER,
    OTHER,
    OWNER,
    STRANGER,
    demolish,
    game,
    quote,
    split,
    standing,
    upgrade,
)
from server.tests.island_sql.test_game_rooms_sql import join, leave  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_server,
    balance,
    call,
    ledger,
)
from server.tests.island_sql.test_tower_defense_sql import coop_build  # noqa: E402


def added_piece(database, spot, uid):
    """Seed one paid positioned piece; the construction RPC is verified separately."""
    as_server(database)
    database.execute(
        "insert into public.islets (player_id,timber) values (%s,0) on conflict do nothing",
        (OWNER,),
    )
    database.execute(
        "insert into public.island_wall_policy (island_owner,rule_version,capacity) "
        "values (%s,1,128) on conflict do nothing",
        (OWNER,),
    )
    database.execute(
        "insert into public.island_layout (island_owner,plot,x_half,z_half) values (%s,%s,-20,-10)",
        (OWNER, spot),
    )
    marker = {"owner": str(OWNER), "payer": str(MEMBER), "actionUid": uid, "plots": [spot]}
    call(database, "select set_config('app.positioned_wall_build',%s,true)", json.dumps(marker))
    ref = f"island:{uid}:{spot}"
    call(
        database,
        "select public.apply_wallet_transaction(%s,-10,'building_purchase',%s)",
        MEMBER,
        ref,
    )
    database.execute(
        "insert into public.islet_buildings "
        "(player_id,plot,building_type,level,coins_paid,timber_paid,ref) "
        "values (%s,%s,'wall',1,10,0,%s)",
        (OWNER, spot, ref),
    )
    database.execute(
        "insert into public.building_payments "
        "(island_owner,plot,building_ref,level,payer,coins,ref) values (%s,%s,%s,1,%s,10,%s)",
        (OWNER, spot, ref, MEMBER, ref),
    )
    call(database, "select set_config('app.positioned_wall_build','',true)")
    return call(
        database,
        "select recovery_instance_id from public.islet_buildings where player_id=%s and plot=%s",
        OWNER,
        spot,
    )


@pytest.mark.parametrize("spot", ["wall_13", "wall_128"])
def test_boundary_piece_refunds_its_payers_and_retry_leaves_rebuilt_instance(database, spot):
    game(database)
    original = added_piece(database, spot, "wall-refund-001")
    assert upgrade(database, OWNER, spot, "wall-upgrade-001", kind="wall")["level"] == 2
    before = {p: balance(database, p) for p in (OWNER, MEMBER, OTHER)}
    assert split(quote(database, OTHER, spot)) == {MEMBER: 5, OWNER: 10}
    done = demolish(database, OTHER, spot, "wall-demolish-001")
    assert done["status"] == "done" and split(done) == {MEMBER: 5, OWNER: 10}
    assert balance(database, MEMBER) == before[MEMBER] + 5
    assert balance(database, OWNER) == before[OWNER] + 10
    assert balance(database, OTHER) == before[OTHER]
    assert (
        call(
            database,
            "select count(*) from public.island_layout where island_owner=%s and plot=%s",
            OWNER,
            spot,
        )
        == 0
    )
    replacement = added_piece(database, spot, "wall-refund-002")
    assert replacement != original
    paid = {p: balance(database, p) for p in (OWNER, MEMBER)}
    retry = demolish(database, OTHER, spot, "wall-demolish-001")
    assert retry["repeat"] is True and split(retry) == split(done)
    assert standing(database, spot) == ("wall", 1, None)
    assert {p: balance(database, p) for p in paid} == paid


def test_old_receipt_needs_current_membership_and_matching_island_and_plot(database):
    game(database)
    coop_build(database, MEMBER, OWNER, "wall_1", "wall", "private-build-001", 10)
    assert demolish(database, MEMBER, "wall_1", "private-tear-001")["status"] == "done"
    paid = balance(database, MEMBER)
    leave(database, MEMBER, OWNER)
    assert demolish(database, MEMBER, "wall_1", "private-tear-001") == {
        "status": "refused",
        "reason": "not_member",
    }
    join(database, MEMBER, OWNER)
    assert demolish(database, MEMBER, "wall_2", "private-tear-001") == {
        "status": "refused",
        "reason": "action_uid_conflict",
    }
    join(database, MEMBER, STRANGER)
    assert demolish(database, MEMBER, "wall_1", "private-tear-001", owner=STRANGER) == {
        "status": "refused",
        "reason": "action_uid_conflict",
    }
    assert balance(database, MEMBER) == paid
    assert ledger(database, MEMBER, "building_refund") == [(5, "demolish:private-tear-001")]


@pytest.mark.parametrize("spot", ["wall_01", "wall_129"])
def test_noncanonical_wall_is_not_demolishable_inventory(database, spot):
    game(database)
    assert quote(database, OWNER, spot) == {"status": "refused", "reason": "protected"}
