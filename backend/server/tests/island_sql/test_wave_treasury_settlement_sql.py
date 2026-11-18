"""Shared wave money and real personal completion hooks on disposable PostgreSQL.

The full migration chain is applied twice. No live database, credentials or browser is used.
Private helpers stand for the enclosing canonical lifecycle transaction, not activated routes.
"""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from threading import Barrier
from uuid import UUID, uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island  # noqa: E402
from server.island.personal_captain import configuration  # noqa: E402
from server.island.wave_economy import freeze_reward_basis  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, money, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_owner,
    as_server,
    balance,
    finish,
)
from server.tests.island_sql.test_personal_captain_sql import (  # noqa: E402
    initialized,
    private,
)

TABLES = ("island_wave_accounting", "island_wave_participation_receipts",
          "island_wave_closures", "island_wave_completion_receipts")


@dataclass
class Wave:
    owner: UUID
    member: UUID
    outsider: UUID
    treasury: dict
    id: UUID
    roster: list
    basis: dict


def ready_wave(connection, *, played=5, countdown=0, houses=False, engineer=False,
               snapshot_played=None):
    owner, member, outsider, treasury, _ = initialized(connection)
    as_server(connection)
    rpc(connection, "personal_captain_initialize", member, owner, keys(treasury)[1],
        Jsonb(configuration(load_island())))
    as_owner(connection)
    connection.execute("update public.islands set next_wave=%s where player_id=%s", (played, owner))
    if houses:
        connection.execute("insert into public.islets(player_id,timber) values(%s,0) "
                           "on conflict do nothing", (owner,))
        connection.execute(
            "insert into public.islet_buildings(player_id,plot,building_type,level,"
            "coins_paid,timber_paid,ref) values(%s,'house_1','house',1,10,0,'fixture-house-1'),"
            "(%s,'house_2','house',2,20,0,'fixture-house-2')", (owner, owner),
        )
    if engineer:
        private(connection, "personal_captain_bind_engineer_locked", owner)
    as_server(connection)
    started = rpc(connection, "wave_start", owner, "wave_start_001", "island", owner,
                  42, countdown, 0, 900, 100, "calm", 1, 0)
    wave_id = UUID(started["waveId"])
    as_owner(connection)
    if not countdown:
        connection.execute(
            "update public.wave_runs set starts_at=clock_timestamp()-interval '2 seconds' "
            "where id=%s", (wave_id,),
        )
    roster = []
    for player in (owner, member):
        frozen = private(connection, "personal_captain_attach_wave_locked", player, wave_id,
                         played if snapshot_played is None else snapshot_played)
        roster.append({"playerId": str(player), "controllingSessionId": str(uuid4()),
                       "engineerCommitmentId": frozen["engineerCommitmentId"]})
    basis = freeze_reward_basis(load_island(), played_wave=played, seed=42,
                                house_levels=3 if houses else 0).envelope()
    return Wave(owner, member, outsider, treasury, wave_id, roster, basis)


def freeze(connection, wave):
    return private(connection, "island_wave_accounting_freeze_locked", wave.id,
                   *keys(wave.treasury), Jsonb(wave.roster), Jsonb(wave.basis))


def confirm(connection, wave, player):
    slot = next(item for item in wave.roster if item["playerId"] == str(player))
    return private(connection, "island_wave_confirm_participation_locked", wave.id,
                   player, slot["controllingSessionId"])


def close(connection, wave, outcome="won", bonuses=None):
    return private(connection, "island_wave_accounting_settle_locked", wave.id,
                   outcome, Jsonb(bonuses or []))


def expect_error(connection, text, function, *arguments):
    with pytest.raises(psycopg.Error, match=text), connection.transaction():
        return function(connection, *arguments)


def test_shared_accounting_tables_and_private_helpers_are_not_browser_writable(database):
    for table in TABLES:
        assert database.execute(
            "select relrowsecurity from pg_class where oid=to_regclass(%s)",
            ("public." + table,),
        ).fetchone() == (True,)
        for role in ("anon", "authenticated", "service_role"):
            assert database.execute("select has_table_privilege(%s,%s,'insert,update,delete')",
                                    (role, "public." + table)).fetchone() == (False,)
    for function in (
        "island_wave_accounting_freeze_locked(uuid,uuid,uuid,jsonb,jsonb)",
        "island_wave_confirm_participation_locked(uuid,uuid,uuid)",
        "island_wave_accounting_settle_locked(uuid,text,jsonb)",
    ):
        assert database.execute("select has_function_privilege('service_role',%s,'execute')",
                                ("public." + function,)).fetchone() == (False,)


