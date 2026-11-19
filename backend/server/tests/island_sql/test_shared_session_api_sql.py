"""Native Python adapters composed with real canonical SQL on disposable PostgreSQL.

Legacy progression and timing/configuration are explicit test seeds. Membership,
controller generations, Captain adoption, Arsenal money/copies and accepted wave
state use the actual production provider and transactions; no authority fixture.
This is domain composition, not an authenticated browser acceptance claim.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from threading import Barrier
from time import monotonic, sleep
from uuid import UUID, uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from psycopg import sql  # noqa: E402
from psycopg.types.json import Jsonb  # noqa: E402

from server.errors import ApiError  # noqa: E402
from server.island import shared_arsenal_requests  # noqa: E402
from server.island import shared_session_api as api  # noqa: E402
from server.island.catalogue import Weather, load_island  # noqa: E402
from server.island.shared_session_models import CaptainReport, SessionAttach  # noqa: E402
from server.island.shared_wave_http import SharedWaveProof  # noqa: E402
from server.island.wave_recovery import RecoveryInput  # noqa: E402
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    as_owner,
    keys,
    ready,
    reconciles,
    rpc,
)


class SQLAdmin:
    """The HTTP adapter's exact RPC arguments, executed with real service grants."""

    def __init__(self, connection):
        self.connection, self.calls = connection, []

    async def call_function(self, name, arguments):
        self.calls.append((name, arguments))
        self.connection.execute("set local role service_role")
        statement = sql.SQL("select public.{}({})").format(
            sql.Identifier(name),
            sql.SQL(",").join(sql.SQL("{} => %s").format(sql.Identifier(key)) for key in arguments),
        )
        values = [
            Jsonb(value)
            if isinstance(value, dict) or (isinstance(value, list) and key != "p_rules")
            else value
            for key, value in arguments.items()
        ]
        try:
            result = self.connection.execute(statement, values).fetchone()[0]
        except psycopg.Error:
            self.connection.rollback()
            raise
        # Each successful RPC commits like the actual PostgREST transaction,
        # including deferred constraints; retries read persisted original roots.
        self.connection.commit()
        return result

    async def select_rows(self, table, query):
        assert table == "island_recovery_state" and query["select"] == "revision"
        assert set(query) == {"select", "island_owner", "limit"} and query["limit"] == "1"
        assert query["island_owner"].startswith("eq.")
        self.connection.execute("set local role service_role")
        rows = self.connection.execute(
            "select revision from public.island_recovery_state where island_owner=%s limit 1",
            (query["island_owner"][3:],),
        ).fetchall()
        self.connection.commit()
        return [{"revision": row[0]} for row in rows]


def room(connection, *, maximum_seconds=900):
    owner, member, outsider, _ = ready(connection, admitted=False)
    as_owner(connection)
    # A real legacy profile migration source, prior to its shared admission/adoption.
    connection.execute(
        "update public.islands set wave_best=2,next_wave=3,won_wave_best=4,captain_level=4,"
        "captain_role='engineer' where player_id=%s",
        (owner,),
    )
    treasury = rpc(connection, "island_treasury_admit", owner, owner, "admit0001", 200)
    admin = SQLAdmin(connection)
    catalogue = load_island()
    # Use trusted test timings without rewriting the immutable original wave clock.
    catalogue = replace(
        catalogue,
        waves=replace(
            catalogue.waves, countdown_seconds=0, minimum_seconds=0, maximum_seconds=maximum_seconds
        ),
    )
    intent = dict(
        mode="island_shared", version=1, islandOwner=str(owner), runEpoch=keys(treasury)[1]
    )
    sessions = {actor: str(uuid4()) for actor in (owner, member)}
    for actor, session in sessions.items():
        body = SessionAttach(
            economy=intent, sessionId=session, expectedGeneration="0", actionUid=uuid4().hex
        )
        result = asyncio.run(api.session_call(admin, str(actor), "attach", body, catalogue))
        assert result["session"]["connectionGeneration"] == "1"
    return admin, catalogue, owner, member, outsider, treasury, intent, sessions


def start(connection, prepared, uid="adapter_bell_001"):
    admin, catalogue, owner, _, _, treasury, _, sessions = prepared
    return asyncio.run(
        api.start_wave(
            admin,
            catalogue,
            Weather("calm", "Calm", 1, 0),
            str(owner),
            str(owner),
            keys(treasury)[1],
            sessions[owner],
            "1",
            uid,
            rules=["structure_recovery"],
            snapshot_template=None,
        )
    )


