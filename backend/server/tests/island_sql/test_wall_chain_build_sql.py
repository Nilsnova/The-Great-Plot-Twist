"""Actual atomic wall payments/receipts on private Unix-socket PostgreSQL, never live state."""

import json
from uuid import UUID

import pytest

psycopg = pytest.importorskip("psycopg")
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    add_players,
    as_owner,
    as_server,
    balance,
    call,
    ledger,
    open_island,
    start,
)

OWNER, PAYER, OTHER = (UUID(int=n) for n in (12501, 12502, 12503))
UID = "wall-chain-0001"
EPOCH = UUID(int=12504)
ITEMS = [
    {"spot": "wall_13", "x_half": -20, "z_half": 32, "price": 10},
    {"spot": "wall_14", "x_half": -16, "z_half": 32, "price": 10},
]
INTENT = {
    "placements": [{"spot": "wall_13", "x": -10, "z": 16}, {"spot": "wall_14", "x": -8, "z": 16}],
    "quotedTotal": 20,
    "islandEpoch": str(EPOCH),
}


def ready(db, member=False):
    add_players(db, OWNER, PAYER, OTHER)
    open_island(db, OWNER, "CHN29")
    open_island(db, PAYER, "PAY29")
    open_island(db, OTHER, "QTH29")
    as_server(db)
    db.execute("insert into public.island_wall_policy values(%s,1,128)", (OWNER,))
    db.execute(
        "insert into public.island_recovery_state(island_owner,reset_epoch) values(%s,%s) "
        "on conflict(island_owner) do update set reset_epoch=excluded.reset_epoch",
        (OWNER, EPOCH),
    )
    if member:
        db.execute(
            "insert into public.island_members(island_owner,player_id,role) values(%s,%s,'member')",
            (OWNER, PAYER),
        )


def rows(db):
    return call(db, "select public.island_wall_layout_read(%s)", OWNER)["rows"]


def build(db, *, actor=OWNER, uid=UID, intent=None, items=None, seen=None, role=None):
    return call(
        db,
        "select public.island_wall_build(%s,%s,%s,%s::jsonb,%s::jsonb,%s::jsonb,%s,0)",
        actor,
        OWNER,
        uid,
        json.dumps(INTENT if intent is None else intent),
        json.dumps(ITEMS if items is None else items),
        json.dumps(rows(db) if seen is None else seen),
        role,
    )


def receipt(db, *, actor=OWNER, owner=OWNER, intent=None):
    return call(
        db,
        "select public.island_wall_build_receipt(%s,%s,%s,%s::jsonb)",
        actor,
        owner,
        UID,
        json.dumps(INTENT if intent is None else intent),
    )


def test_complete_run_has_distinct_paid_instances_positions_and_one_receipt(database):
    ready(database)
    result = build(database)
    assert result["status"] == "done" and result["receipt"]["repeat"] is False
    assert result["receipt"]["placements"] == INTENT["placements"]
    assert result["receipt"]["totalCost"] == 20 and balance(database, OWNER) == 80
    records = database.execute(
        "select plot,ref,recovery_instance_id from public.islet_buildings "
        "where player_id=%s order by plot",
        (OWNER,),
    ).fetchall()
    assert [r[1] for r in records] == [f"island:{UID}:wall_13", f"island:{UID}:wall_14"]
    assert len({r[2] for r in records}) == 2 and len(rows(database)) == 2
    assert (
        call(database, "select count(*) from public.building_payments where island_owner=%s", OWNER)
        == 2
    )
    assert (
        call(
            database, "select count(*) from public.island_wall_build_receipts where payer=%s", OWNER
        )
        == 1
    )
    assert (
        call(database, "select coalesce(current_setting('app.positioned_wall_build',true),'')")
        == ""
    )


def test_lost_reply_repeats_original_intent_before_stale_layout_or_eligibility(database):
    ready(database)
    first = build(database, seen=[])
    again = build(database, seen=[])
    assert again["receipt"] == {**first["receipt"], "repeat": True}
    assert balance(database, OWNER) == 80 and len(ledger(database, OWNER, "building_purchase")) == 2
    assert receipt(database)["receipt"] == again["receipt"]
    assert receipt(database, intent={**INTENT, "quotedTotal": 19}) == {
        "status": "refused",
        "reason": "action_uid_conflict",
    }