def test_two_participants_produce_one_house_boss_reward_and_separate_receipts(database):
    wave = ready_wave(database, houses=True)
    wallets = (balance(database, wave.owner), balance(database, wave.member))
    assert freeze(database, wave)["repeat"] is False
    assert freeze(database, wave)["repeat"] is True
    confirm(database, wave, wave.owner)
    confirm(database, wave, wave.member)
    expected = freeze_reward_basis(load_island(), played_wave=5, seed=42, house_levels=3)
    first = close(database, wave, bonuses=["finisher", "finisher"])
    again = close(database, wave, bonuses=["finisher"])
    assert first["lootCoins"] == str(expected.reward_coins(["finisher"]))
    assert first["repeat"] is False and again["repeat"] is True
    assert first["treasuryReceiptId"] == again["treasuryReceiptId"]
    assert len(first["completions"]) == 2
    assert all(item["confirmedParticipation"] for item in first["completions"])
    assert (balance(database, wave.owner), balance(database, wave.member)) == wallets
    assert database.execute(
        "select action_uid from public.island_treasury_transactions where id=%s",
        (first["treasuryReceiptId"],),
    ).fetchone() == (
        f"sys_{wave.id.hex}_wave_loot",
    )
    assert database.execute(
        "select count(*) from public.island_treasury_transactions "
        "where account_id=%s and reason='pirate_loot'", (keys(wave.treasury)[0],),
    ).fetchone() == (1,)


def test_freeze_refuses_a_personal_snapshot_for_another_played_wave_atomically(database):
    with pytest.raises(psycopg.Error, match="captain_snapshot_conflict"), database.transaction():
        wave = ready_wave(database, played=5, snapshot_played=6, engineer=True)
        freeze(database, wave)
    assert database.execute("select count(*) from public.island_wave_accounting where wave_id=%s",
                            (wave.id,)).fetchone() == (0,)
    assert database.execute("select count(*) from public.personal_captain_wave_snapshots "
                            "where wave_id=%s", (wave.id,)).fetchone() == (0,)
    assert database.execute("select count(*) from public.wave_runs where id=%s",
                            (wave.id,)).fetchone() == (0,)


@pytest.mark.parametrize("expired", [False, True])
def test_new_participation_after_a_legacy_terminal_cannot_satisfy_engineer(database, expired):
    wave = ready_wave(database, engineer=True)
    freeze(database, wave)
    assert finish(database, wave.owner, wave.id, False)["loot"] == 0
    as_owner(database)
    database.execute("update public.wave_runs set expired=%s where id=%s", (expired, wave.id))
    expect_error(database, "wave_closed", confirm, wave, wave.owner)
    assert database.execute("select count(*) from public.island_wave_participation_receipts "
                            "where wave_id=%s", (wave.id,)).fetchone() == (0,)
    closure = close(database, wave, "expired" if expired else "lost")
    assert all(not item["confirmedParticipation"] for item in closure["completions"])
    profile = private(database, "personal_captain_snapshot_locked", wave.owner)
    assert profile["captain"]["engineerCommitment"]["id"] == wave.roster[0]["engineerCommitmentId"]


def test_existing_confirmation_replays_after_terminal_and_normal_completion_is_preserved(database):
    wave = ready_wave(database, engineer=True)
    freeze(database, wave)
    confirmed = confirm(database, wave, wave.owner)
    assert finish(database, wave.owner, wave.id, False)["loot"] == 0
    assert confirm(database, wave, wave.owner) == {**confirmed, "repeat": True}
    assert close(database, wave, "lost")["outcome"] == "lost"
    profile = private(database, "personal_captain_snapshot_locked", wave.owner)
    assert profile["captain"]["engineerCommitment"] is None
    assert confirm(database, wave, wave.owner) == {**confirmed, "repeat": True}


