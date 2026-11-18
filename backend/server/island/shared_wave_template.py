"""Coherent member facts for a new shared bell's static inputs and CAS proof.

Used after native start replay lookup. No read initializes a Captain, grants coins,
adopts health or changes a wave; the canonical SQL start performs those checks.
"""

from pydantic import ValidationError

from server.errors import ApiError
from server.island import rules, shared_snapshot, treasury_store
from server.island.catalogue import IslandCatalogue, Weather
from server.island.codes import CODE_FORMAT
from server.island.shared_snapshot_models import SnapshotFacts
from server.island.wave_economy import freeze_reward_basis
from server.island.wave_economy_models import WaveRewardBasis
from server.island.wave_recovery import SNAPSHOT_READ_ATTEMPTS, read_recovery_revision
from server.island.wave_snapshot_template import WaveDefense, static_template
from server.supabase_admin import SupabaseAdmin, SupabaseRejected


def expected_source(facts: SnapshotFacts) -> dict:
    """Exact static CAS facts, not a financial revision or a health replacement."""
    building = {"spot", "kind", "level", "instanceId", "spec", "treeA", "treeB", "revision"}
    research = {"branch", "tier", "choice2", "choice3", "revision"}
    return {
        "waveBest": facts.waveBest, "nextWave": facts.nextWave, "flags": facts.flags,
        "crew": facts.crew.model_dump(),
        "buildings": [row.model_dump(mode="json", include=building)
                      for row in sorted(facts.buildings, key=lambda row: row.spot)],
        "research": [row.model_dump(mode="json", include=research)
                     for row in sorted(facts.research, key=lambda row: row.branch)],
        "layout": [row.model_dump(mode="json")
                   for row in sorted(facts.layout, key=lambda row: row.plot)],
        "recoveryVersion": facts.recoveryVersion, "waveProtocol": facts.waveProtocol,
    }


async def coherent_facts(
    admin: SupabaseAdmin, actor_id: str, island_owner: str,
) -> tuple[SnapshotFacts, int]:
    for _ in range(SNAPSHOT_READ_ATTEMPTS):
        before = await read_recovery_revision(admin, island_owner)
        value = await admin.call_function("island_economy_snapshot", {
            "p_actor_id": actor_id, "p_island_owner": island_owner,
        })
        shared_snapshot.check_status(value)
        try:
            facts = SnapshotFacts.model_validate(value)
            treasury_store.account_from_row(facts.economy)
            if (str(facts.actorId), str(facts.owner)) != (actor_id, island_owner):
                raise ValueError("Another snapshot identity.")
            if CODE_FORMAT.fullmatch(facts.code) is None:
                raise ValueError("Unreadable island code.")
        except (ValidationError, ValueError) as error:
            raise SupabaseRejected("The shared wave preparation could not be read.") from error
        after = await read_recovery_revision(admin, island_owner)
        if before == after:
            return facts, after
    raise ApiError(409, "island_changed", "The island changed. Retry the same wave request.")


async def prepare_shared_wave(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, actor_id: str, island_owner: str,
    weather: Weather, seed: int, kept_rules: list[str],
) -> tuple[dict, WaveRewardBasis]:
    facts, revision = await coherent_facts(admin, actor_id, island_owner)
    projected = shared_snapshot.spots_from_facts(facts, catalogue)
    if {row.spot for row in facts.buildings} - {spot["id"] for spot in projected}:
        raise SupabaseRejected("A shared wave structure could not be read.")
    spots = [WaveDefense(
        row["id"], row["kind"], row["built"], row["level"], row["spec"], row["x"], row["z"],
        (row["treeA"], row["treeB"]) if row["built"] else None,
    ) for row in projected]
    research = {row.branch: rules.ResearchTier(row.tier, row.choice2, row.choice3)
                for row in facts.research}
    template = static_template(
        catalogue, spots, facts.crew.model_dump(), research, weather, seed, kept_rules, revision,
    )
    template["createWave"]["seed"] = seed
    template["expectedSource"] = expected_source(facts)
    played = rules.next_wave(catalogue, facts.waveBest, facts.nextWave)
    houses = sum(row.level for row in facts.buildings if row.kind == "house")
    return template, freeze_reward_basis(
        catalogue, played_wave=played, seed=seed, house_levels=houses,
    )
