"""Atomic shared progression and request races on disposable full-chain PostgreSQL.

All migrations run twice. No configured database, credentials or live data are used.
"""

from pathlib import Path
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island  # noqa: E402
from server.island.economy_progression import catalogue_rule, parse_intent, read_result  # noqa: E402
from server.island.economy_progression_models import ProgressionSnapshot  # noqa: E402
from server.tests.case_sql import conftest as postgres_fixture  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    keys,
    money,
    race,
    ready,
    reconciles,
    reserve,
    rpc,
)
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_owner,
    as_server,
    balance,
)
from server.tests.test_economy_progression import research  # noqa: E402

CATALOGUE = load_island()


@pytest.fixture
def progression_race(scratch_server, tmp_path):
    """Commit real concurrent requests without leaking rows into other migration tests."""
    pgserver = pytest.importorskip("pgserver")
    assert psycopg.conninfo.conninfo_to_dict(scratch_server.get_uri())["host"].startswith("/")
    with pgserver.get_server(tmp_path / "progression-pg", cleanup_mode="delete") as server:
        with psycopg.connect(server.get_uri(), autocommit=True) as connection:
            connection.execute(Path(postgres_fixture.__file__).with_name("stub.sql").read_text())
            for _ in range(2):
                for migration in sorted(postgres_fixture.MIGRATIONS.glob("*.sql")):
                    connection.execute(migration.read_text())
        with psycopg.connect(server.get_uri()) as connection:
            yield connection, server


def setup(connection, coins=10000, *, wave=50, admitted=True):
    owner, member, outsider, initial = ready(connection, coins, admitted=admitted)
    as_owner(connection)
    connection.execute("update public.islands set wave_best=%s where player_id=%s", (wave, owner))
    connection.execute(
        "insert into public.island_recovery_state(island_owner) values(%s) on conflict do nothing",
        (owner,),
    )
    connection.execute(
        "insert into public.islets(player_id,timber) values(%s,0) on conflict do nothing", (owner,)
    )
    as_server(connection)
    return owner, member, outsider, initial


def mutate(connection, actor, initial, uid, intent, *, rule=None):
    result = rpc(
        connection,
        "island_economy_progression",
        actor,
        *keys(initial),
        uid,
        Jsonb(intent),
        Jsonb(rule if rule is not None else catalogue_rule(CATALOGUE, parse_intent(intent))),
    )
    if result["status"] == "done":
        read_result(result)
    return result


def research_state(connection, owner, branch="cannon"):
    row = connection.execute(
        "select tier,choice_2,choice_3,economy_revision from public.island_research "
        "where island_owner=%s and branch=%s",
        (owner, branch),
    ).fetchone()
    return (
        dict(zip(("tier", "choice2", "choice3", "revision"), (*row[:3], str(row[3])), strict=True))
        if row
        else {"tier": 0, "choice2": None, "choice3": None, "revision": "0"}
    )


def research_step(connection, actor, owner, initial, uid, tier=1, choice=None, change=False):
    intent = research(
        tier=tier,
        choice=choice,
        change=change,
        expected=research_state(connection, owner),
        quotedCoins=str(CATALOGUE.research[0].price_of(tier)),
    )
    return mutate(connection, actor, initial, uid, intent), intent


def add_building(connection, owner, kind="cannon", level=5, spot="cannon_1", spec=None):
    as_owner(connection)
    connection.execute(
        "insert into public.islet_buildings"
        "(player_id,plot,building_type,level,coins_paid,timber_paid,ref,spec) "
        "values(%s,%s,%s,%s,100,0,'fixture',%s)",
        (owner, spot, kind, level, spec),
    )
    as_server(connection)
    return building_state(connection, owner, spot)


def building_state(connection, owner, spot="cannon_1"):
    row = connection.execute(
        "select recovery_instance_id,building_type,level,spec,tree_a,tree_b,"
        "economy_upgrade_revision "
        "from public.islet_buildings where player_id=%s and plot=%s",
        (owner, spot),
    ).fetchone()
    return dict(
        zip(
            ("instanceId", "kind", "level", "spec", "treeA", "treeB", "revision"),
            (str(row[0]), *row[1:6], str(row[6])),
            strict=True,
        )
    )


