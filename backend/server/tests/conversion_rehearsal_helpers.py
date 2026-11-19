"""TEST ONLY: populate and rehearse conversion on a disposable Unix-socket database.

This fixture is not a production converter or a hosted database command. It uses
real treasury/Captain/copy constraints inside one outer transaction, with an
explicit synthetic policy and a private rehearsal receipt table.
"""

from uuid import uuid4

from psycopg.types.json import Jsonb

from server.island.catalogue import load_island
from server.island.personal_captain import configuration
from server.island.treasury_models import decimal_integer
from server.tests.island_sql.test_island_treasury_sql import keys, ready, reserve, rpc
from server.tests.island_sql.test_islands_and_waves_sql import (
    as_owner,
    as_server,
    open_island,
)
from tools.economy.conversion import fingerprint, preview, snapshot_facts
from tools.economy.conversion_models import Snapshot
from tools.economy.conversion_rules import SOURCE_FAMILIES

RULES = configuration(load_island())
SKILLS = ["steady_aim", "cutlass", "quick_fix"]


def synthetic_case(connection):
    """Commit-free seed helper; caller chooses its outer disposable transaction."""
    owner, member, old_owner, _ = ready(connection, admitted=False)
    # Hex letters forbidden in island codes are translated into valid symbols.
    code = uuid4().hex[:5].upper().translate(str.maketrans("01IO", "23PQ"))
    open_island(connection, member, code)
    code = uuid4().hex[:5].upper().translate(str.maketrans("01IO", "23PQ"))
    open_island(connection, old_owner, code)
    as_owner(connection)
    for actor in (owner, member):
        connection.execute(
            "update public.islands set captain_level=4,won_wave_best=8,"
            "captain_skills=%s,captain_role='engineer',wave_best=80 where player_id=%s",
            (SKILLS, actor),
        )
    connection.execute(
        "update public.islands set crew_gunner=3,crew_carpenter=2,crew_lookout=1,"
        "crew_guard=1,wreck_paid=30 where player_id=%s",
        (owner,),
    )
    as_server(connection)
    rpc(
        connection,
        "apply_wallet_transaction",
        member,
        -90,
        "building_purchase",
        "island:convert001",
    )
    rpc(connection, "apply_wallet_transaction", owner, -50, "tech_research", "research:oldwall001")
    as_owner(connection)
    instance = uuid4()
    connection.execute(
        "insert into public.islets(player_id,timber) values(%s,17) "
        "on conflict(player_id) do nothing",
        (owner,),
    )
    connection.execute(
        "insert into public.islet_buildings(player_id,plot,building_type,level,coins_paid,"
        "timber_paid,ref,recovery_instance_id) values(%s,'cannon_1','cannon',1,90,0,"
        "'island:convert001',%s)",
        (owner, instance),
    )
    connection.execute(
        "insert into public.building_payments(island_owner,plot,building_ref,level,payer,"
        "coins,ref) values(%s,'cannon_1','island:convert001',1,%s,90,'island:convert001')",
        (owner, member),
    )
    connection.execute(
        "insert into public.island_layout(island_owner,plot,x_half,z_half,moved_by) "
        "values(%s,'cannon_1',7,-3,%s)",
        (owner, member),
    )
    connection.execute(
        "insert into public.island_research(island_owner,branch,researched_by,"
        "coins_paid,ref,tier,choice_2) values(%s,'wall',%s,50,"
        "'research:oldwall001',2,'mason_drill')",
        (owner, owner),
    )
    for number in range(1, 23):
        connection.execute(
            "insert into public.arsenal_copies"
            "(island_owner,copy_no,weapon,holder,bought_by,source) "
            "values(%s,%s,'pistols',%s,%s,'converted')",
            (owner, number, (owner, member)[number - 1] if number <= 2 else None, member),
        )
    as_server(connection)
    old = rpc(connection, "island_treasury_admit", old_owner, old_owner, "oldadmit001", 100)
    held = reserve(connection, old_owner, old, 30, uid="oldstake001")
    rpc(connection, "game_join", owner, old_owner, 10)
    imported = rpc(
        connection, "personal_captain_initialize", owner, old_owner, keys(old)[1], Jsonb(RULES)
    )
    assert imported.get("status") != "refused", imported
    as_owner(connection)
    commitment = rpc(connection, "personal_captain_bind_engineer_locked", owner)
    as_server(connection)
    reset = rpc(
        connection,
        "island_lifecycle_reset",
        old_owner,
        old_owner,
        keys(old)[1],
        "oldreset001",
        code,
        200,
        "synthetic-reviewed-capital",
    )
    assert reset.get("status") == "done", reset
    as_owner(connection)
    connection.execute("create schema if not exists conversion_rehearsal")
    connection.execute(
        "create table if not exists conversion_rehearsal.receipts("
        "policy_id uuid primary key,manifest_hash text not null,result jsonb not null)"
    )
    policy = {
        "schemaVersion": 1,
        "policyId": str(uuid4()),
        "reviewReference": "synthetic-test-review",
        "reviewedBy": ["synthetic-owner", "synthetic-peer"],
        "selectedIslands": [str(owner), str(member)],
        "openingGrantCoins": "200",
        "wavesPerPoint": RULES["wavesPerPoint"],
        "skillCosts": {row["skill"]: row["cost"] for row in RULES["tree"]},
        "retiredSkillIds": RULES["retired"],
        "personalCash": "preserve",
        "refundBasis": "verified_actual_payments",
        "retiredSkills": "preserve_ids_no_compensation",
        "copyOverflow": "grandfather",
        "obligations": "retain_origin",
    }
    return {
        "players": [owner, member, old_owner],
        "owners": [owner, member],
        "snapshotId": str(uuid4()),
        "policy": policy,
        "oldTreasury": old,
        "oldHold": held,
        "instance": instance,
        "commitment": str(commitment),
    }


