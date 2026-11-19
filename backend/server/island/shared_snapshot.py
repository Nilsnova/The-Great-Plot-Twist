"""One coherent shared read and its authoritative display quotes.

Used by core island HTTP routes. No legacy wallet/view serializer or initialization is used.
"""

from pydantic import ValidationError

from server.errors import ApiError
from server.island import layout, rules, treasury_store
from server.island.catalogue import IslandCatalogue, catalogue_for_existing_structures
from server.island.codes import CODE_FORMAT, shown
from server.island.shared_construction_quotes import construction_quotes
from server.island.shared_crew_rules import crew_offers
from server.island.shared_progression_quotes import research_quotes, tower_quotes, wreck_quotes
from server.island.shared_quote_rules import phase_reason
from server.island.shared_snapshot_models import SnapshotFacts
from server.island.treasury import identifier
from server.island.treasury_models import decimal_string
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

# Implemented versioned paths; each route still checks its flags and permissions.
# Move and reset remain unavailable until their coordinated client paths are ready.
SUPPORTED_CAPABILITIES = frozenset({"arsenal", "session", "repair", "market", "match"})


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an unreadable shared island snapshot.")


def check_status(value: object) -> None:
    if isinstance(value, dict) and value.get("status") == "refused":
        if value.get("reason") == "recovery_state_incomplete":
            raise ApiError(409, "economy_path_unavailable", "Island state is not ready.")
        if value.get("reason") == "player_not_set_up":
            raise ApiError(404, "player_not_set_up", "Your player profile is not ready.")
    treasury_store.check_status(value)


def spots_from_facts(facts: SnapshotFacts, catalogue: IslandCatalogue) -> list[dict]:
    rows = {row.spot: row for row in facts.buildings}
    built = {
        row.spot: rules.Built(row.kind, row.level, row.spec, row.treeA, row.treeB)
        for row in facts.buildings
    }
    existing = catalogue_for_existing_structures(catalogue, built)
    grid = layout.island_layout(existing.more_tower_spots)
    positions = layout.positions_of(
        grid, {row.plot: (row.xHalf / 2, row.zHalf / 2) for row in facts.layout}
    )
    result = []
    for spot in existing.spots:
        row = rows.get(spot.id)
        if row is not None and row.kind not in spot.kinds:
            raise unreadable()
        x, z = positions[spot.id]
        result.append(
            {
                "id": spot.id,
                "kind": row.kind if row else spot.kinds[0],
                "kinds": list(spot.kinds),
                "built": row is not None,
                "level": row.level if row else 0,
                "instanceId": str(row.instanceId) if row else None,
                "spec": row.spec if row else None,
                "treeA": row.treeA if row else 0,
                "treeB": row.treeB if row else 0,
                "revision": row.revision if row else "0",
                "x": x,
                "z": z,
                "hpUnits": row.hpUnits if row else None,
                "maxHP": row.maxHP if row else None,
            }
        )
    return result


def research_from_facts(facts: SnapshotFacts, catalogue: IslandCatalogue) -> list[dict]:
    saved = {row.branch: row.model_dump(mode="json") for row in facts.research}
    result = []
    for entry in catalogue.research:
        result.append(
            saved.pop(
                entry.branch,
                {
                    "branch": entry.branch,
                    "tier": 0,
                    "choice2": None,
                    "choice3": None,
                    "revision": "0",
                    "coinsPaid": "0",
                },
            )
        )
    return [*result, *(saved[key] for key in sorted(saved))]


def snapshot_from_row(
    value: object,
    actor_id: str,
    island_owner: str,
    catalogue: IslandCatalogue,
) -> dict:
    check_status(value)
    try:
        facts = SnapshotFacts.model_validate(value)
        account = treasury_store.account_from_row(facts.economy)
        if (str(facts.actorId), str(facts.owner)) != (actor_id, island_owner):
            raise unreadable()
        if CODE_FORMAT.fullmatch(facts.code) is None:
            raise unreadable()
        spots = spots_from_facts(facts, catalogue)
        if {row.spot for row in facts.buildings} - {spot["id"] for spot in spots}:
            raise unreadable()
        quotes = {
            **construction_quotes(facts, catalogue),
            "research": research_quotes(facts, catalogue),
            **tower_quotes(facts, catalogue),
            "wreck": wreck_quotes(facts, catalogue),
        }
        crew = crew_offers(
            catalogue, facts.crew.model_dump(), facts.waveBest, account.available_coins
        )
        blocked = phase_reason(facts)
        if blocked:
            crew = [
                {**offer, "available": False, "reason": offer["reason"] or blocked}
                for offer in crew
            ]
        return {
            "snapshotVersion": 1,
            "actorId": actor_id,
            "code": shown(facts.code),
            "ownerName": facts.ownerName,
            "economy": facts.economy.model_dump(mode="json"),
            "admissionState": facts.admissionState,
            "waveBest": facts.waveBest,
            "nextWave": rules.next_wave(catalogue, facts.waveBest, facts.nextWave),
            "flags": facts.flags,
            "crew": facts.crew.model_dump(),
            "crewOffers": crew,
            "personalCaptain": facts.personal.model_dump(mode="json", exclude={"status"})
            if facts.personal
            else None,
            "spots": spots,
            "research": research_from_facts(facts, catalogue),
            "wreck": {
                "paidCoins": decimal_string(facts.wreckPaid),
                "goalCoins": decimal_string(catalogue.wreck.goal),
            },
            "layout": {
                "version": 2 if facts.layout else 1,
                "grid": layout.island_layout(catalogue.more_tower_spots).grid,
                "movable": False,
            },
            "quotes": quotes,
            "recoveryVersion": facts.recoveryVersion,
            "waveProtocol": facts.waveProtocol,
            "serverNow": facts.serverNow.isoformat(),
            "capabilities": {
                name: {
                    "available": name in SUPPORTED_CAPABILITIES,
                    "reason": None
                    if name in SUPPORTED_CAPABILITIES
                    else "economy_path_unavailable",
                }
                for name in ("arsenal", "session", "move", "repair", "reset", "market", "match")
            },
        }
    except (ValidationError, ValueError, KeyError) as error:
        raise unreadable() from error


async def read_shared_snapshot(
    admin: SupabaseAdmin,
    actor_id: str,
    island_owner: str,
    catalogue: IslandCatalogue,
) -> dict:
    value = await admin.call_function(
        "island_economy_snapshot",
        {
            "p_actor_id": identifier(actor_id),
            "p_island_owner": identifier(island_owner),
        },
    )
    return snapshot_from_row(value, actor_id, island_owner, catalogue)