def skill(expected, spec="rapid", spot="cannon_1"):
    intent = {
        "action": "specialise",
        "spot": spot,
        "spec": spec,
        "expected": expected,
        "quotedCoins": "0",
    }
    intent["quotedCoins"] = catalogue_rule(CATALOGUE, parse_intent(intent))["price"]
    return intent


def tree(expected, path="a", tier=1):
    intent = {
        "action": "tower_tree",
        "spot": "cannon_1",
        "path": path,
        "tier": tier,
        "expected": expected,
        "quotedCoins": "0",
    }
    intent["quotedCoins"] = catalogue_rule(CATALOGUE, parse_intent(intent))["price"]
    return intent


def count_claims(connection, actor, uid):
    return connection.execute(
        "select count(*) from public.island_economy_operations where actor_id=%s and action_uid=%s",
        (actor, uid),
    ).fetchone()[0]


def test_invited_member_research_and_capstone_switch_are_shared_atomic_and_repeat_safe(database):
    owner, member, _, initial = setup(database)
    first, _ = research_step(database, member, owner, initial, "research01")
    assert first["receipt"]["result"]["research"]["revision"] == "1"
    research_step(database, member, owner, initial, "research02", 2, "rapid_2")
    research_step(database, member, owner, initial, "research03", 3, "broadside")
    add_building(database, owner, spec="broadside")
    switched, intent = research_step(
        database, member, owner, initial, "switch001", 3, "grapeshot", True
    )
    assert switched["receipt"]["result"]["research"]["choice3"] == "grapeshot"
    assert building_state(database, owner)["spec"] is None
    assert building_state(database, owner)["revision"] == "1"
    retry = mutate(database, member, initial, "switch001", intent, rule={})
    assert retry["repeat"] is True and retry["receipt"] == switched["receipt"]
    assert money(retry) == money(switched)
    assert balance(database, member) == 0 and balance(database, owner) == 100
    reconciles(database, keys(initial)[0])


def test_obsolete_research_choice_and_aba_revision_never_charge_again(database):
    owner, member, _, initial = setup(database)
    research_step(database, member, owner, initial, "research01")
    research_step(database, member, owner, initial, "research02", 2, "rapid_2")
    switched, old_intent = research_step(
        database, member, owner, initial, "switch001", 2, "long_guns", True
    )
    research_step(database, owner, owner, initial, "switch002", 2, "rapid_2", True)
    before = rpc(database, "island_economy_context", owner)["economy"]
    assert mutate(database, member, initial, "stale0001", old_intent) == {
        "status": "refused",
        "reason": "stale_progression_quote",
    }
    assert count_claims(database, member, "stale0001") == 0
    assert rpc(database, "island_economy_context", owner)["economy"] == before
    assert (
        mutate(database, member, initial, "switch001", old_intent)["receipt"] == switched["receipt"]
    )


def test_free_house_role_and_paid_skill_share_immutable_global_action_identity(database):
    owner, member, _, initial = setup(database)
    expected = add_building(database, owner, kind="house", level=2, spot="house_1")
    intent = skill(expected, "workshop", "house_1")
    first = mutate(database, member, initial, "freeuid01", intent)
    assert first["receipt"]["result"]["chargedCoins"] == "0"
    assert first["receipt"]["result"]["treasuryReceiptId"] is None
    assert count_claims(database, member, "freeuid01") == 1
    assert mutate(database, member, initial, "freeuid01", intent)["receipt"] == first["receipt"]
    other = {"action": "wreck", "amount": 25, "quotedCoins": "25"}
    assert mutate(database, member, initial, "freeuid01", other) == {
        "status": "refused",
        "reason": "action_conflict",
    }
    raw = rpc(
        database,
        "island_treasury_spend",
        member,
        *keys(initial),
        "freeuid01",
        "building_purchase",
        "other:1",
        1,
    )
    assert raw == {"status": "refused", "reason": "action_conflict"}
    assert (
        money(
            rpc(
                database,
                "island_treasury_spend",
                member,
                *keys(initial),
                "rawpaid01",
                "building_purchase",
                "other:2",
                1,
            )
        )[0]
        == 9999
    )
    assert mutate(database, member, initial, "rawpaid01", other) == {
        "status": "refused",
        "reason": "action_conflict",
    }


