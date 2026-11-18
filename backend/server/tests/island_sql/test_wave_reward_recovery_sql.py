"""Real PostgreSQL recovery of saved wave rewards, used by the return/reconnect task."""

import json
import threading
from uuid import UUID

import pytest

psycopg = pytest.importorskip("psycopg")

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
from server.tests.island_sql.test_recovery_wave_end_sql import (  # noqa: E402
    FINISH,
    PAGE,
    move_start,
    ring,
    template,
    two_player_wave,
)

RECOVER = "select public.recovery_wave_recover_rewards(%s)"


def close_wave(database, wave_id, epoch, survived=True):
    page = call(database, PAGE, OWNER, wave_id, 0)
    answer = call(
        database,
        FINISH,
        OWNER,
        wave_id,
        survived,
        epoch,
        "firstclose01",
        page["sealedThroughTick"],
        page["headSeq"],
    )
    assert answer["status"] == "done", answer
    return answer, page


def history(database, count):
    """Use real start/join/finish RPCs for distinct waves, with complete test-only wave config."""
    wave_id, epoch = two_player_wave(database)
    wave_ids = []
    for index in range(count):
        if index:
            config = template(database)
            config["eventByWave"] = {str(wave): None for wave in range(1, 51)}
            config["bossByWave"] = {str(wave): False for wave in range(1, 51)}
            started = call(
                database,
                "select public.recovery_wave_start(%s,%s,'island',%s,4242,0,0,900,50,"
                "'calm',1,0,%s::text[],%s::jsonb,true,2::smallint)",
                OWNER,
                f"return-wave-{index:04d}",
                OWNER,
                ["structure_recovery"],
                json.dumps(config),
            )
            assert started["status"] == "started", started
            wave_id = UUID(started["waveId"])
            move_start(database, wave_id, 20)
            joined = call(
                database, "select public.recovery_wave_join(%s,%s,2::smallint)", FRIEND, wave_id
            )
            assert joined["status"] == "joined", joined
        close_wave(database, wave_id, epoch)
        wave_ids.append(str(wave_id))
    return wave_ids


def test_recovers_a_saved_win_after_reload_deadline_new_epoch_and_leaving(database):
    wave_id, epoch = two_player_wave(database)
    first, _ = close_wave(database, wave_id, epoch)
    as_owner(database)
    database.execute(
        "update public.island_members set left_at=now() where island_owner=%s and player_id=%s",
        (OWNER, FRIEND),
    )
    move_start(database, wave_id, 2000)
    newer = ring(database, "newwave-after-return")
    assert newer["status"] == "started", newer
    as_owner(database)
    database.execute(
        "update public.island_recovery_state set reset_epoch=gen_random_uuid() "
        "where island_owner=%s",
        (OWNER,),
    )
    before = database.execute(
        "select row_to_json(i),row_to_json(s) from public.islands i "
        "join public.island_recovery_state s on s.island_owner=i.player_id "
        "where i.player_id=%s",
        (OWNER,),
    ).fetchone()
    as_server(database)
    recovered = call(database, RECOVER, FRIEND)
    assert recovered == {
        "status": "done",
        "coins": 100 + first["loot"],
        "wonWaveBest": 1,
        "recovered": [{"waveId": str(wave_id), "wave": 1, "survived": True, "loot": first["loot"]}],
        "hasMore": False,
    }
    assert call(database, RECOVER, FRIEND) == {**recovered, "recovered": []}
    assert len(ledger(database, FRIEND, "pirate_loot")) == 1
    assert (
        database.execute(
            "select row_to_json(i),row_to_json(s) from public.islands i "
            "join public.island_recovery_state s on s.island_owner=i.player_id "
            "where i.player_id=%s",
            (OWNER,),
        ).fetchone()
        == before
    )


@pytest.mark.parametrize("survived,expired", [(False, False), (False, True)])
def test_closed_losses_and_expiry_settle_zero_without_a_wallet_entry(database, survived, expired):
    wave_id, epoch = two_player_wave(database)
    close_wave(database, wave_id, epoch, survived)
    if expired:
        as_owner(database)
        database.execute("update public.wave_runs set expired=true where id=%s", (wave_id,))
        as_server(database)
    answer = call(database, RECOVER, FRIEND)
    assert answer["coins"] == 100 and answer["wonWaveBest"] == 0
    assert answer["recovered"] == [
        {"waveId": str(wave_id), "wave": 1, "survived": False, "loot": 0}
    ]
    assert ledger(database, FRIEND, "pirate_loot") == []
    assert database.execute(
        "select expired from public.wave_participants where wave_id=%s and player_id=%s",
        (wave_id, FRIEND),
    ).fetchone() == (expired,)