def test_real_attach_adopts_profile_once_and_fresh_spectator_read_has_no_proof(database):
    admin, _, owner, member, _, treasury, _, sessions = room(database)
    result = asyncio.run(api.read_session(admin, str(member), str(owner), keys(treasury)[1]))
    assert result["session"]["isSpectator"] is True and result["session"]["sessionId"] is None
    assert result["session"]["connectionGeneration"] is None
    assert sum(name == "personal_captain_initialize" for name, _ in admin.calls) == 2
    read = asyncio.run(
        api.read_session(
            admin,
            str(owner),
            str(owner),
            keys(treasury)[1],
            session_id=sessions[owner],
            connection_generation="1",
        )
    )
    assert read["session"]["isController"] is True


def test_real_bell_freezes_the_paid_copy_tenure_and_original_root_without_rebuilding(database):
    prepared = room(database)
    admin, catalogue, owner, member, _, treasury, _, sessions = prepared
    bought = asyncio.run(
        shared_arsenal_requests.request_change(
            admin,
            catalogue,
            str(owner),
            str(owner),
            keys(treasury)[1],
            "copy_buy_001",
            "buy",
            weapon="pistols",
        )
    )
    effect = bought["receipt"]["result"]
    started = start(database, prepared)
    wave = UUID(started["waveId"])
    assert started["weather"]["label"] == "Calm" and started["boss"] is False
    assert started["flagship"] is False and started["session"]["isController"] is True
    as_owner(database)
    assert database.execute(
        "select copy_id::text,trunc(copy_generation)::text "
        "from public.shared_session_slots where wave_id=%s and player_id=%s",
        (wave, owner),
    ).fetchone() == (effect["copyId"], effect["holderGeneration"])
    assert database.execute(
        "select frozen_captain->>'weapon' from public.shared_session_slots "
        "where wave_id=%s and player_id=%s",
        (wave, owner),
    ).fetchone() == ("pistols",)
    repeated = asyncio.run(
        api.start_wave(
            admin,
            None,
            None,
            str(owner),
            str(owner),
            keys(treasury)[1],
            sessions[owner],
            "1",
            "adapter_bell_001",
            rules=[],
        )
    )
    assert repeated["historical"] is True and repeated["economy"] is None
    assert repeated["waveId"] == started["waveId"]
    assert admin.calls[-1][0] == "shared_session_wave_replay"
    joined = asyncio.run(
        api.join_wave(
            admin, str(member), wave, str(owner), keys(treasury)[1], sessions[member], "1"
        )
    )
    assert joined["participantToken"] != started["participantToken"]
    current = asyncio.run(api.current_wave(admin, str(member), str(owner)))
    assert current["session"]["isSpectator"] and current["participantToken"] is None
    reconciles(database, keys(treasury)[0])


def test_real_inputs_journal_health_and_server_fall_checkpoint_survive_strict_dtos(database):
    prepared = room(database)
    admin, _, owner, _, _, treasury, intent, sessions = prepared
    started = start(database, prepared)
    wave, epoch = UUID(started["waveId"]), keys(treasury)[1]
    command = RecoveryInput(
        inputUid="move_input_001",
        actorCounter=1,
        tick=0,
        command=dict(type="captain_move", x=0, z=0),
    )
    accepted = asyncio.run(
        api.append_inputs(
            admin, str(owner), wave, str(owner), epoch, sessions[owner], "1", [command]
        )
    )
    assert accepted.head_seq >= 1 and len(accepted.accepted) == 1
    page = asyncio.run(
        api.read_events(admin, str(owner), wave, str(owner), epoch, sessions[owner], "1")
    )
    assert page["events"] and page["headSeq"] >= accepted.head_seq
    deadline = monotonic() + 2
    while page["sealedThroughTick"] < 0:
        assert monotonic() < deadline, "The actual server clock did not seal its first tick."
        sleep(0.01)
        page = asyncio.run(
            api.read_events(admin, str(owner), wave, str(owner), epoch, sessions[owner], "1")
        )
    health = dict(
        waveProtocol=2,
        islandEpoch=started["initialSnapshot"]["islandEpoch"],
        checkpointUid="health_input_001",
        throughTick=page["sealedThroughTick"],
        inputHeadSeq=page["headSeq"],
        lastRepairSeq=0,
        basisRepairSeq={},
        hpUnits={},
    )
    if page["sealedThroughTick"] < 0:
        pytest.fail("The zero-countdown actual wave must expose a nonnegative journal prefix.")
    result = asyncio.run(
        api.report_health(admin, str(owner), wave, str(owner), epoch, sessions[owner], "1", health)
    )
    assert result.accepted is True
    token = started["participantToken"]
    facts = {
        row["participantToken"]: dict(
            hpUnits=0 if row["participantToken"] == token else 1000000,
            downAtTick=0 if row["participantToken"] == token else None,
            reviveBasisSeq=0,
        )
        for row in started["initialSnapshot"]["participants"]
    }
    report = CaptainReport(
        economy=intent,
        sessionId=sessions[owner],
        connectionGeneration="1",
        waveProtocol=2,
        checkpointUid="captain_input_001",
        throughTick=page["sealedThroughTick"],
        inputHeadSeq=page["headSeq"],
        captains=facts,
    )
    fallen = asyncio.run(
        api.report_captains(
            admin, str(owner), wave, str(owner), epoch, sessions[owner], "1", report
        )
    )
    assert UUID(fallen["captains"][token]["fallId"])
    assert fallen["captains"][token]["hpUnits"] == 0