def test_the_played_low_wave_and_unchanged_wager_reserve_determine_the_credit(database):
    wave = ready_wave(database, played=2)
    as_server(database)
    held = rpc(database, "island_treasury_reserve", wave.member, *keys(wave.treasury),
               "wave_hold_01", "market_call_stake", "event:wave", 150, 0)
    assert money(held) == (200, 150, 50)
    freeze(database, wave)
    confirm(database, wave, wave.member)
    result = close(database, wave)
    amount = freeze_reward_basis(load_island(), played_wave=2, seed=42, house_levels=0)
    assert result["lootCoins"] == str(amount.reward_coins([]))
    funds = result["economy"]["treasury"]
    assert funds["committedCoins"] == "150"
    assert int(funds["availableCoins"]) == 50 + amount.reward_coins([])


def test_a_separately_played_repeat_attempt_pays_again_without_extra_personal_points(database):
    wave = ready_wave(database, played=2)
    freeze(database, wave)
    confirm(database, wave, wave.member)
    first = close(database, wave)
    before = private(database, "personal_captain_snapshot_locked", wave.member)
    as_owner(database)
    database.execute("update public.wave_runs set finished_at=clock_timestamp(),survived=true,"
                     "ships_sunk=0,loot=0 where id=%s", (wave.id,))
    database.execute("update public.islands set next_wave=2 where player_id=%s", (wave.owner,))
    as_server(database)
    started = rpc(database, "wave_start", wave.owner, "wave_start_002", "island", wave.owner,
                  42, 0, 0, 900, 100, "calm", 1, 0)
    second_id = UUID(started["waveId"])
    as_owner(database)
    database.execute("update public.wave_runs set starts_at=clock_timestamp()-interval '2 seconds' "
                     "where id=%s", (second_id,))
    roster = []
    for player in (wave.owner, wave.member):
        snapshot = private(database, "personal_captain_attach_wave_locked", player, second_id, 2)
        roster.append({"playerId": str(player), "controllingSessionId": str(uuid4()),
                       "engineerCommitmentId": snapshot["engineerCommitmentId"]})
    second = Wave(wave.owner, wave.member, wave.outsider, wave.treasury,
                  second_id, roster, wave.basis)
    freeze(database, second)
    confirm(database, second, second.member)
    result = close(database, second)
    assert result["lootCoins"] == first["lootCoins"]
    assert int(result["economy"]["treasury"]["balanceCoins"]) == 200 + 2*int(first["lootCoins"])
    after = private(database, "personal_captain_snapshot_locked", wave.member)
    assert after["skills"]["earned"] == before["skills"]["earned"]


@pytest.mark.parametrize("outcome", ["lost", "abandoned", "expired"])
def test_terminal_non_wins_cannot_be_rewritten_to_add_late_loot(database, outcome):
    wave = ready_wave(database)
    freeze(database, wave)
    confirm(database, wave, wave.member)
    assert close(database, wave, outcome)["lootCoins"] == "0"
    expect_error(database, "wave_outcome_conflict", close, wave, "won")
    assert database.execute("select balance_coins from public.island_economy_accounts where id=%s",
                            (keys(wave.treasury)[0],)).fetchone() == (200,)


def test_countdown_only_and_wholly_absent_roster_slots_get_no_personal_reward(database):
    wave = ready_wave(database, countdown=300, engineer=True)
    freeze(database, wave)
    expect_error(database, "wave_not_started", confirm, wave, wave.owner)
    expect_error(database, "wave_not_started", close, wave, "won")
    result = close(database, wave, "abandoned")
    assert all(not receipt["confirmedParticipation"] for receipt in result["completions"])
    profile = private(database, "personal_captain_snapshot_locked", wave.owner)
    assert profile["captain"]["personalBestWave"] == 4
    assert profile["captain"]["engineerCommitment"] is not None


def test_an_absent_owner_gets_no_personal_milestone_from_a_members_confirmed_win(database):
    wave = ready_wave(database)
    freeze(database, wave)
    confirm(database, wave, wave.member)
    close(database, wave)
    owner = private(database, "personal_captain_snapshot_locked", wave.owner)
    member = private(database, "personal_captain_snapshot_locked", wave.member)
    assert owner["captain"]["personalBestWave"] == 4
    assert member["captain"]["personalBestWave"] == 5