def player_fact(connection, actor, policy):
    row = connection.execute(
        "select captain_level,won_wave_best,captain_skills,captain_role from public.islands "
        "where player_id=%s",
        (actor,),
    ).fetchone()
    if row is None:
        raise ValueError("source_actor_deleted")
    wallet = connection.execute(
        "select balance from public.wallets where player_id=%s", (actor,)
    ).fetchone()
    if wallet is None:
        raise ValueError("source_actor_deleted")
    ledger = [
        {
            "entryId": str(identifier),
            "balanceDelta": str(delta),
            "committedDelta": "0",
            "reason": reason,
            "sourceRef": reference,
        }
        for identifier, delta, reason, reference in connection.execute(
            "select id,delta,reason,ref from public.wallet_transactions "
            "where player_id=%s order by id",
            (actor,),
        ).fetchall()
    ]
    timber = connection.execute(
        "select timber from public.islets where player_id=%s", (actor,)
    ).fetchone()
    earned = row[1] // policy["wavesPerPoint"]
    spent = sum(policy["skillCosts"][skill] for skill in row[2])
    personal = connection.execute(
        "select level,won_wave_best,earned_points,skills,role,"
        "pending_engineer_commitment_id,assignment_wave_id from public.personal_captain_profiles "
        "where player_id=%s",
        (actor,),
    ).fetchone()
    if personal:
        row = (personal[0], personal[1], personal[3], personal[4])
        earned = personal[2]
        spent = sum(policy["skillCosts"][skill] for skill in row[2])
    return {
        "playerId": str(actor),
        "walletCoins": str(wallet[0]),
        "walletLedger": ledger,
        "privateTimber": str(timber[0] if timber else 0),
        "captainLevel": row[0],
        "personalBestWave": row[1],
        "earnedPoints": str(earned),
        "unspentPoints": str(earned - spent),
        "knownSkills": row[2],
        "role": row[3],
        "engineerCommitmentId": str(personal[5]) if personal and personal[5] else None,
        "progressionVersion": 1 if personal else 0,
        "assignmentWaveId": str(personal[6]) if personal and personal[6] else None,
        "openLegacyWaveIds": [
            str(value[0])
            for value in connection.execute(
                "select r.id from public.wave_participants p "
                "join public.wave_runs r on r.id=p.wave_id "
                "where p.player_id=%s and r.finished_at is null and not exists("
                "select 1 from public.island_wave_accounting a where a.wave_id=r.id) union "
                "select r.wave_id from public.recovery_wave_participants p join "
                "public.recovery_wave_states r on r.wave_id=p.wave_id where p.player_id=%s "
                "and r.closed_at is null and not exists("
                "select 1 from public.island_wave_accounting a "
                "where a.wave_id=r.wave_id) order by 1",
                (actor, actor),
            ).fetchall()
        ],
    }


