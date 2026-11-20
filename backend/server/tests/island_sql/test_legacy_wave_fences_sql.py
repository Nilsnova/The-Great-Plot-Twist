"""Old wave entry fences on real disposable PostgreSQL; no hosted authority fixture."""

from concurrent.futures import ThreadPoolExecutor
from threading import Event
from time import monotonic

import pytest

psycopg = pytest.importorskip("psycopg")

from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island  # noqa: E402
from server.island.personal_captain import configuration  # noqa: E402
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, ready, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    FRIEND,
    OWNER,
    VETERAN,
    add_players,
    as_owner,
    as_server,
    balance,
    call,
    ledger,
    open_island,
    start,
)
from server.tests.island_sql.test_personal_captain_sql import initialized  # noqa: E402
from server.tests.island_sql.test_recovery_wave_end_sql import (  # noqa: E402
    FINISH,
    move_start,
    template,
    two_player_wave,
)
from server.tests.island_sql.test_wave_reward_recovery_sql import close_wave  # noqa: E402
from server.tests.island_sql.test_wave_treasury_settlement_sql import (  # noqa: E402
    close,
    freeze,
    ready_protocol_two_wave,
)


def test_persisted_shared_target_refuses_legacy_start_before_creating_a_wave(database):
    owner, _, _, _ = ready(database)
    as_server(database)
    assert start(database, owner, "shared-old01", owner=owner) == {
        "status": "refused",
        "reason": "economy_context_required",
    }
    assert (
        database.execute(
            "select count(*) from public.wave_runs where island_owner=%s", (owner,)
        ).fetchone()[0]
        == 0
    )


def test_managed_captain_cannot_start_an_old_wave_on_a_legacy_island(database):
    actor, legacy_owner, _, _, _ = initialized(database)
    open_island(database, legacy_owner, "P6W8X")
    rpc(database, "game_join", actor, legacy_owner, 10)
    assert start(database, actor, "managed-old01", owner=legacy_owner) == {
        "status": "refused",
        "reason": "personal_captain_managed",
    }


ENTRIES = (
    "start",
    "join",
    "current",
    "finish8",
    "finish11",
    "revive",
    "revive_charge",
    "recovery_start",
    "recovery_join",
    "recovery_current",
    "recovery_finish",
    "inputs3",
    "inputs4",
    "events_page",
    "report_health",
    "recovery_revive",
)


def old_call(connection, entry, actor, owner, wave, epoch, snapshot):
    start_args = (actor, "fenced-start01", "island", owner, 42, 0, 0, 900, 50, "calm", 1, 0)
    finish_args = (actor, wave, True, 7, 10, 5, 5, 20)
    revive_args = (actor, wave, "captain", 0, "fenced-revive01", 1, 1)
    json_args = Jsonb({})
    names = {
        "start": ("wave_start", start_args),
        "join": ("wave_join", (actor, wave)),
        "current": ("wave_current", ("island", owner)),
        "finish8": ("wave_finish", finish_args),
        "finish11": ("wave_finish", (*finish_args, 5, 2, 2)),
        "revive": ("wave_revive", revive_args),
        "revive_charge": ("wave_revive_charge", revive_args),
        "recovery_start": (
            "recovery_wave_start",
            (*start_args, ["structure_recovery"], Jsonb(snapshot), True, 2),
        ),
        "recovery_join": ("recovery_wave_join", (actor, wave, 2)),
        "recovery_current": ("recovery_wave_current", (actor, "island", owner, 2)),
        "recovery_finish": (
            "recovery_wave_finish",
            (*finish_args, 5, 2, 2, epoch, "fenced-finish01", 0, 0, 0, json_args, json_args),
        ),
        "inputs3": ("recovery_wave_inputs", (actor, wave, Jsonb([]))),
        "inputs4": ("recovery_wave_inputs", (actor, wave, Jsonb([]), False)),
        "events_page": ("recovery_wave_events_page", (actor, wave, 0)),
        "report_health": (
            "recovery_wave_report_health",
            (actor, wave, epoch, "fenced-health01", 0, 0, 0, json_args, json_args),
        ),
        "recovery_revive": ("recovery_wave_revive", (*revive_args, 0.0, 0.0)),
    }
    name, arguments = names[entry]
    as_server(connection)
    return rpc(connection, name, *arguments)


def wave_storage(connection, wave):
    return connection.execute(
        "select to_jsonb(r),to_jsonb(s),"
        "(select jsonb_agg(to_jsonb(p) order by player_id) from public.wave_participants p "
        "where p.wave_id=r.id),"
        "(select jsonb_agg(to_jsonb(p) order by player_id) "
        "from public.recovery_wave_participants p "
        "where p.wave_id=r.id) from public.wave_runs r "
        "join public.recovery_wave_states s on s.wave_id=r.id where r.id=%s",
        (wave,),
    ).fetchone()


