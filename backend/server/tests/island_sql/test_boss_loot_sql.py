"""The database pays what waves.loot_arguments folds (fix/playtest-1117): the boss wave 40 pays
5 times the normal loot, a boss wave above 40 3 times its raised loot (recovery finish)."""

from dataclasses import dataclass

import pytest

psycopg = pytest.importorskip("psycopg")

from server.island.catalogue import load_island  # noqa: E402
from server.island.waves import loot_arguments  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    as_owner,
    as_server,
    call,
)
from server.tests.island_sql.test_recovery_wave_end_sql import PAGE, two_player_wave  # noqa: E402

RECOVERY_FINISH = (
    "select public.recovery_wave_finish(%s,%s,true,7,%s,%s,%s,%s,5,%s,%s,%s,'bossloot0001',"
    "%s,%s,0,'{}'::jsonb,'{}'::jsonb)"
)


@dataclass
class Where:
    place: str
    wave: int
    seed: int = 1


@pytest.mark.parametrize(("wave", "coins"), [(40, 1825), (45, 1731), (50, 1821)])
def test_a_recovery_boss_wave_pays_the_round_loot_the_client_shows(database, wave, coins):
    wave_id, epoch = two_player_wave(database, join=False)
    as_owner(database)
    database.execute("update public.wave_runs set wave=%s where id=%s", (wave, wave_id))
    as_server(database)
    page = call(database, PAGE, OWNER, wave_id, 0)
    arguments = loot_arguments(load_island(), Where("island", wave), None, True, False)
    done = call(
        database,
        RECOVERY_FINISH,
        OWNER,
        wave_id,
        arguments["p_loot_base"],
        arguments["p_loot_per_wave"],
        arguments["p_loot_per_house"],
        arguments["p_point_loot_base"],
        arguments["p_boss_multiplier"],
        arguments["p_restart_back"],
        epoch,
        max(0, page["sealedThroughTick"]),
        page["headSeq"],
    )
    assert done["status"] == "done", done
    assert done["boss"] is True
    assert done["loot"] == coins