def test_open_waves_outsiders_and_malformed_closes_are_not_paid(database):
    wave_id, epoch = two_player_wave(database)
    assert call(database, RECOVER, FRIEND)["recovered"] == []
    close_wave(database, wave_id, epoch)
    add_players(database, VETERAN)
    open_island(database, VETERAN, "R4W5X")
    assert call(database, RECOVER, VETERAN)["recovered"] == []
    as_owner(database)
    database.execute("alter table public.recovery_wave_states disable trigger user")
    database.execute(
        "update public.recovery_wave_states set closed_hp='[]'::jsonb where wave_id=%s", (wave_id,)
    )
    database.execute("alter table public.recovery_wave_states enable trigger user")
    as_server(database)
    assert call(database, RECOVER, FRIEND)["recovered"] == []
    assert balance(database, FRIEND) == 100
    assert ledger(database, FRIEND, "pirate_loot") == []


def test_recovery_drains_more_than_twenty_saved_participations_in_bounded_batches(database):
    wave_ids = history(database, 23)
    first = call(database, RECOVER, FRIEND)
    second = call(database, RECOVER, FRIEND)
    assert len(first["recovered"]) == 20 and first["hasMore"] is True
    assert len(second["recovered"]) == 3 and second["hasMore"] is False
    assert [row["waveId"] for row in first["recovered"] + second["recovered"]] == sorted(wave_ids)
    assert len(ledger(database, FRIEND, "pirate_loot")) == 23
    assert call(database, RECOVER, FRIEND)["recovered"] == []


def test_malformed_old_rows_do_not_starve_valid_rewards_or_keep_has_more_true(database):
    wave_ids = history(database, 25)
    as_owner(database)
    database.execute("alter table public.recovery_wave_states disable trigger user")
    database.execute(
        "update public.recovery_wave_states set closed_hp='[]'::jsonb "
        "where wave_id=any(%s::uuid[])",
        (wave_ids[:-1],),
    )
    database.execute("alter table public.recovery_wave_states enable trigger user")
    database.execute(
        "update public.wave_participants set joined_at=joined_at-interval '1 day' "
        "where wave_id=any(%s::uuid[]) and player_id=%s",
        (wave_ids[:-1], FRIEND),
    )
    as_server(database)
    answer = call(database, RECOVER, FRIEND)
    assert [row["waveId"] for row in answer["recovered"]] == [wave_ids[-1]]
    assert answer["hasMore"] is False
    again = call(database, RECOVER, FRIEND)
    assert again["recovered"] == [] and again["hasMore"] is False


@pytest.mark.parametrize("field", ["waveId", "islandEpoch"])
def test_a_close_with_mismatched_frozen_identity_is_excluded(database, field):
    wave_id, epoch = two_player_wave(database)
    close_wave(database, wave_id, epoch)
    as_owner(database)
    database.execute("alter table public.recovery_wave_states disable trigger user")
    database.execute(
        "update public.recovery_wave_states set initial_snapshot=jsonb_set(initial_snapshot,"
        "array[%s],to_jsonb(gen_random_uuid()::text)) where wave_id=%s",
        (field, wave_id),
    )
    database.execute("alter table public.recovery_wave_states enable trigger user")
    as_server(database)
    assert call(database, RECOVER, FRIEND) == {
        "status": "done",
        "coins": 100,
        "wonWaveBest": 0,
        "recovered": [],
        "hasMore": False,
    }


def test_legacy_wins_do_not_infer_an_unfinished_participants_outcome(database):
    add_players(database, VETERAN, FRIEND)
    open_island(database, VETERAN, "M2G3C")
    open_island(database, FRIEND, "F4R5N")
    as_owner(database)
    database.execute(
        "insert into public.island_members(island_owner,player_id,role) values (%s,%s,'member')",
        (VETERAN, FRIEND),
    )
    started = start(database, VETERAN, "legacy-return01", owner=VETERAN)
    wave_id = UUID(started["waveId"])
    assert call(database, "select public.wave_join(%s,%s)", FRIEND, wave_id)["status"] == "joined"
    as_owner(database)
    database.execute(
        "update public.wave_runs set starts_at=now()-interval '30 seconds' where id=%s", (wave_id,)
    )
    as_server(database)
    first = call(
        database, "select public.wave_finish(%s,%s,true,7,10,5,5,20,5,2,2)", VETERAN, wave_id
    )
    assert first["status"] == "done" and first["loot"] > 0
    assert call(database, RECOVER, FRIEND)["recovered"] == []
    assert balance(database, FRIEND) == 100