@pytest.mark.parametrize("entry", ENTRIES)
@pytest.mark.parametrize("admission", ["active", "paused"])
def test_every_old_entry_refuses_any_persisted_shared_target_without_effect(
    database, entry, admission
):
    wave, epoch = two_player_wave(database)
    # A legal admission cannot cross an active legacy wave. Keep its genuine closed
    # history and use a member without a retained participant receipt for refusals.
    close_wave(database, wave, epoch)
    add_players(database, VETERAN)
    open_island(database, VETERAN, "R7S8T")
    rpc(database, "game_join", VETERAN, OWNER, 10)
    snapshot = template(database)
    admitted = rpc(database, "island_treasury_admit", OWNER, OWNER, "admit-old01", 200)
    assert admitted["status"] == "done", admitted
    as_owner(database)
    database.execute(
        "update public.island_economy_state set admission_state=%s where island_owner=%s",
        (admission, OWNER),
    )
    before = wave_storage(database, wave), balance(database, OWNER), balance(database, FRIEND)
    assert old_call(database, entry, VETERAN, OWNER, wave, epoch, snapshot) == {
        "status": "refused",
        "reason": "economy_context_required",
    }
    assert (
        wave_storage(database, wave),
        balance(database, OWNER),
        balance(database, FRIEND),
    ) == before
    assert (
        database.execute(
            "select count(*) from public.wave_runs where island_owner=%s", (OWNER,)
        ).fetchone()[0]
        == 1
    )


@pytest.mark.parametrize("entry", [entry for entry in ENTRIES if entry != "current"])
def test_managed_actor_cannot_use_any_old_control_on_a_legacy_target(database, entry):
    wave, epoch = two_player_wave(database)
    snapshot = template(database)
    actor, _, _, _, _ = initialized(database)
    assert old_call(database, entry, actor, OWNER, wave, epoch, snapshot) == {
        "status": "refused",
        "reason": "personal_captain_managed",
    }


def test_original_aliases_stay_private_and_do_not_recapture_wrappers_on_reapplication(database):
    rows = database.execute(
        "select p.oid::regprocedure::text,p.proname,p.pronargdefaults,p.prosrc "
        "from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
        "where n.nspname='public' and p.proname like 'legacy_wave_fence_%' "
        "and p.proname not in ('legacy_wave_fence_gate_locked','legacy_wave_fence_retained')",
    ).fetchall()
    assert len(rows) == 16  # The complete migration chain has already been applied twice.
    for signature, name, defaults, source in rows:
        assert "legacy_wave_fence_gate_locked" not in source
        for role in ("anon", "authenticated", "service_role"):
            assert not database.execute(
                "select has_function_privilege(%s,%s,'execute')", (role, signature)
            ).fetchone()[0]
        public_signature = signature.replace(name, name.removeprefix("legacy_wave_fence_"), 1)
        assert database.execute(
            "select has_function_privilege('service_role',%s,'execute'),prosecdef,pronargdefaults "
            "from pg_proc where oid=to_regprocedure(%s)",
            (public_signature, public_signature),
        ).fetchone() == (True, True, defaults)
    assert not database.execute(
        "select has_function_privilege('service_role',"
        "'public.recovery_wave_finish_before_reward_recovery(uuid,uuid,boolean,integer,integer,"
        "integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb)',"
        "'execute')",
    ).fetchone()[0]


def wait_for_lock(connection, pid, kind):
    deadline, pause = monotonic() + 5, Event()
    while monotonic() < deadline:
        if connection.execute(
            "select exists(select 1 from pg_locks where pid=%s and not granted and locktype=%s)",
            (pid, kind),
        ).fetchone()[0]:
            return
        pause.wait(0.01)
    pytest.fail(f"The old entry did not wait for its {kind} fence.")


def test_old_start_waits_for_target_admission_before_any_legacy_effect(database, scratch_server):
    owner, member, _, _ = ready(database, admitted=False)
    database.commit()
    with (
        psycopg.connect(scratch_server.get_uri()) as admission,
        psycopg.connect(scratch_server.get_uri()) as old,
        psycopg.connect(scratch_server.get_uri(), autocommit=True) as observer,
    ):
        assert (
            rpc(admission, "island_treasury_admit", owner, owner, "race-admit01", 200)["status"]
            == "done"
        )
        pid = old.info.backend_pid
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(start, old, member, "race-legacy01", owner=owner)
            wait_for_lock(observer, pid, "advisory")
            admission.commit()
            assert future.result(timeout=10) == {
                "status": "refused",
                "reason": "economy_context_required",
            }
            old.commit()
    assert (
        database.execute(
            "select count(*) from public.wave_runs where island_owner=%s", (owner,)
        ).fetchone()[0]
        == 0
    )