def test_confirmed_departed_member_retains_receipt_without_a_second_payment(database):
    wave = ready_wave(database)
    freeze(database, wave)
    confirm(database, wave, wave.member)
    as_server(database)
    rpc(database, "game_leave", wave.member, wave.owner)
    first = close(database, wave)
    as_server(database)
    own = rpc(database, "island_wave_completion_receipt", wave.member, wave.id)
    assert own["receipt"]["confirmedParticipation"] is True
    assert own["receipt"]["playerId"] == str(wave.member)
    assert rpc(database, "island_wave_completion_receipt", wave.outsider, wave.id) == {
        "status": "refused", "reason": "not_in_wave",
    }
    assert close(database, wave)["treasuryReceiptId"] == first["treasuryReceiptId"]


def test_a_withdrawn_personal_assignment_cannot_confirm_through_an_old_slot(database):
    wave = ready_wave(database)
    freeze(database, wave)
    private(database, "personal_captain_release_assignment_locked", wave.member, wave.id)
    expect_error(database, "not_in_wave", confirm, wave, wave.member)


def test_normal_defeat_satisfies_only_frozen_engineer_generation_not_a_later_one(database):
    wave = ready_wave(database, engineer=True)
    original = wave.roster[0]["engineerCommitmentId"]
    assert original is not None
    freeze(database, wave)
    confirm(database, wave, wave.owner)
    close(database, wave, "lost")
    profile = private(database, "personal_captain_snapshot_locked", wave.owner)
    assert profile["captain"]["personalBestWave"] == 4
    assert profile["captain"]["engineerCommitment"] is None
    newer = private(database, "personal_captain_bind_engineer_locked", wave.owner)
    assert str(newer) != original
    close(database, wave, "lost")
    profile = private(database, "personal_captain_snapshot_locked", wave.owner)
    assert profile["captain"]["engineerCommitment"]["id"] == str(newer)


def test_delayed_old_completion_cannot_clear_new_purchase_generation_or_assignment(database):
    wave = ready_wave(database, engineer=True)
    original = wave.roster[0]["engineerCommitmentId"]
    freeze(database, wave)
    confirm(database, wave, wave.owner)
    private(database, "personal_captain_release_assignment_locked", wave.owner, wave.id)
    newer = private(database, "personal_captain_bind_engineer_locked", wave.owner)
    assert str(newer) != original
    next_wave = uuid4()
    private(database, "personal_captain_attach_wave_locked", wave.owner, next_wave, 6)
    close(database, wave, "lost")
    profile = private(database, "personal_captain_snapshot_locked", wave.owner)
    assert profile["captain"]["engineerCommitment"]["id"] == str(newer)
    assert profile["captain"]["assignmentWaveId"] == str(next_wave)


def test_missing_personal_completion_hook_rolls_back_treasury_and_all_close_receipts(database):
    wave = ready_wave(database)
    freeze(database, wave)
    confirm(database, wave, wave.owner)
    as_owner(database)
    database.execute(
        "drop function public.personal_captain_complete_locked(uuid,uuid,integer,text,boolean,uuid)"
    )
    expect_error(database, "personal_captain_complete_locked", close, wave)
    assert database.execute("select count(*) from public.island_wave_closures where wave_id=%s",
                            (wave.id,)).fetchone() == (0,)
    assert database.execute(
        "select count(*) from public.island_treasury_transactions "
        "where account_id=%s and reason='pirate_loot'", (keys(wave.treasury)[0],),
    ).fetchone() == (0,)


def test_personal_receipt_and_old_origin_survive_wave_deletion_and_new_run(database):
    wave = ready_wave(database)
    freeze(database, wave)
    confirm(database, wave, wave.member)
    first = close(database, wave)
    as_owner(database)
    new_account, new_epoch = uuid4(), uuid4()
    database.execute("delete from public.wave_runs where id=%s", (wave.id,))
    database.execute(
        "update public.island_economy_accounts set state='retired',retired_at=clock_timestamp() "
        "where id=%s", (keys(wave.treasury)[0],),
    )
    database.execute("insert into public.island_economy_accounts(id,island_owner,run_epoch) "
                     "values(%s,%s,%s)", (new_account, wave.owner, new_epoch))
    database.execute("update public.island_economy_state set current_account_id=%s,run_epoch=%s "
                     "where island_owner=%s", (new_account, new_epoch, wave.owner))
    again = close(database, wave)
    assert again["treasuryReceiptId"] == first["treasuryReceiptId"]
    assert again["economy"]["accountId"] == keys(wave.treasury)[0]
    as_server(database)
    assert rpc(database, "island_wave_completion_receipt", wave.member, wave.id)["status"] == "done"
    assert database.execute("select balance_coins from public.island_economy_accounts where id=%s",
                            (new_account,)).fetchone() == (0,)


