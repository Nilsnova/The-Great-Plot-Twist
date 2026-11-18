"""Disposable PostgreSQL regressions for atomic paid revival, used by issue #466."""

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
)
from server.tests.island_sql.test_recovery_wave_end_sql import (  # noqa: E402
    PAGE,
    move_start,
    two_player_wave,
)

REVIVE = (
    "select public.recovery_wave_revive(%s,%s,%s,10,%s,20,5,"
    "1::double precision,2::double precision)"
)


def context(database, target_player=FRIEND):
    wave_id, _ = two_player_wave(database)
    target = database.execute(
        "select participant_token from public.recovery_wave_participants "
        "where wave_id=%s and player_id=%s",
        (wave_id, target_player),
    ).fetchone()[0]
    return wave_id, str(target)


def events(database, wave_id):
    return database.execute(
        "select effective_tick,payload from public.recovery_wave_events "
        "where wave_id=%s and event_kind='captain_revive' order by seq",
        (wave_id,),
    ).fetchall()


def test_paid_revive_is_in_the_journal_after_a_reload_without_another_input(database):
    wave_id, target = context(database)
    first_page = call(database, PAGE, OWNER, wave_id, 0)
    before = balance(database, OWNER)
    paid = call(database, REVIVE, OWNER, wave_id, target, "paidrevive01")

    assert paid == {
        "status": "done",
        "price": 25,
        "balance": before - 25,
        "repeat": False,
        "journaled": True,
    }
    [(effective_tick, payload)] = events(database, wave_id)
    assert effective_tick > first_page["sealedThroughTick"]
    assert payload["command"] == {
        "type": "captain_revive",
        "targetId": target,
        "downAt": 10,
        "x": 1,
        "z": 2,
    }
    assert payload["captain"]["level"] == 1
    assert "skills" in payload["captain"]
    assert "actorCounter" not in payload
    assert ledger(database, OWNER, "captain_revive") == [(-25, "revive:paidrevive01")]
    # The browser is gone: a different participant's next read still receives the paid effect.
    move_start(database, wave_id, 22)
    reloaded = call(database, PAGE, FRIEND, wave_id, 0)
    assert any(event["type"] == "captain_revive" for event in reloaded["events"])


def test_lost_response_repeat_and_a_second_helper_never_duplicate_payment_or_event(database):
    wave_id, _ = context(database)
    as_owner(database)
    add_players(database, VETERAN)
    open_island(database, VETERAN, "X9W8V")
    as_owner(database)
    database.execute(
        "insert into public.island_members(island_owner,player_id,role) values (%s,%s,'member')",
        (OWNER, VETERAN),
    )
    as_server(database)
    joined = call(database, "select public.recovery_wave_join(%s,%s,2::smallint)", VETERAN, wave_id)
    target = joined["participantToken"]
    paid = call(database, REVIVE, OWNER, wave_id, target, "paidrevive01")
    repeated = call(database, REVIVE, OWNER, wave_id, target, "paidrevive01")
    assert repeated == {**paid, "repeat": True}
    second = call(database, REVIVE, FRIEND, wave_id, target, "paidrevive02")
    assert second == {"status": "refused", "reason": "already_up"}
    assert len(events(database, wave_id)) == 1
    assert ledger(database, FRIEND, "captain_revive") == []
    assert len(ledger(database, OWNER, "captain_revive")) == 1


def test_old_client_cannot_pay_for_a_recovery_revive_without_journaling_it(database):
    wave_id, target = context(database)
    answer = call(
        database,
        "select public.wave_revive(%s,%s,%s,10,%s,20,5)",
        OWNER,
        wave_id,
        target,
        "paidrevive01",
    )
    assert answer == {"status": "refused", "reason": "client_update_required"}
    assert ledger(database, OWNER, "captain_revive") == []
    assert events(database, wave_id) == []