def test_real_disconnect_reconnect_keeps_frozen_copy_tenure_and_fences_old_inputs(database):
    prepared = room(database)
    admin, catalogue, owner, _, _, treasury, intent, sessions = prepared
    bought = asyncio.run(
        shared_arsenal_requests.request_change(
            admin,
            catalogue,
            str(owner),
            str(owner),
            keys(treasury)[1],
            "copy_buy_001",
            "buy",
            weapon="pistols",
        )
    )
    started = start(database, prepared)
    proof = SharedWaveProof(economy=intent, sessionId=sessions[owner], connectionGeneration="1")
    disconnected = asyncio.run(api.session_call(admin, str(owner), "disconnect", proof))
    assert disconnected["session"]["isSpectator"] is True
    assert disconnected["session"]["graceUntil"] is not None
    reconnect = SessionAttach(
        economy=intent, sessionId=sessions[owner], expectedGeneration="1", actionUid="reconnect_001"
    )
    resumed = asyncio.run(api.session_call(admin, str(owner), "attach", reconnect, catalogue))
    assert resumed["session"]["connectionGeneration"] == "2"
    as_owner(database)
    assert database.execute(
        "select holder::text,trunc(holder_generation)::text,"
        "disconnected_until is null,pending_return_wave_id is null from public.arsenal_copies "
        "where id=%s",
        (bought["receipt"]["result"]["copyId"],),
    ).fetchone() == (str(owner), "1", True, True)
    command = RecoveryInput(
        inputUid="stale_input_001",
        actorCounter=1,
        tick=0,
        command=dict(type="captain_move", x=0, z=0),
    )
    with pytest.raises(ApiError) as error:
        asyncio.run(
            api.append_inputs(
                admin,
                str(owner),
                started["waveId"],
                str(owner),
                keys(treasury)[1],
                sessions[owner],
                "1",
                [command],
            )
        )
    assert error.value.code == "not_controller"


def paid_copy_for_member(prepared):
    admin, catalogue, owner, member, _, treasury, _, _ = prepared
    bought = asyncio.run(
        shared_arsenal_requests.request_change(
            admin,
            catalogue,
            str(owner),
            str(owner),
            keys(treasury)[1],
            "copy_buy_001",
            "buy",
            weapon="pistols",
        )
    )
    copy = bought["receipt"]["result"]["copyId"]
    asyncio.run(
        shared_arsenal_requests.request_change(
            admin,
            catalogue,
            str(owner),
            str(owner),
            keys(treasury)[1],
            "copy_return_001",
            "return",
            copy_id=copy,
            generation="1",
        )
    )
    taken = asyncio.run(
        shared_arsenal_requests.request_change(
            admin,
            catalogue,
            str(member),
            str(owner),
            keys(treasury)[1],
            "copy_take_001",
            "take",
            copy_id=copy,
            generation="2",
        )
    )
    assert taken["receipt"]["result"]["holderGeneration"] == "3"
    return copy