def test_frozen_shared_attempt_rejects_a_private_payout(database):
    wave = ready_wave(database, played=2)
    freeze(database, wave)
    expect_error(database, "economy_context_required", finish, wave.owner, wave.id)
    assert database.execute(
        "select count(*) from public.wallet_transactions where reason='pirate_loot' "
        "and ref like %s", (f"wave:{wave.id}%",),
    ).fetchone() == (0,)


def test_an_attempt_that_already_paid_privately_cannot_be_reinterpreted_as_shared(database):
    wave = ready_wave(database, played=2)
    assert finish(database, wave.owner, wave.id)["loot"] > 0
    expect_error(database, "wave_accounting_already_closed", freeze, wave)
    assert database.execute("select count(*) from public.island_wave_accounting where wave_id=%s",
                            (wave.id,)).fetchone() == (0,)


def test_a_legacy_no_loot_defeat_cannot_later_become_a_shared_win(database):
    wave = ready_wave(database, played=2)
    freeze(database, wave)
    confirm(database, wave, wave.owner)
    result = finish(database, wave.owner, wave.id, False)
    assert result["loot"] == 0
    expect_error(database, "wave_outcome_conflict", close, wave, "won")
    assert close(database, wave, "lost")["lootCoins"] == "0"


def test_a_legacy_expiry_cannot_be_called_normal_defeat_to_clear_engineer(database):
    wave = ready_wave(database, played=2, engineer=True)
    freeze(database, wave)
    confirm(database, wave, wave.owner)
    as_owner(database)
    database.execute(
        "update public.wave_runs "
        "set starts_at=clock_timestamp()-interval '1000 seconds' where id=%s",
        (wave.id,),
    )
    assert finish(database, wave.owner, wave.id)["expired"] is True
    expect_error(database, "wave_outcome_conflict", close, wave, "lost")
    expect_error(database, "wave_outcome_conflict", close, wave, "won")
    close(database, wave, "expired")
    profile = private(database, "personal_captain_snapshot_locked", wave.owner)
    assert profile["captain"]["engineerCommitment"]["id"] == wave.roster[0]["engineerCommitmentId"]


@pytest.mark.parametrize("table", TABLES)
def test_shared_attempt_history_and_personal_receipts_cannot_be_rewritten(database, table):
    wave = ready_wave(database)
    freeze(database, wave)
    confirm(database, wave, wave.owner)
    close(database, wave)
    as_owner(database)
    with pytest.raises(psycopg.Error, match="island_treasury_receipt_immutable"):
        with database.transaction():
            database.execute(f"delete from public.{table} where wave_id=%s", (wave.id,))


def test_same_attempt_close_race_credits_once_and_applies_each_personal_effect_once(
    database, scratch_server,
):
    wave = ready_wave(database)
    freeze(database, wave)
    confirm(database, wave, wave.owner)
    confirm(database, wave, wave.member)
    database.commit()
    start_together = Barrier(2)

    def finish_same_attempt(_):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            start_together.wait(timeout=10)
            return close(connection, wave)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(finish_same_attempt, range(2)))
    assert sorted(result["repeat"] for result in results) == [False, True]
    assert results[0]["treasuryReceiptId"] == results[1]["treasuryReceiptId"]
    as_owner(database)
    assert database.execute(
        "select count(*) from public.personal_captain_completion_effects where wave_id=%s",
        (wave.id,),
    ).fetchone() == (2,)


def test_origin_close_continues_when_new_offers_are_paused_and_uses_exact_large_coins(database):
    wave = ready_wave(database, played=2)
    wave.basis["baseCoins"] = str(10**30)
    freeze(database, wave)
    confirm(database, wave, wave.owner)
    as_owner(database)
    database.execute("update public.island_economy_state set admission_state='paused' "
                     "where island_owner=%s", (wave.owner,))
    result = close(database, wave)
    assert result["lootCoins"] == str(10**30 + int(wave.basis["perWaveCoins"]) * 2)
    assert isinstance(result["economy"]["treasury"]["balanceCoins"], str)


