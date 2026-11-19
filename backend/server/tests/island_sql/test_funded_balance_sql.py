"""Measured combat -> actual funded purchase/native settlement on isolated PostgreSQL.

These are headless composition checks with zero countdown/minimum wait, not authenticated play.
"""

from dataclasses import replace

import pytest

pytest.importorskip("psycopg")

from server.island.catalogue import load_island, runtime_catalogue  # noqa: E402
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from tools.economy.funded_choices import reset  # noqa: E402
from tools.economy.funded_play import Combat  # noqa: E402
from tools.economy.funded_sql import DomainCampaign  # noqa: E402


def world(database, count=2):
    catalogue = runtime_catalogue(load_island())
    bounded = replace(catalogue, waves=replace(catalogue.waves,
                      minimum_seconds=0, countdown_seconds=0))
    return DomainCampaign(database, bounded, count, "mixed", "defense")


def test_measured_first_wave_has_one_actual_payout_and_no_private_payment(database):
    room, combat = world(database), Combat()
    try:
        row = room.attempt(combat, 7919)
        assert row["nativeOutcome"] == "won" and row["lootCoins"] == 35
        assert row["closingCoins"] == 55  # 200 - six walls*10 - four cannons*30 + 35.
        assert room.read("select count(*) from public.island_treasury_transactions "
            "where account_id=%s and reason='pirate_loot'", (room.account,)) == [(1,)]
        assert room.read("select count(*) from public.island_wave_completion_receipts r "
            "join public.island_wave_accounting w on w.wave_id=r.wave_id where w.account_id=%s",
            (room.account,)) == [(2,)]
        assert room.wallets == room.private_wallets()
    finally:
        combat.close()


def test_reset_measurement_retains_only_actually_earned_personal_progress(database):
    room, combat = world(database), Combat()
    try:
        room.attempt(combat, 7919)
        before = room.profile_choices()
        assert [row["level"] for row in before] == [3, 3]
        outcome = reset(room)
        assert outcome["oneGrantOnReplay"] and outcome["personalProfilesPreserved"]
        assert room.game.best == 0 and not room.game.buildings and room.game.coins == 200
        assert [row["level"] for row in room.profile_choices()] == [3, 3]
        after = room.attempt(combat, 15401)
        assert after["playedWave"] == 1 and after["nativeOutcome"] == "won"
        assert room.read("select count(*) from public.island_treasury_transactions "
            "where account_id=%s and reason='starting_coins'", (room.account,)) == [(1,)]
    finally:
        combat.close()
