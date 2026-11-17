"""Real WALL-19 identity, authority and coordinate-lifecycle checks on private scratch SQL.

Requires the WALL-01 policy migration followed by the cohort migration. The shared fixture
applies the complete migration chain twice; each test rolls its own transaction back.
"""

import json
from uuid import UUID, uuid4

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
)

OWNER = UUID(int=19101)
OTHER = UUID(int=19102)
UID = "positioned-0001"


def ready(database, *, admitted=True):
    add_players(database, OWNER, OTHER)
    open_island(database, OWNER, "WAC29")
    as_server(database)
    database.execute(
        "insert into public.islets (player_id,timber) values (%s,0) on conflict do nothing",
        (OWNER,),
    )
    if admitted:
        database.execute(
            "insert into public.island_wall_policy (island_owner,rule_version,capacity) "
            "values (%s,1,128)",
            (OWNER,),
        )


def coordinate(database, plot):
    database.execute(
        "insert into public.island_layout (island_owner,plot,x_half,z_half) values (%s,%s,-20,-10)",
        (OWNER, plot),
    )


def context(database, **overrides):
    value = {"owner": str(OWNER), "payer": str(OWNER), "actionUid": UID, "plots": ["wall_13"]}
    value.update(overrides)
    call(database, "select set_config('app.positioned_wall_build',%s,true)", json.dumps(value))


def insert(database, plot, kind="wall", ref=None):
    database.execute(
        "insert into public.islet_buildings "
        "(player_id,plot,building_type,level,coins_paid,timber_paid,ref) "
        "values (%s,%s,%s,1,10,0,%s)",
        (OWNER, plot, kind, ref or f"island:{UID}:{plot}"),
    )


@pytest.mark.parametrize("number", range(1, 129))
def test_canonical_identity_admits_every_selected_wall(database, number):
    as_server(database)
    assert call(database, "select public.island_wall_number(%s)", f"wall_{number}") == number


@pytest.mark.parametrize(
    "name",
    [
        None,
        "wall_0",
        "wall_01",
        "wall_001",
        "wall_129",
        "wall_999",
        "wall_1000",
        "wall_-1",
        "wall_1x",
        "WALL_1",
    ],
)
def test_noncanonical_identity_is_not_an_alias(database, name):
    as_server(database)
    assert call(database, "select public.island_wall_number(%s)", name) is None


def test_legacy_pairs_and_all_d060_tower_kinds_are_preserved(database):
    ready(database, admitted=False)
    pairs = [
        ("plot_2", "workshop"),
        ("plot_3", "windmill"),
        ("plot_4", "greenhouse"),
        ("islet_signal_station", "signal_station"),
        ("tower_1", "watchtower"),
        ("house_1", "house"),
        ("house_2", "house"),
    ]
    pairs += [(f"wall_{n}", "wall") for n in range(1, 13)]
    pairs += [
        (f"cannon_{n}", kind)
        for n in range(1, 12)
        for kind in ("cannon", "mortar", "harpoon", "culverin", "swivel")
    ]
    for plot, kind in pairs:
        with database.transaction(force_rollback=True):
            insert(database, plot, kind)


@pytest.mark.parametrize(
    "plot,kind",
    [
        ("wall_129", "wall"),
        ("wall_01", "wall"),
        ("wall_1", "cannon"),
        ("cannon_12", "cannon"),
        ("cannon_11", "wall"),
        ("house_1", "watchtower"),
    ],
)
def test_wrong_building_pairs_still_fail(database, plot, kind):
    ready(database)
    with pytest.raises(psycopg.errors.CheckViolation), database.transaction():
        insert(database, plot, kind)


@pytest.mark.parametrize("plot", ["wall_13", "wall_128", "cannon_11"])
def test_layout_and_health_can_represent_the_boundary_ids(database, plot):
    ready(database)
    coordinate(database, plot)
    database.execute(
        "insert into public.island_structure_health "
        "(island_owner,spot,instance_id,building_kind,level,hp_units,max_hp,config_version,"
        "settled_at,rate_numerator,rate_denominator) "
        "values (%s,%s,%s,%s,1,1000000,60,1,clock_timestamp(),1,1)",
        (OWNER, plot, uuid4(), "wall" if plot.startswith("wall_") else "cannon"),
    )


@pytest.mark.parametrize("plot", ["wall_129", "wall_01", "cannon_12", "tower_1", "cabin"])
def test_health_rejects_unknown_or_non_health_ids(database, plot):
    ready(database)
    with pytest.raises(psycopg.errors.CheckViolation), database.transaction():
        database.execute(
            "insert into public.island_structure_health "
            "(island_owner,spot,instance_id,building_kind,level,hp_units,max_hp,config_version,"
            "settled_at,rate_numerator,rate_denominator) "
            "values (%s,%s,%s,'wall',1,1000000,60,1,clock_timestamp(),1,1)",
            (OWNER, plot, uuid4()),
        )