@pytest.mark.parametrize("bonuses", [[None], [1], [{}], ["unfrozen"]])
def test_invalid_or_unfrozen_bonus_ids_never_create_a_terminal_receipt(database, bonuses):
    wave = ready_wave(database)
    freeze(database, wave)
    expect_error(database, "invalid_wave_reward", close, wave, "won", bonuses)
    assert database.execute("select count(*) from public.island_wave_closures where wave_id=%s",
                            (wave.id,)).fetchone() == (0,)


def test_protocol_two_attempt_uses_same_once_only_accounting_and_blocks_private_finish(database):
    from server.tests.island_sql.test_islands_and_waves_sql import (
        FRIEND,
        OWNER,
        add_players,
        open_island,
    )
    from server.tests.island_sql.test_recovery_wave_end_sql import FINISH, PAGE, move_start, ring

    add_players(database, OWNER, FRIEND)
    open_island(database, OWNER, "K7Q2M")
    open_island(database, FRIEND, "M8P3N")
    treasury = rpc(database, "island_treasury_admit", OWNER, OWNER, "admit0001", 200)
    rpc(database, "game_join", FRIEND, OWNER, 10)
    for player in (OWNER, FRIEND):
        rpc(database, "personal_captain_initialize", player, OWNER, keys(treasury)[1],
            Jsonb(configuration(load_island())))
    started = ring(database, "sharedproto02")
    wave_id = UUID(started["waveId"])
    move_start(database, wave_id, 20)
    rpc(database, "recovery_wave_join", FRIEND, wave_id, 2)
    roster = []
    for player in (OWNER, FRIEND):
        snapshot = private(database, "personal_captain_attach_wave_locked", player, wave_id, 1)
        roster.append({"playerId": str(player), "controllingSessionId": str(uuid4()),
                       "engineerCommitmentId": snapshot["engineerCommitmentId"]})
    wave = Wave(OWNER, FRIEND, uuid4(), treasury, wave_id, roster,
                freeze_reward_basis(load_island(), played_wave=1, seed=4242,
                                    house_levels=0).envelope())
    freeze(database, wave)
    confirm(database, wave, OWNER)
    as_server(database)
    page = database.execute(PAGE, (OWNER, wave_id, 0)).fetchone()[0]
    epoch = database.execute("select reset_epoch from public.recovery_wave_states where wave_id=%s",
                             (wave_id,)).fetchone()[0]
    with pytest.raises(psycopg.Error, match="economy_context_required"), database.transaction():
        database.execute(FINISH, (OWNER, wave_id, True, epoch, "privateproto02",
                                 page["sealedThroughTick"], page["headSeq"]))
    first = close(database, wave)
    assert close(database, wave)["treasuryReceiptId"] == first["treasuryReceiptId"]
    assert database.execute(
        "select wave_protocol from public.island_wave_accounting where wave_id=%s", (wave_id,),
    ).fetchone() == (2,)


def test_simultaneous_legacy_finish_and_freeze_never_pay_both_accounts(database, scratch_server):
    wave = ready_wave(database, played=2)
    database.commit()
    start_together = Barrier(2)

    def operation(kind):
        try:
            with psycopg.connect(scratch_server.get_uri()) as connection:
                assert connection.execute("show transaction_isolation").fetchone() == (
                    "read committed",
                )
                start_together.wait(timeout=10)
                result = (freeze(connection, wave) if kind == "freeze" else
                          finish(connection, wave.owner, wave.id))
            return kind, result, None
        except psycopg.Error as error:
            return kind, None, str(error)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = dict((kind, (value, error)) for kind, value, error in executor.map(
            operation, ("freeze", "legacy"),
        ))
    frozen, freeze_error = results["freeze"]
    legacy, legacy_error = results["legacy"]
    as_owner(database)
    if frozen is not None:
        assert frozen["status"] == "frozen"
        assert legacy is None and "economy_context_required" in legacy_error
        close(database, wave)
        assert database.execute(
            "select count(*) from public.wallet_transactions where reason='pirate_loot' "
            "and ref like %s", (f"wave:{wave.id}%",),
        ).fetchone() == (0,)
    else:
        assert "wave_accounting_already_closed" in freeze_error
        assert legacy["status"] == "done" and legacy_error is None
        assert database.execute(
            "select count(*) from public.island_treasury_transactions "
            "where account_id=%s and reason='pirate_loot'", (keys(wave.treasury)[0],),
        ).fetchone() == (0,)