def wave_facts(connection, owner):
    waves = connection.execute(
        "select id,finished_at is not null from public.wave_runs where island_owner=%s order by id",
        (owner,),
    ).fetchall()
    recovery = connection.execute(
        "select wave_id,closed_at is not null from public.recovery_wave_states "
        "where island_owner=%s order by wave_id",
        (owner,),
    ).fetchall()
    return {str(identifier): closed for identifier, closed in [*waves, *recovery]}


def island_fact(connection, owner):
    buildings = []
    for plot, kind, level, ref, instance, skill, a, b in connection.execute(
        "select plot,building_type,level,ref,recovery_instance_id,spec,tree_a,tree_b "
        "from public.islet_buildings where player_id=%s order by plot",
        (owner,),
    ).fetchall():
        payments = [
            {
                "level": step,
                "coins": str(coins),
                "sourceRef": reference,
                "payerId": str(payer) if payer else None,
                "refunded": refunded is not None,
            }
            for step, coins, reference, payer, refunded in connection.execute(
                "select level,coins,ref,payer,refunded_by from public.building_payments "
                "where island_owner=%s and building_ref=%s order by level",
                (owner, ref),
            ).fetchall()
        ]
        buildings.append(
            {
                "instanceId": str(instance),
                "spot": plot,
                "kind": kind,
                "level": level,
                "payments": payments,
                "refundEligible": kind != "cabin",
                "layout": {},
                "skill": skill,
                "treeA": a,
                "treeB": b,
            }
        )
        layout = connection.execute(
            "select x_half,z_half,layout_version from public.island_layout "
            "where island_owner=%s and plot=%s",
            (owner, plot),
        ).fetchone()
        if layout:
            buildings[-1]["layout"] = dict(zip(("xHalf", "zHalf", "version"), layout, strict=True))
    copies = [
        {
            "copyId": str(identifier),
            "weapon": weapon,
            "copyNumber": number,
            "sourceRef": source,
            "buyerId": str(buyer) if buyer else None,
            "holderId": str(holder) if holder else None,
            "accountId": str(account) if account else None,
            "runEpoch": str(epoch) if epoch else None,
            "holderGeneration": format(generation, "f"),
            "pendingReturnWaveId": str(pending) if pending else None,
            "disconnectedUntil": disconnected.isoformat() if disconnected else None,
        }
        for (
            identifier,
            weapon,
            number,
            source,
            buyer,
            holder,
            account,
            epoch,
            generation,
            pending,
            disconnected,
        ) in connection.execute(
            "select id,weapon,copy_no,source,bought_by,holder,economy_account_id,economy_run_epoch,"
            "holder_generation,pending_return_wave_id,disconnected_until "
            "from public.arsenal_copies "
            "where island_owner=%s order by copy_no",
            (owner,),
        ).fetchall()
    ]
    best, wreck, gunner, carpenter, lookout, guard, weapons, equipped = connection.execute(
        "select wave_best,wreck_paid,crew_gunner,crew_carpenter,crew_lookout,crew_guard,"
        "weapons_owned,weapon_equipped from public.islands "
        "where player_id=%s",
        (owner,),
    ).fetchone()
    members = [
        str(row[0])
        for row in connection.execute(
            "select player_id from public.island_members where island_owner=%s and left_at is null "
            "order by player_id",
            (owner,),
        ).fetchall()
    ]
    account = connection.execute(
        "select current_account_id from public.island_economy_state where island_owner=%s", (owner,)
    ).fetchone()
    research = {}
    for branch, tier, choice2, choice3, coins in connection.execute(
        "select branch,tier,choice_2,choice_3,coins_paid from public.island_research "
        "where island_owner=%s order by branch",
        (owner,),
    ).fetchall():
        research.update(
            {
                branch + ":tier": tier,
                branch + ":choice2": choice2,
                branch + ":choice3": choice3,
                branch + ":coinsPaid": str(coins),
            }
        )
    wave_states = wave_facts(connection, owner)
    return {
        "ownerId": str(owner),
        "revision": "0",
        "mode": "island_shared" if account else "personal_legacy",
        "accountId": str(account[0]) if account else None,
        "members": members,
        "waveBest": best,
        "openWaveIds": sorted(
            identifier for identifier, closed in wave_states.items() if not closed
        ),
        "closedWaveIds": sorted(identifier for identifier, closed in wave_states.items() if closed),
        "buildings": buildings,
        "copies": copies,
        "unmappedWeaponIds": sorted((set(weapons) | {equipped}) - {"musket"}),
        "legacyWeaponsOwned": weapons,
        "legacyEquippedWeapon": equipped,
        "research": research,
        "crew": {"gunner": gunner, "carpenter": carpenter, "lookout": lookout, "guard": guard},
        "wreckPaid": str(wreck),
    }