def test_tower_tree_prerequisites_instance_fence_and_skill_noop(database):
    owner, member, _, initial = setup(database)
    research_step(database, member, owner, initial, "research01")
    expected = add_building(database, owner)
    first = mutate(database, member, initial, "skill0001", skill(expected))
    current = building_state(database, owner)
    noop = mutate(database, member, initial, "skill0002", skill(current))
    assert noop["receipt"]["result"]["chargedCoins"] == "0"
    assert money(noop) == money(first)
    stale = mutate(database, member, initial, "treeold01", tree(expected))
    assert stale == {"status": "refused", "reason": "stale_progression_quote"}
    step = mutate(database, member, initial, "tree0001", tree(building_state(database, owner)))
    assert step["receipt"]["result"]["building"]["treeA"] == 1
    assert mutate(
        database, member, initial, "tree0003", tree(building_state(database, owner), tier=3)
    ) == {"status": "refused", "reason": "needs_tier"}
    mutate(database, member, initial, "tree0002", tree(building_state(database, owner), tier=2))
    mutate(database, member, initial, "treeb001", tree(building_state(database, owner), path="b"))
    assert mutate(
        database,
        member,
        initial,
        "treeb002",
        tree(building_state(database, owner), path="b", tier=2),
    ) == {"status": "refused", "reason": "closed"}
    as_owner(database)
    database.execute(
        "update public.islet_buildings set recovery_instance_id=%s "
        "where player_id=%s and plot='cannon_1'",
        (uuid4(), owner),
    )
    as_server(database)
    assert (
        mutate(database, member, initial, "skill0001", skill(expected))["receipt"]
        == first["receipt"]
    )
    assert (
        count_claims(database, member, "treeold01")
        == count_claims(database, member, "tree0003")
        == 0
    )
    reconciles(database, keys(initial)[0])


def test_concurrent_wreck_gifts_charge_only_exact_remaining_and_retry_without_charge(
    progression_race,
):
    database, scratch_server = progression_race
    owner, member, _, initial = setup(database)
    as_owner(database)
    database.execute("update public.islands set wreck_paid=350 where player_id=%s", (owner,))
    as_server(database)
    database.commit()
    intent = {"action": "wreck", "amount": 100, "quotedCoins": "100"}
    results = race(
        scratch_server,
        [
            lambda connection: mutate(connection, member, initial, "wreck001", intent),
            lambda connection: mutate(connection, owner, initial, "wreck002", intent),
        ],
    )
    assert sorted(result["receipt"]["result"]["chargedCoins"] for result in results) == [
        "100",
        "50",
    ]
    assert (
        database.execute(
            "select wreck_paid from public.islands where player_id=%s", (owner,)
        ).fetchone()[0]
        == 500
    )
    for actor, uid, original in zip(
        (member, owner), ("wreck001", "wreck002"), results, strict=True
    ):
        assert mutate(database, actor, initial, uid, intent)["receipt"] == original["receipt"]
    assert mutate(database, member, initial, "wreck003", intent) == {
        "status": "refused",
        "reason": "repaired",
    }
    assert (
        rpc(database, "island_economy_context", owner)["economy"]["treasury"]["balanceCoins"]
        == "9850"
    )
    reconciles(database, keys(initial)[0])


