"""Coherent shared bell preparation cannot mix static facts or personal-wallet views."""

from copy import deepcopy

import pytest

from server.errors import ApiError
from server.island.catalogue import load_island
from server.island.rules import weather_for
from server.island.shared_snapshot_models import SnapshotFacts
from server.island.shared_wave_template import expected_source, prepare_shared_wave
from server.supabase_admin import SupabaseRejected
from server.tests.test_shared_snapshot import ACTOR, OWNER, raw_snapshot


class Snapshots:
    def __init__(self, rows=None, revisions=(3, 3)):
        self.rows = rows or [raw_snapshot()]
        self.revisions = iter(revisions)
        self.calls = []
        self.reads = 0

    async def call_function(self, name, body):
        self.calls.append((name, body))
        assert name == "island_economy_snapshot"
        row = self.rows[min(self.reads, len(self.rows) - 1)]
        self.reads += 1
        return deepcopy(row)

    async def select_rows(self, table, query):
        assert table == "island_recovery_state"
        assert query == {"select": "revision", "island_owner": f"eq.{OWNER}", "limit": "1"}
        return [{"revision": next(self.revisions)}]


async def prepare(admin):
    catalogue = load_island()
    return await prepare_shared_wave(
        admin, catalogue, ACTOR, OWNER, weather_for(catalogue, "calm"), 4242, [],
    )


@pytest.mark.anyio
async def test_shared_static_template_and_cas_come_from_one_snapshot_without_wallet_reads():
    admin = Snapshots()
    template, basis = await prepare(admin)
    assert len(admin.calls) == 1
    assert admin.calls[0][1] == {"p_actor_id": ACTOR, "p_island_owner": OWNER}
    facts = SnapshotFacts.model_validate(raw_snapshot())
    assert template["expectedSource"] == expected_source(facts)
    assert template["expectedRevision"] == 3
    assert template["createWave"]["seed"] == 4242
    assert template["weatherLabel"] == weather_for(load_island(), "calm").label
    assert template["createWave"]["crew"] == raw_snapshot()["crew"]
    assert (template["createWave"]["defenses"][0]["x"],
            template["createWave"]["defenses"][0]["z"]) == (-18, -1)
    assert basis.played_wave == 1  # The requested played wave, even though the island record is 80.
    assert basis.house_levels == 0
    assert "personalCaptain" not in template and "coins" not in template


@pytest.mark.anyio
async def test_a_health_revision_race_retries_the_entire_coherent_source():
    first, second = raw_snapshot(), raw_snapshot()
    second["crew"]["gunner"] = 2
    admin = Snapshots([first, second], revisions=(1, 2, 2, 2))
    template, _ = await prepare(admin)
    assert admin.reads == 2
    assert template["expectedSource"]["crew"]["gunner"] == 2
    assert template["createWave"]["crew"]["gunner"] == 2


@pytest.mark.anyio
async def test_a_continuously_changing_source_refuses_instead_of_preparing_a_mixed_attempt():
    with pytest.raises(ApiError) as error:
        await prepare(Snapshots(revisions=range(100)))
    assert (error.value.status_code, error.value.code) == (409, "island_changed")


@pytest.mark.anyio
async def test_another_actors_snapshot_is_unreadable_even_if_its_fields_are_valid():
    row = raw_snapshot()
    row["actorId"] = OWNER
    with pytest.raises(SupabaseRejected):
        await prepare(Snapshots([row]))


def test_money_hp_and_personal_progress_do_not_become_the_static_world_fingerprint():
    first, second = raw_snapshot(), raw_snapshot()
    second["economy"]["revision"] = "200"
    second["economy"]["treasury"].update(balanceCoins="1000", availableCoins="1000")
    second["buildings"][0]["hpUnits"] = 100
    second["personal"]["captain"]["revision"] = "99"
    assert expected_source(SnapshotFacts.model_validate(first)) == expected_source(
        SnapshotFacts.model_validate(second)
    )