def inventory(connection, case):
    """Read the deliberately populated fixture; never a production export command."""
    as_owner(connection)
    old_id, epoch = keys(case["oldTreasury"])
    accounts = []
    for identifier, owner, run_epoch, balance, committed, state in connection.execute(
        "select id,island_owner,run_epoch,balance_coins,committed_coins,state "
        "from public.island_economy_accounts where island_owner=any(%s::uuid[]) order by id",
        (case["players"],),
    ).fetchall():
        entries = [
            {
                "entryId": str(identifier),
                "reason": reason,
                "sourceRef": reference,
                "balanceDelta": format(delta, "f"),
                "committedDelta": format(held, "f"),
            }
            for identifier, reason, reference, delta, held in connection.execute(
                "select id,reason,reference,balance_delta,committed_delta "
                "from public.island_treasury_transactions where account_id=%s "
                "order by revision_at_commit",
                (identifier,),
            ).fetchall()
        ]
        accounts.append(
            {
                "accountId": str(identifier),
                "islandOwner": str(owner),
                "runEpoch": str(run_epoch),
                "balanceCoins": format(balance, "f"),
                "committedCoins": format(committed, "f"),
                "retired": state == "retired",
                "ledger": entries,
            }
        )
    old_owner = str(case["players"][-1])
    return {
        "schemaVersion": 1,
        "sourceCommit": "3bdd8eda16470795fdedd68c42fffab54e5f2ced",
        "snapshotId": case["snapshotId"],
        "sourceFamilies": sorted(SOURCE_FAMILIES),
        "players": [player_fact(connection, actor, case["policy"]) for actor in case["players"]],
        "islands": [island_fact(connection, owner) for owner in case["players"]],
        "accounts": accounts,
        "obligations": [
            {
                "obligationId": case["oldHold"]["receipt"]["id"],
                "kind": "shared_wager",
                "mode": "island_shared",
                "actorId": old_owner,
                "recipientId": old_owner,
                "accountId": old_id,
                "runEpoch": epoch,
                "principalCoins": "30",
                "settled": False,
                "sourceRef": "oldstake001",
                "origin": {
                    "productId": "synthetic-market:1",
                    "openingRef": case["oldHold"]["receipt"]["id"],
                    "openingFeeCoins": "0",
                    "recipientMode": "island_shared",
                },
            }
        ],
        "unknownOrigins": [],
    }


