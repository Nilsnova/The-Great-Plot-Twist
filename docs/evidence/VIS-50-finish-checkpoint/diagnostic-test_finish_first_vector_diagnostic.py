"""External desired-behavior regression: a malformed first HP vector must not close or pay.

Uses only the repository's private Unix-socket disposable PostgreSQL fixtures.
"""
import json
import re
from pathlib import Path
from uuid import UUID

from server.tests.case_sql.conftest import database, scratch_server, MIGRATIONS
from server.tests.island_sql.test_islands_and_waves_sql import (
    OWNER, add_players, open_island, as_server, as_owner, call, balance,
)
from server.tests.island_sql.test_structure_recovery_mutations_sql import template
from server.tests.island_sql.test_recovery_wave_end_sql import move_start

START = (
    "select public.recovery_wave_start(%s,%s,'island',%s,4242,0,15,900,50,"
    "'calm',1,0,%s::text[],%s::jsonb,true,2::smallint)"
)
FINISH = (
    "select public.recovery_wave_finish(%s,%s,true,7,10,5,5,20,5,2,2,%s,%s,"
    "%s,%s,0,'{}'::jsonb,'{}'::jsonb)"
)
PAGE = "select public.recovery_wave_events_page(%s,%s,0,null,null)"

def state(db, wave):
    return {
        'balance': balance(db, OWNER),
        'run': db.execute(
            'select finished_at is not null,survived,loot,expired from public.wave_runs where id=%s',
            (wave,),
        ).fetchone(),
        'recovery': db.execute(
            'select closed_at is not null,checkpoint_uid,closed_hp from public.recovery_wave_states where wave_id=%s',
            (wave,),
        ).fetchone(),
        'lootRows': db.execute(
            "select count(*) from public.wallet_transactions where reason='pirate_loot' and ref like %s",
            (f'wave:{wave}:%',),
        ).fetchone()[0],
    }

def test_malformed_first_vector_cannot_close_or_pay(database):
    add_players(database, OWNER)
    open_island(database, OWNER, 'K7Q2M')
    as_server(database)
    built = call(database, "select public.island_build(%s,%s,'wall_1','wall','vis50-wall-001',10)", OWNER, OWNER)
    assert built['status'] == 'done', built
    current = template((('wall_1','wall'),))
    current['expectedRevision'] = call(database, 'select revision from public.island_recovery_state where island_owner=%s', OWNER)
    started = call(database, START, OWNER, 'vis50-wave-001', OWNER, ['structure_recovery'], json.dumps(current))
    assert started['status'] == 'started', started
    wave = UUID(started['waveId'])
    frozen = started['initialSnapshot']
    assert len(frozen['structures']) == 1 and frozen['structures'][0]['spot'] == 'wall_1'
    move_start(database, wave, 20)
    page = call(database, PAGE, OWNER, wave)
    epoch = UUID(frozen['islandEpoch'])
    assert page['status'] == 'ok'
    before = state(database, wave)
    assert before['run'][0] is False and before['recovery'][:2] == (False, None)
    assert before['lootRows'] == 0
    health = call(
        database,
        "select public.recovery_wave_report_health(%s,%s,%s,'vis50-health-001',%s,%s,0,'{}'::jsonb,'{}'::jsonb)",
        OWNER,wave,epoch,page['sealedThroughTick'],page['headSeq'],
    )
    assert health == {'status':'refused','reason':'checkpoint_divergence'}, health
    database.execute('savepoint before_finish')
    args = (OWNER,wave,epoch,'vis50-finish-001',page['sealedThroughTick'],page['headSeq'])
    incoming = call(database, FINISH, *args)
    after_incoming = state(database,wave)
    database.execute('rollback to savepoint before_finish')
    as_owner(database)
    source = (MIGRATIONS/'20261117040000_structure_recovery_api.sql').read_text()
    legacy_finish = re.search(r'create or replace function public\.recovery_wave_finish\([\s\S]*?\$\$;',source).group()
    database.execute(legacy_finish)
    as_server(database)
    previous = call(database, FINISH, *args)
    after_previous = state(database,wave)
    assert previous == {'status':'refused','reason':'checkpoint_divergence'}, previous
    assert after_previous == before
    record = {'directHealth':health,'minimumSeconds':15,'elapsedSeconds':20,
        'snapshotStructures':len(frozen['structures']),'prefix':page,'before':before,
        'incomingFinish':incoming,'afterIncoming':after_incoming,
        'previousFinish':previous,'afterPrevious':after_previous}
    Path('/workspace/reference-village-work/vis50-pg-diagnostic/observed.json').write_text(json.dumps(record,indent=2)+'\n')
    print('VIS50_OBSERVED',json.dumps(record))
    assert incoming == {'status':'refused','reason':'checkpoint_divergence'}