def test_foreign_target_adoption_serializes_before_old_wallet_island_work(database, scratch_server):
    legacy_owner, actor, _, _ = ready(database, admitted=False)
    adopted_owner, _, _, treasury = ready(database)
    open_island(database, actor, "A7B8C")
    rpc(database, "game_join", actor, adopted_owner, 10)
    database.commit()
    with (
        psycopg.connect(scratch_server.get_uri()) as adoption,
        psycopg.connect(scratch_server.get_uri()) as old,
        psycopg.connect(scratch_server.get_uri(), autocommit=True) as observer,
    ):
        assert (
            rpc(
                adoption,
                "personal_captain_initialize",
                actor,
                adopted_owner,
                keys(treasury)[1],
                Jsonb(configuration(load_island())),
            )["status"]
            == "ok"
        )
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(start, old, actor, "race-managed01", owner=legacy_owner)
            wait_for_lock(observer, old.info.backend_pid, "transactionid")
            adoption.commit()
            assert future.result(timeout=10) == {
                "status": "refused",
                "reason": "personal_captain_managed",
            }
            old.commit()
    assert (
        database.execute(
            "select count(*) from public.wave_runs where island_owner=%s", (legacy_owner,)
        ).fetchone()[0]
        == 0
    )


@pytest.mark.parametrize("recover_first", [True, False])
def test_closed_personal_protocol_two_reward_survives_adoption_and_replays_once(
    database,
    recover_first,
):
    wave, epoch = two_player_wave(database)
    closed, prefix = close_wave(database, wave, epoch)
    treasury = rpc(database, "island_treasury_admit", FRIEND, FRIEND, "admit-saved01", 200)
    rpc(
        database,
        "personal_captain_initialize",
        FRIEND,
        FRIEND,
        keys(treasury)[1],
        Jsonb(configuration(load_island())),
    )
    if recover_first:
        result = call(database, "select public.recovery_wave_recover_rewards(%s)", FRIEND)
        assert len(result["recovered"]) == 1 and result["coins"] == 100 + closed["loot"]
    replay = call(
        database,
        FINISH,
        FRIEND,
        wave,
        not recover_first,  # Already paid replay retains the saved win even with changed input.
        epoch,
        "saved-replay01",
        prefix["sealedThroughTick"],
        prefix["headSeq"],
    )
    assert replay["survived"] is True and replay["loot"] == closed["loot"]
    assert (
        call(database, "select public.recovery_wave_recover_rewards(%s)", FRIEND)["recovered"] == []
    )
    assert balance(database, FRIEND) == 100 + closed["loot"]
    assert len(ledger(database, FRIEND, "pirate_loot")) == 1


def test_real_closed_shared_hp_is_excluded_from_legacy_reward_selection(database):
    # Private storage setup supplies the actual Captain/accounting/HP hooks. This
    # is a domain composition check, not an authenticated native bell acceptance.
    wave = ready_protocol_two_wave(database)
    freeze(database, wave)
    as_owner(database)
    move_start(database, wave.id, 1000)
    as_owner(database)
    database.execute(
        "select public.structure_recovery_settle_locked(%s,clock_timestamp())", (wave.owner,)
    )
    assert database.execute(
        "select r.finished_at is not null,s.closed_at is not null,jsonb_typeof(s.closed_hp),"
        "s.initial_snapshot->>'waveId'=r.id::text,"
        "s.initial_snapshot->>'islandEpoch'=s.reset_epoch::text "
        "from public.wave_runs r join public.recovery_wave_states s "
        "on s.wave_id=r.id where r.id=%s",
        (wave.id,),
    ).fetchone() == (True, True, "object", True, True)
    assert not rpc(database, "recovery_wave_reward_is_closed", wave.id)
    as_server(database)
    result = rpc(database, "recovery_wave_recover_rewards", wave.member)
    assert result["recovered"] == [] and result["hasMore"] is False
    assert balance(database, wave.member) == 100
    assert database.execute(
        "select finished_at from public.wave_participants where wave_id=%s and player_id=%s",
        (wave.id, wave.member),
    ).fetchone() == (None,)
    assert close(database, wave, "expired")["lootCoins"] == "0"