def expire_member_grace(connection, prepared, started):
    admin, _, owner, member, _, _, intent, sessions = prepared
    proof = SharedWaveProof(economy=intent, sessionId=sessions[member], connectionGeneration="1")
    asyncio.run(api.session_call(admin, str(member), "disconnect", proof))
    as_owner(connection)
    # Advance only the authoritative lease deadline; no client clock or event is fabricated.
    connection.execute(
        "update public.shared_session_controls "
        "set grace_until=clock_timestamp()-interval '1 second' "
        "where player_id=%s",
        (member,),
    )
    connection.commit()
    result = asyncio.run(admin.call_function("shared_session_process_due", {"p_limit": 20}))
    assert result["status"] == "done"
    as_owner(connection)
    assert connection.execute(
        "select status from public.shared_session_slots where wave_id=%s and player_id=%s",
        (started["waveId"], member),
    ).fetchone() == ("withdrawn",)


def test_real_grace_pending_copy_returns_only_when_original_canonical_finish_commits(database):
    prepared = room(database)
    admin, catalogue, owner, member, _, treasury, intent, sessions = prepared
    copy = paid_copy_for_member(prepared)
    started = start(database, prepared)
    expire_member_grace(database, prepared, started)
    assert database.execute(
        "select holder::text,trunc(holder_generation)::text,pending_return_wave_id::text "
        "from public.arsenal_copies where id=%s",
        (copy,),
    ).fetchone() == (str(member), "3", started["waveId"])
    heartbeat = SharedWaveProof(economy=intent, sessionId=sessions[owner], connectionGeneration="1")
    asyncio.run(api.session_call(admin, str(owner), "heartbeat", heartbeat))
    finished = asyncio.run(
        api.finish_wave(
            admin,
            catalogue,
            str(owner),
            started["waveId"],
            str(owner),
            keys(treasury)[1],
            sessions[owner],
            "1",
            dict(survived=True, shipsSunk=7),
        )
    )
    assert finished["outcome"] == "won" and finished["completion"]["confirmedParticipation"] is True
    as_owner(database)
    assert database.execute(
        "select holder,trunc(holder_generation)::text,pending_return_wave_id "
        "from public.arsenal_copies where id=%s",
        (copy,),
    ).fetchone() == (None, "4", None)
    assert database.execute(
        "select count(*) from public.arsenal_copies where island_owner=%s", (owner,)
    ).fetchone() == (1,)
    assert database.execute(
        "select assignment_wave_id from public.personal_captain_profiles where player_id=%s",
        (owner,),
    ).fetchone() == (None,)
    reconciles(database, keys(treasury)[0])
    # Departed participants see only their retained completion and no fresh account.
    database.execute(
        "update public.island_members set left_at=clock_timestamp() "
        "where island_owner=%s and player_id=%s",
        (owner, member),
    )
    database.commit()
    repeated = asyncio.run(
        api.finish_wave(
            admin,
            None,
            str(member),
            started["waveId"],
            str(owner),
            keys(treasury)[1],
            sessions[member],
            "1",
            dict(survived=False, shipsSunk=0),
        )
    )
    assert repeated["repeat"] is True and repeated["outcome"] == "won"
    assert repeated["economy"] is None and repeated["session"] is None
    assert repeated["completion"]["playerId"] == str(member)


def test_real_worker_closes_silent_expiry_and_settles_pending_copy_without_browser_finish(database):
    prepared = room(database, maximum_seconds=1)
    admin, _, owner, _, _, treasury, _, _ = prepared
    copy = paid_copy_for_member(prepared)
    started = start(database, prepared)
    expire_member_grace(database, prepared, started)
    sleep(1.05)  # One actual absolute wave deadline; no immutable timestamp is rewritten.
    result = asyncio.run(admin.call_function("shared_session_process_due", {"p_limit": 20}))
    assert result["closed"] >= 1
    as_owner(database)
    assert database.execute(
        "select outcome from public.island_wave_closures where wave_id=%s", (started["waveId"],)
    ).fetchone() == ("expired",)
    assert database.execute(
        "select holder,trunc(holder_generation)::text from public.arsenal_copies where id=%s",
        (copy,),
    ).fetchone() == (None, "4")
    assert (
        database.execute(
            "select balance_coins from public.island_economy_accounts where id=%s",
            (keys(treasury)[0],),
        ).fetchone()[0]
        == 140
    )
    reconciles(database, keys(treasury)[0])