def test_a_paid_repeat_survives_closed_wave_and_membership_change(database):
    wave_id, target = context(database, target_player=OWNER)
    # The friend pays, so we can remove their membership after the transaction succeeds.
    paid = call(database, REVIVE, FRIEND, wave_id, target, "paidrevive01")
    as_owner(database)
    database.execute(
        "update public.island_members set left_at=now() where island_owner=%s and player_id=%s",
        (OWNER, FRIEND),
    )
    database.execute(
        "update public.recovery_wave_states set closed_at=now(),closed_hp='{}'::jsonb "
        "where wave_id=%s",
        (wave_id,),
    )
    as_server(database)
    assert call(database, REVIVE, FRIEND, wave_id, target, "paidrevive01") == {
        **paid,
        "repeat": True,
    }
    assert len(events(database, wave_id)) == 1
    assert len(ledger(database, FRIEND, "captain_revive")) == 1


def test_a_revive_past_the_last_journal_tick_changes_nothing(database):
    wave_id, target = context(database)
    move_start(database, wave_id, 900)
    assert call(database, REVIVE, OWNER, wave_id, target, "paidrevive01") == {
        "status": "refused",
        "reason": "wave_over",
    }
    assert events(database, wave_id) == []
    assert ledger(database, OWNER, "captain_revive") == []


def test_event_append_failure_rolls_back_the_receipt_and_payment(database):
    wave_id, target = context(database)
    before = balance(database, OWNER)
    as_owner(database)
    database.execute("""
        create function public.reject_test_revive() returns trigger language plpgsql as $$
        begin
          if new.event_kind = 'captain_revive' then raise exception 'test_append_failure'; end if;
          return new;
        end; $$;
        create trigger reject_test_revive before insert on public.recovery_wave_events
        for each row execute function public.reject_test_revive();
    """)
    as_server(database)
    with pytest.raises(psycopg.Error, match="test_append_failure"), database.transaction():
        call(database, REVIVE, OWNER, wave_id, target, "paidrevive01")
    assert balance(database, OWNER) == before
    assert ledger(database, OWNER, "captain_revive") == []
    assert events(database, wave_id) == []
    assert (
        database.execute(
            "select count(*) from public.captain_revives where wave_id=%s",
            (wave_id,),
        ).fetchone()[0]
        == 0
    )


def test_uuid_case_does_not_create_an_unreplayable_target_or_a_second_fall_key(database):
    wave_id, target = context(database)
    paid = call(database, REVIVE, OWNER, wave_id, target.upper(), "paidrevive01")
    assert paid["journaled"] is True
    assert events(database, wave_id)[0][1]["command"]["targetId"] == target
    assert call(database, REVIVE, OWNER, wave_id, target, "paidrevive01")["repeat"] is True
    assert len(events(database, wave_id)) == 1
    assert (
        database.execute(
            "select last_actor_counter from public.recovery_wave_participants "
            "where wave_id=%s and player_id=%s",
            (wave_id, OWNER),
        ).fetchone()[0]
        == 0
    )


def test_a_closed_wave_or_insufficient_coins_never_adds_a_receipt_or_event(database):
    wave_id, target = context(database)
    as_owner(database)
    database.execute("update public.wallets set balance=0 where player_id=%s", (OWNER,))
    as_server(database)
    assert call(database, REVIVE, OWNER, wave_id, target, "paidrevive01") == {
        "status": "refused",
        "reason": "insufficient_funds",
        "price": 25,
    }
    as_owner(database)
    database.execute(
        "update public.recovery_wave_states set closed_at=now(),closed_hp='{}'::jsonb "
        "where wave_id=%s",
        (wave_id,),
    )
    as_server(database)
    assert call(database, REVIVE, OWNER, wave_id, target, "paidrevive01") == {
        "status": "refused",
        "reason": "wave_over",
    }
    assert events(database, wave_id) == []
    assert ledger(database, OWNER, "captain_revive") == []


def test_the_atomic_rpc_and_charge_helper_are_server_only(database):
    for signature in (
        "public.recovery_wave_revive(uuid,uuid,text,integer,text,integer,integer,"
        "double precision,double precision)",
        "public.wave_revive_charge(uuid,uuid,text,integer,text,integer,integer)",
    ):
        assert database.execute(
            "select has_function_privilege('anon',%s,'execute'), "
            "has_function_privilege('authenticated',%s,'execute'), "
            "has_function_privilege('service_role',%s,'execute')",
            (signature,) * 3,
        ).fetchone() == (False, False, True)