def test_two_switches_with_one_expected_revision_commit_one_charge(progression_race):
    database, scratch_server = progression_race
    owner, member, _, initial = setup(database)
    research_step(database, member, owner, initial, "research01")
    research_step(database, member, owner, initial, "research02", 2, "rapid_2")
    intent = research(
        tier=2,
        choice="long_guns",
        change=True,
        expected=research_state(database, owner),
        quotedCoins="360",
    )
    database.commit()
    results = race(
        scratch_server,
        [
            lambda connection: mutate(connection, member, initial, "switch001", intent),
            lambda connection: mutate(connection, owner, initial, "switch002", intent),
        ],
    )
    assert sorted(result["status"] for result in results) == ["done", "refused"]
    assert (
        next(result for result in results if result["status"] == "refused")["reason"]
        == "stale_progression_quote"
    )
    assert research_state(database, owner)["revision"] == "3"


@pytest.mark.parametrize(
    "problem,reason",
    [
        ("funds", "insufficient_funds"),
        ("hold", "insufficient_funds"),
        ("member", "not_member"),
        ("epoch", "epoch_mismatch"),
        ("paused", "path_unavailable"),
        ("locked", "locked"),
        ("missing_recovery", "recovery_state_incomplete"),
    ],
)
def test_refused_research_has_no_claim_asset_or_charge(database, problem, reason):
    owner, member, outsider, initial = setup(
        database, 100 if problem == "funds" else 10000, wave=7 if problem == "locked" else 50
    )
    actor = outsider if problem == "member" else member
    if problem == "hold":
        reserve(database, member, initial, 10000)
    if problem in ("paused", "missing_recovery"):
        as_owner(database)
        if problem == "paused":
            database.execute(
                "update public.island_economy_state set admission_state='paused' "
                "where island_owner=%s",
                (owner,),
            )
        else:
            database.execute(
                "delete from public.island_recovery_state where island_owner=%s", (owner,)
            )
        as_server(database)
    if problem == "epoch":
        initial = {"currentEconomy": {**initial["currentEconomy"], "runEpoch": str(uuid4())}}
    assert mutate(database, actor, initial, "rejected1", research()) == {
        "status": "refused",
        "reason": reason,
    }
    assert research_state(database, owner)["tier"] == 0
    assert count_claims(database, actor, "rejected1") == 0


def test_late_asset_or_receipt_failure_rolls_back_claim_treasury_and_research(database):
    owner, member, _, initial = setup(database)
    as_owner(database)
    database.execute(
        "create function public.reject_progression_fixture() returns trigger "
        "language plpgsql as $$ "
        "begin raise check_violation; end; $$"
    )
    database.execute(
        "create trigger reject_progression_fixture before insert "
        "on public.island_progression_receipts "
        "for each row execute function public.reject_progression_fixture()"
    )
    as_server(database)
    assert mutate(database, member, initial, "latefail1", research()) == {
        "status": "refused",
        "reason": "invalid_progression",
    }
    assert research_state(database, owner)["tier"] == 0
    assert count_claims(database, member, "latefail1") == 0
    assert (
        rpc(database, "island_economy_context", owner)["economy"]["treasury"]["balanceCoins"]
        == "10000"
    )


def test_own_receipt_remains_repeatable_after_leaving_without_disclosing_live_treasury(database):
    owner, member, _, initial = setup(database)
    first, intent = research_step(database, member, owner, initial, "research01")
    rpc(database, "game_leave", member, owner)
    result = mutate(database, member, initial, "research01", intent)
    assert result["currentEconomy"] is None and result["receipt"] == first["receipt"]
    assert mutate(
        database,
        member,
        initial,
        "new00001",
        {"action": "wreck", "amount": 25, "quotedCoins": "25"},
    ) == {"status": "refused", "reason": "not_member"}


def test_shared_mode_guards_block_all_legacy_progression_before_private_payment(database):
    owner, member, _, initial = setup(database)
    before = balance(database, member)
    requests = [
        ("island_research", (member, owner, "cannon", "legacy001", 1, 0, 1, None, False)),
        ("island_specialise", (member, owner, "house_1", "house", "workshop", None, 0)),
        ("island_tower_tree", (member, owner, "cannon_1", "cannon", "a", 1, "legacy003", 1, 0, 1)),
        ("island_wreck_repair", (member, owner, 25, "legacy004", 500, 0)),
    ]
    for name, args in requests:
        assert rpc(database, name, *args) == {
            "status": "refused",
            "reason": "economy_context_required",
        }
    assert balance(database, member) == before
    assert money(initial) == (10000, 0, 10000)