def test_current_membership_precedes_cached_receipt_and_other_island_lookup(database):
    ready(database, member=True)
    build(database, actor=PAYER)
    database.execute(
        "update public.island_members set left_at=now() where island_owner=%s and player_id=%s",
        (OWNER, PAYER),
    )
    assert receipt(database, actor=PAYER) == {"status": "refused", "reason": "not_member"}
    assert receipt(database, actor=PAYER, owner=OTHER) == {
        "status": "refused",
        "reason": "not_member",
    }
    assert balance(database, PAYER) == 80


@pytest.mark.parametrize(
    "case,reason",
    [
        ("stale", "busy"),
        ("funds", "insufficient_funds"),
        ("role", "quote_changed"),
        ("price", "quote_changed"),
        ("wave", "wave_running"),
    ],
)
def test_refusal_cannot_partially_charge_or_create_a_run(database, case, reason):
    ready(database)
    seen = rows(database)
    intent = INTENT
    if case == "stale":
        call(
            database,
            "select public.island_move(%s,%s,'cannon_1',-20,-20,'[]'::jsonb)",
            OWNER,
            OWNER,
        )
    if case == "funds":
        as_owner(database)
        database.execute("update public.wallets set balance=5 where player_id=%s", (OWNER,))
        as_server(database)
    if case == "role":
        database.execute(
            "update public.islands set captain_role='engineer' where player_id=%s", (OWNER,)
        )
    if case == "price":
        intent = {**INTENT, "quotedTotal": 19}
    if case == "wave":
        start(database, OWNER, "wall-bell-01", owner=OWNER)
    before = balance(database, OWNER)
    result = build(database, seen=seen, intent=intent)
    assert result["status"] == "refused" and result["reason"] == reason
    assert balance(database, OWNER) == before
    assert (
        call(database, "select count(*) from public.islet_buildings where player_id=%s", OWNER) == 0
    )
    assert receipt(database)["status"] == "missing"


def test_old_receipt_does_not_reconstruct_a_demolished_or_reset_instance(database):
    ready(database)
    old = build(database)["receipt"]
    as_owner(database)
    database.execute("delete from public.islet_buildings where player_id=%s", (OWNER,))
    database.execute(
        "update public.island_recovery_state set reset_epoch=gen_random_uuid() "
        "where island_owner=%s",
        (OWNER,),
    )
    as_server(database)
    assert build(database)["receipt"] == {**old, "repeat": True}
    assert (
        call(database, "select count(*) from public.islet_buildings where player_id=%s", OWNER) == 0
    )
    assert rows(database) == [] and balance(database, OWNER) == 80


def test_mid_run_database_failure_rolls_back_first_piece_and_its_payment(database):
    ready(database)
    as_owner(database)
    database.execute(
        "create function pg_temp.fail_second_wall() returns trigger language plpgsql "
        "as $$ begin if new.plot='wall_14' then "
        "raise check_violation using message='test_second_piece'; "
        "end if; return new; end $$"
    )
    database.execute(
        "create trigger test_second_wall before insert on public.islet_buildings "
        "for each row execute function pg_temp.fail_second_wall()"
    )
    as_server(database)
    with (
        pytest.raises(psycopg.errors.CheckViolation, match="test_second_piece"),
        database.transaction(),
    ):
        build(database)
    assert balance(database, OWNER) == 100 and rows(database) == []
    assert ledger(database, OWNER, "building_purchase") == []
    assert receipt(database)["status"] == "missing"


def test_receipts_and_transaction_cannot_be_called_or_mutated_by_browser_roles(database):
    as_owner(database)
    for role in ("anon", "authenticated"):
        assert database.execute(
            "select has_table_privilege(%s,'public.island_wall_build_receipts','select'),"
            "has_function_privilege(%s,'public.island_wall_build(uuid,uuid,text,jsonb,jsonb,jsonb,text,integer)',"
            "'execute')",
            (role, role),
        ).fetchone() == (False, False)
    assert database.execute(
        "select has_table_privilege('service_role','public.island_wall_build_receipts','update')"
    ).fetchone() == (False,)


def test_a_pre_reset_uncommitted_quote_cannot_spend_in_an_identical_new_run(database):
    ready(database)
    assert rows(database) == []
    database.execute(
        "update public.island_recovery_state set reset_epoch=gen_random_uuid() "
        "where island_owner=%s",
        (OWNER,),
    )
    assert build(database) == {"status": "refused", "reason": "quote_changed"}
    assert balance(database, OWNER) == 100 and rows(database) == []
    assert receipt(database)["status"] == "missing"