@pytest.mark.parametrize("recover_first", [True, False])
def test_late_normal_finish_and_recovery_both_preserve_the_saved_win(database, recover_first):
    wave_id, epoch = two_player_wave(database)
    first, prefix = close_wave(database, wave_id, epoch)
    move_start(database, wave_id, 2000)
    if recover_first:
        assert len(call(database, RECOVER, FRIEND)["recovered"]) == 1
    finished = call(
        database,
        FINISH,
        FRIEND,
        wave_id,
        False,
        epoch,
        "latefinish01",
        prefix["sealedThroughTick"],
        prefix["headSeq"],
    )
    assert finished["survived"] is True and finished["loot"] == first["loot"]
    assert finished["expired"] is False and finished["recovery"] == first["recovery"]
    repeated = call(database, RECOVER, FRIEND)
    assert repeated["recovered"] == [] and repeated["coins"] == 100 + first["loot"]
    assert len(ledger(database, FRIEND, "pirate_loot")) == 1


@pytest.mark.parametrize("second_recovery", [False, True])
def test_concurrent_recoveries_and_late_normal_finish_pay_once(
    scratch_server, database, second_recovery
):
    wave_id, epoch = two_player_wave(database)
    first, prefix = close_wave(database, wave_id, epoch)
    move_start(database, wave_id, 2000)
    database.commit()
    barrier, answers, failures = threading.Barrier(2), {}, []

    def run(name, statement, arguments):
        try:
            with psycopg.connect(scratch_server.get_uri()) as connection:
                as_server(connection)
                connection.execute("set local lock_timeout='5s'")
                barrier.wait(timeout=5)
                answers[name] = call(connection, statement, *arguments)
                connection.commit()
        except Exception as error:  # asserted empty below
            failures.append(error)

    other_statement = RECOVER if second_recovery else FINISH
    other_arguments = (
        (FRIEND,)
        if second_recovery
        else (
            FRIEND,
            wave_id,
            False,
            epoch,
            "racingfinish01",
            prefix["sealedThroughTick"],
            prefix["headSeq"],
        )
    )
    workers = [
        threading.Thread(target=run, args=("recover", RECOVER, (FRIEND,))),
        threading.Thread(target=run, args=("other", other_statement, other_arguments)),
    ]
    try:
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=8)
        assert all(not worker.is_alive() for worker in workers)
        assert failures == []
        if second_recovery:
            assert sum(len(answer["recovered"]) for answer in answers.values()) == 1
        else:
            assert answers["other"]["loot"] == first["loot"]
        assert answers["recover"]["coins"] == 100 + first["loot"]
        as_server(database)
        assert balance(database, FRIEND) == 100 + first["loot"]
        assert len(ledger(database, FRIEND, "pirate_loot")) == 1
        database.rollback()
    finally:
        with psycopg.connect(scratch_server.get_uri(), autocommit=True) as cleanup:
            cleanup.execute("delete from auth.users where id=any(%s::uuid[])", ([OWNER, FRIEND],))


def test_recovery_rpc_is_service_only_and_has_a_pending_player_index(database):
    as_owner(database)
    names = [
        "recovery_wave_reward_is_closed",
        "recovery_wave_recover_reward_locked",
        "recovery_wave_recover_rewards",
        "recovery_wave_finish_before_reward_recovery",
        "recovery_wave_finish",
    ]
    for role in ("anon", "authenticated", "service_role"):
        allowed = database.execute(
            "select has_function_privilege(%s,p.oid,'execute') from pg_proc p "
            "where p.pronamespace='public'::regnamespace and p.proname=any(%s::text[])",
            (role, names),
        ).fetchall()
        assert len(allowed) == len(names)
        assert all(row[0] is (role == "service_role") for row in allowed)
    definition = database.execute(
        "select indexdef from pg_indexes where schemaname='public' "
        "and indexname='wave_participants_pending_player_idx'"
    ).fetchone()[0]
    assert "player_id" in definition and "finished_at IS NULL" in definition