def test_receipt_and_private_helpers_cannot_be_written_or_called_by_browser_roles(database):
    assert database.execute(
        "select has_table_privilege('service_role','public.island_progression_receipts','INSERT')"
    ).fetchone() == (False,)

    assert database.execute(
        "select has_function_privilege('authenticated',"
        "'public.island_economy_progression(uuid,uuid,uuid,text,jsonb,jsonb)','EXECUTE')"
    ).fetchone() == (False,)
    assert database.execute(
        "select has_function_privilege('service_role',"
        "'public.island_progression_result(uuid,boolean,boolean)','EXECUTE')"
    ).fetchone() == (False,)
    assert database.execute(
        "select has_function_privilege('service_role',"
        "'public.island_research_legacy_personal"
        "(uuid,uuid,text,text,integer,integer,integer,text,boolean)','EXECUTE')"
    ).fetchone() == (False,)


@pytest.mark.parametrize("prior", [999900, 2**31 - 100, 2**53 - 100])
def test_valid_research_switches_preserve_exact_totals_beyond_old_caps(database, prior):
    owner, member, _, initial = setup(database)
    research_step(database, member, owner, initial, "research01")
    research_step(database, member, owner, initial, "research02", 2, "rapid_2")
    as_owner(database)
    database.execute(
        "update public.island_research set coins_paid=%s where island_owner=%s and branch='cannon'",
        (prior, owner),
    )
    as_server(database)
    research_step(database, member, owner, initial, "switch001", 2, "long_guns", True)
    switched, _ = research_step(database, member, owner, initial, "switch002", 2, "rapid_2", True)
    assert switched["receipt"]["result"]["research"]["coinsPaid"] == str(prior + 720)
    reconciles(database, keys(initial)[0])


@pytest.mark.parametrize("invalid", ["NaN", "Infinity", "-Infinity", "1.5", "0", "-1"])
def test_research_total_rejects_nonfinite_fractional_and_nonpositive_values(database, invalid):
    owner, member, _, initial = setup(database)
    research_step(database, member, owner, initial, "research01")
    as_owner(database)
    with pytest.raises(psycopg.errors.CheckViolation), database.transaction():
        database.execute(
            "update public.island_research set coins_paid=%s::numeric where island_owner=%s",
            (invalid, owner),
        )


def test_unadmitted_island_keeps_legal_legacy_research_values_and_behavior(database):
    owner, member, _, _ = setup(database, admitted=False)
    result = rpc(
        database, "island_research", owner, owner, "cannon", "legacy001", 80, 8, 1, None, False
    )
    assert result["status"] == "done" and result["repeat"] is False
    assert balance(database, owner) == 20
    assert database.execute(
        "select coins_paid,economy_revision from public.island_research where island_owner=%s",
        (owner,),
    ).fetchone() == (80, 0)


@pytest.mark.parametrize("expired", [False, True])
def test_accepted_recovery_reservation_blocks_progression_without_autoexpiry(database, expired):
    owner, member, _, initial = setup(database)
    as_owner(database)
    database.execute(
        "update public.island_recovery_state set current_wave_id=%s, "
        "reserved_at=clock_timestamp()-interval '1 day', "
        "starts_at=clock_timestamp()-interval '1 day', "
        "expires_at=clock_timestamp() + case when %s then interval '-1 hour' "
        "else interval '1 hour' end where island_owner=%s",
        (uuid4(), expired, owner),
    )
    as_server(database)
    assert mutate(database, member, initial, "reserved1", research()) == {
        "status": "refused",
        "reason": "wave_running",
    }
    assert count_claims(database, member, "reserved1") == 0
    assert database.execute(
        "select current_wave_id is not null from public.island_recovery_state "
        "where island_owner=%s",
        (owner,),
    ).fetchone() == (True,)