def test_real_return_race_freezes_only_the_actual_locked_copy_loadout(database, scratch_server):
    prepared = room(database)
    admin, catalogue, owner, _, _, treasury, _, sessions = prepared
    bought = asyncio.run(
        shared_arsenal_requests.request_change(
            admin,
            catalogue,
            str(owner),
            str(owner),
            keys(treasury)[1],
            "copy_buy_001",
            "buy",
            weapon="pistols",
        )
    )
    copy = bought["receipt"]["result"]["copyId"]
    together = Barrier(2)

    def bell():
        with psycopg.connect(scratch_server.get_uri()) as connection:
            connection.execute("set statement_timeout='5s'")
            together.wait(timeout=10)
            separate = (SQLAdmin(connection), catalogue, *prepared[2:])
            return start(connection, separate, "race_bell_001")

    def give_back():
        with psycopg.connect(scratch_server.get_uri()) as connection:
            connection.execute("set statement_timeout='5s'")
            together.wait(timeout=10)
            try:
                return asyncio.run(
                    shared_arsenal_requests.request_change(
                        SQLAdmin(connection),
                        catalogue,
                        str(owner),
                        str(owner),
                        keys(treasury)[1],
                        "race_return_001",
                        "return",
                        copy_id=copy,
                        generation="1",
                    )
                )
            except ApiError as error:
                assert error.code == "wave_running"
                return None

    with ThreadPoolExecutor(max_workers=2) as pool:
        bell_future, return_future = pool.submit(bell), pool.submit(give_back)
        started, returned = bell_future.result(timeout=15), return_future.result(timeout=15)
    as_owner(database)
    frozen = database.execute(
        "select copy_id::text,trunc(copy_generation)::text,frozen_captain->>'weapon' "
        "from public.shared_session_slots where wave_id=%s and player_id=%s",
        (started["waveId"], owner),
    ).fetchone()
    if returned is None:
        assert frozen == (copy, "1", "pistols")
    else:
        assert frozen == (None, None, "musket")
    assert database.execute(
        "select count(*) from public.arsenal_copies where island_owner=%s", (owner,)
    ).fetchone() == (1,)
    reconciles(database, keys(treasury)[0])


def test_real_released_controller_unknown_generation_preserves_counter_and_history(database):
    admin, catalogue, owner, _, _, treasury, intent, sessions = room(database)
    first_uid = next(
        args["p_action_uid"]
        for name, args in admin.calls
        if name == "shared_session_attach" and args["p_session_id"] == sessions[owner]
    )
    first = SharedWaveProof(economy=intent, sessionId=sessions[owner], connectionGeneration="1")
    asyncio.run(api.session_call(admin, str(owner), "disconnect", first))
    as_owner(database)
    database.execute(
        "update public.shared_session_controls "
        "set grace_until=clock_timestamp()-interval '1 second' "
        "where player_id=%s",
        (owner,),
    )
    database.commit()
    asyncio.run(admin.call_function("shared_session_process_due", {"p_limit": 20}))
    second_sid = str(uuid4())
    second = SessionAttach(
        economy=intent, sessionId=second_sid, expectedGeneration="0", actionUid="attach_second_001"
    )
    answer = asyncio.run(api.session_call(admin, str(owner), "attach", second, catalogue))
    assert answer["session"]["connectionGeneration"] == "2"
    repeated = asyncio.run(api.session_call(admin, str(owner), "attach", second, catalogue))
    assert repeated == answer
    old = SessionAttach(
        economy=intent, sessionId=sessions[owner], expectedGeneration="0", actionUid=first_uid
    )
    history = asyncio.run(api.session_call(admin, str(owner), "attach", old, catalogue))
    assert history["session"]["connectionGeneration"] == "1"
    stale = asyncio.run(
        api.read_session(
            admin,
            str(owner),
            str(owner),
            keys(treasury)[1],
            session_id=sessions[owner],
            connection_generation="1",
        )
    )
    fresh = asyncio.run(
        api.read_session(
            admin,
            str(owner),
            str(owner),
            keys(treasury)[1],
            session_id=second_sid,
            connection_generation="2",
        )
    )
    assert stale["session"]["isSpectator"] is True and stale["session"]["sessionId"] is None
    assert fresh["session"]["isController"] is True