@pytest.mark.parametrize(
    "overrides",
    [
        {"owner": str(OTHER)},
        {"payer": "not-a-uuid"},
        {"actionUid": "short"},
        {"plots": ["wall_14"]},
        {"plots": "wall_13"},
        {"actionUid": "x" * 65},
    ],
)
def test_new_build_rejects_mismatched_authority(database, overrides):
    ready(database)
    coordinate(database, "wall_13")
    context(database, **overrides)
    with pytest.raises(psycopg.errors.CheckViolation, match="positioned_wall_build_required"):
        with database.transaction():
            insert(database, "wall_13")


@pytest.mark.parametrize("admitted,positioned", [(False, True), (True, False)])
def test_marker_does_not_replace_policy_or_position(database, admitted, positioned):
    ready(database, admitted=admitted)
    if positioned:
        coordinate(database, "wall_13")
    context(database)
    with pytest.raises(psycopg.errors.CheckViolation), database.transaction():
        insert(database, "wall_13")


@pytest.mark.parametrize("setting", [None, "broken json", "[]", "null"])
def test_old_build_cannot_spend_for_an_inventory_id(database, setting):
    ready(database)
    coordinate(database, "wall_13")
    if setting is not None:
        call(database, "select set_config('app.positioned_wall_build',%s,true)", setting)
    before = balance(database, OWNER)
    with pytest.raises(psycopg.errors.CheckViolation), database.transaction():
        call(
            database, "select public.island_build(%s,%s,'wall_13','wall',%s,10)", OWNER, OWNER, UID
        )
    assert balance(database, OWNER) == before
    assert ledger(database, OWNER, "building_purchase") == []
    assert (
        call(database, "select count(*) from public.islet_buildings where player_id=%s", OWNER) == 0
    )


def test_positioned_batch_context_pairs_each_piece_and_releases_only_new_sites(database):
    ready(database)
    plots = ["wall_12", "wall_13", "wall_128"]
    context(database, plots=plots)
    for plot in plots:
        coordinate(database, plot)
        insert(database, plot)
    with pytest.raises(psycopg.errors.CheckViolation), database.transaction():
        coordinate(database, "wall_14")
        insert(database, "wall_14", ref=f"island:{UID}:wall_13")
    database.execute("delete from public.islet_buildings where player_id=%s", (OWNER,))
    assert database.execute(
        "select plot from public.island_layout where island_owner=%s order by plot", (OWNER,)
    ).fetchall() == [("wall_12",)]


def test_browser_roles_cannot_write_tables_or_set_build_authority_through_helpers(database):
    as_owner(database)
    for role in ("anon", "authenticated"):
        assert database.execute(
            "select has_table_privilege(%s,'public.islet_buildings','insert'), "
            "has_table_privilege(%s,'public.island_layout','insert'), "
            "has_function_privilege(%s,'public.island_inventory_wall_build_guard()','execute')",
            (role,) * 3,
        ).fetchone() == (False, False, False)


def contribution(database, ref, *, plot="wall_128", building_ref=None, level=1):
    database.execute(
        "insert into public.building_payments "
        "(island_owner,plot,building_ref,level,payer,coins,ref) values (%s,%s,%s,%s,%s,10,%s)",
        (OWNER, plot, ref if building_ref is None else building_ref, level, OWNER, ref),
    )


@pytest.mark.parametrize(
    "ref",
    [
        "island:legacy01",
        "upgrade:legacy01",
        "island:" + "x" * 64,
        "island:" + "x" * 64 + ":wall_128",
    ],
)
def test_contribution_refs_keep_legacy_and_maximum_positioned_uid(database, ref):
    ready(database)
    if ":wall_" in ref:
        coordinate(database, "wall_128")
        context(database, actionUid="x" * 64, plots=["wall_128"])
        insert(database, "wall_128", ref=ref)
        call(
            database,
            "select public.apply_wallet_transaction(%s,-10,'building_purchase',%s)",
            OWNER,
            ref,
        )
    contribution(database, ref)
    assert len(ref) <= 120


@pytest.mark.parametrize(
    "ref",
    [
        "island:short01:wall_128",
        "island:" + "x" * 65 + ":wall_128",
        "island:piece001:wall_012",
        "island:piece001:wall_129",
        "island:piece001:cannon_1",
        "island:piece001:wall_128:extra",
        "upgrade:piece001:wall_128",
    ],
)
def test_contribution_ref_cannot_expand_the_namespace_or_uid_bounds(database, ref):
    ready(database)
    with pytest.raises(psycopg.errors.CheckViolation), database.transaction():
        contribution(database, ref)


@pytest.mark.parametrize(
    "change", [{"plot": "wall_13"}, {"building_ref": "island:other001"}, {"level": 2}]
)
def test_positioned_contribution_ref_must_pair_with_its_exact_level_one_piece(database, change):
    ready(database)
    with pytest.raises(psycopg.errors.CheckViolation), database.transaction():
        contribution(database, "island:piece001:wall_128", **change)