def test_member_snapshot_supplies_coherent_exact_expected_state_without_personal_history(database):
    owner, member, outsider, initial = setup(database)
    research_step(database, member, owner, initial, "research01")
    expected = add_building(database, owner)
    result = rpc(database, "island_economy_progression_state", member, *keys(initial))
    parsed = ProgressionSnapshot.model_validate(result)
    assert str(parsed.economy.accountId) == initial["currentEconomy"]["accountId"]
    assert result["buildings"][0] == {**expected, "spot": "cannon_1"}
    assert result["research"][0] == {
        "branch": "cannon",
        "tier": 1,
        "choice2": None,
        "choice3": None,
        "revision": "1",
        "coinsPaid": "180",
    }
    assert "researched_by" not in result["research"][0]
    assert rpc(database, "island_economy_progression_state", outsider, *keys(initial)) == {
        "status": "refused",
        "reason": "not_member",
    }
    assert rpc(database, "island_economy_progression_state", member, keys(initial)[0], uuid4()) == {
        "status": "refused",
        "reason": "epoch_mismatch",
    }


def test_snapshot_remains_readable_during_reserved_wave(database):
    owner, member, _, initial = setup(database)
    as_owner(database)
    database.execute(
        "update public.island_recovery_state set current_wave_id=%s, "
        "reserved_at=clock_timestamp(),starts_at=clock_timestamp(), "
        "expires_at=clock_timestamp()+interval '1 hour' where island_owner=%s",
        (uuid4(), owner),
    )
    as_server(database)
    assert (
        rpc(database, "island_economy_progression_state", member, *keys(initial))["status"] == "ok"
    )


def test_current_catalogue_change_rejects_new_obsolete_price_but_preserves_original_retry(database):
    owner, member, _, initial = setup(database)
    first, intent = research_step(database, member, owner, initial, "research01")
    changed_rule = {"price": "999", "unlockWave": 8}
    assert (
        mutate(database, member, initial, "research01", intent, rule=changed_rule)["receipt"]
        == first["receipt"]
    )
    assert mutate(database, member, initial, "newprice1", intent, rule=changed_rule) == {
        "status": "refused",
        "reason": "stale_progression_quote",
    }
    assert count_claims(database, member, "newprice1") == 0


def test_legacy_invoker_builds_keep_default_revision_without_private_helper_permission(database):
    owner, _, _, _ = setup(database, admitted=False)
    result = rpc(database, "islet_build", owner, "cannon_1", "cannon", 10, 0, 0, "legacy-invoker")
    assert result["status"] != "refused"
    assert building_state(database, owner)["revision"] == "0"


def test_malformed_financial_reply_cannot_grant_research_or_leave_an_operation_claim(database):
    owner, member, _, initial = setup(database)
    as_owner(database)
    database.execute(
        "create or replace function public.island_treasury_spend("
        "p_actor_id uuid,p_account_id uuid,p_run_epoch uuid,p_action_uid text,"
        "p_reason text,p_reference text,p_amount numeric) returns jsonb "
        "language sql security definer set search_path='' as $$ select '{}'::jsonb $$"
    )
    as_server(database)
    assert mutate(database, member, initial, "malformed1", research()) == {
        "status": "refused",
        "reason": "action_conflict",
    }
    assert research_state(database, owner)["tier"] == 0
    assert count_claims(database, member, "malformed1") == 0


def test_unavailable_catalogue_allows_old_receipt_but_refuses_new_intent_without_claim(database):
    owner, member, _, initial = setup(database)
    intent = {"action": "wreck", "amount": 100, "quotedCoins": "100"}
    original = mutate(database, member, initial, "oldgift01", intent)
    assert (
        mutate(database, member, initial, "oldgift01", intent, rule={"unavailable": True})[
            "receipt"
        ]
        == original["receipt"]
    )
    assert mutate(database, member, initial, "newgift01", intent, rule={"unavailable": True}) == {
        "status": "refused",
        "reason": "invalid_progression",
    }
    assert count_claims(database, member, "newgift01") == 0