def rehearse(
    connection,
    case,
    snapshot,
    policy,
    *,
    after_locks=None,
    fail_after_grant=False,
    fail_after_assets=False,
):
    """TEST ONLY atomic composition. No production API imports or calls this helper."""
    if not connection.info.host.startswith("/"):
        raise ValueError("disposable_unix_socket_required")
    if policy["wavesPerPoint"] != RULES["wavesPerPoint"] or policy["skillCosts"] != {
        row["skill"]: row["cost"] for row in RULES["tree"]
    }:
        raise ValueError("unsupported_catalogue_mapping")
    report = preview(snapshot, policy)
    if report["status"] != "ready_for_rehearsal":
        raise ValueError("blocked_manifest")
    with connection.transaction():
        as_owner(connection)
        actors = sorted({str(actor) for actor in case["players"]})
        locks = connection.execute(
            "select hashtextextended('island-economy:'||x,0) from unnest(%s::text[]) x order by 1",
            (actors,),
        ).fetchall()
        for (lock,) in locks:
            connection.execute("select pg_advisory_xact_lock(%s)", (lock,))
        if after_locks:
            after_locks()
        saved = connection.execute(
            "select manifest_hash,result from conversion_rehearsal.receipts "
            "where policy_id=%s for update",
            (policy["policyId"],),
        ).fetchone()
        if saved:
            if saved[0] != report["manifestSha256"]:
                raise ValueError("manifest_conflict")
            return {"repeat": True, "report": saved[1]}
        current = inventory(connection, case)
        if (
            fingerprint(snapshot_facts(Snapshot.model_validate(current)))
            != report["snapshotSha256"]
        ):
            raise ValueError("stale_snapshot")
        for plan in report["islands"]:
            if plan["action"] != "admit":
                continue
            owner = plan["ownerId"]
            as_server(connection)
            admitted = rpc(
                connection,
                "island_treasury_admit",
                owner,
                owner,
                "convert_" + policy["policyId"].replace("-", ""),
                decimal_integer(plan["openingGrantCoins"]),
            )
            if admitted.get("status") != "done":
                raise ValueError("admission_refused")
            if fail_after_grant:
                raise ValueError("synthetic_failure_after_grant")
            account, epoch = keys(admitted)
            for actor in [
                owner,
                *next(i["members"] for i in snapshot["islands"] if i["ownerId"] == owner),
            ]:
                initialized = rpc(
                    connection, "personal_captain_initialize", actor, owner, epoch, Jsonb(RULES)
                )
                if initialized.get("status") == "refused":
                    raise ValueError("captain_refused")
            as_owner(connection)
            for building in plan["refundBases"]:
                for payment in building["payments"]:
                    reference = f"legacy:{owner}:{building['instanceId']}:{payment['level']}"
                    connection.execute(
                        "insert into public.island_construction_payments(account_id,run_epoch,"
                        "island_owner,instance_id,level,coins,source_kind,conversion_reference) "
                        "values(%s,%s,%s,%s,%s,%s,'conversion',%s)",
                        (
                            account,
                            epoch,
                            owner,
                            building["instanceId"],
                            payment["level"],
                            payment["coins"],
                            reference,
                        ),
                    )
            connection.execute(
                "update public.arsenal_copies set economy_account_id=%s,"
                "economy_run_epoch=%s where island_owner=%s",
                (account, epoch, owner),
            )
            if fail_after_assets:
                raise ValueError("synthetic_failure_after_assets")
        connection.execute(
            "insert into conversion_rehearsal.receipts values(%s,%s,%s)",
            (policy["policyId"], report["manifestSha256"], Jsonb(report)),
        )
        connection.execute("set constraints all immediate")
        return {"repeat": False, "report": report}
