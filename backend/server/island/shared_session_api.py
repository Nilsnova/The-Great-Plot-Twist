"""Native shared wave and session RPC adapters for authenticated routes.

The real SQL transaction owns controller/assignment/account authorization. Bell
replay is probed before any mutable preparation or personal initialization.
"""

import json
import re
from secrets import randbelow
from uuid import UUID

from pydantic import ValidationError

from server.errors import ApiError
from server.island import personal_captain_store, shared_wave_template, wave_recovery
from server.island.catalogue import IslandCatalogue, Weather
from server.island.economy_operations import root_action_uid
from server.island.shared_session_models import (
    FinishReport,
    NativeFinish,
    NativeWave,
    Origin,
    SessionReply,
)
from server.island.treasury import identifier, resolve_economy_context
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

REFUSALS = {
    "not_member": (403, "not_member"),
    "not_controller": (403, "not_controller"),
    "not_in_wave": (403, "not_in_wave"),
    "not_session_leader": (403, "not_session_leader"),
    "stale_controller": (409, "stale_controller"),
    "controller_held": (409, "controller_held"),
    "reconnect_required": (409, "reconnect_required"),
    "captain_assigned": (409, "captain_assigned"),
    "captain_context_required": (409, "captain_context_required"),
    "epoch_mismatch": (409, "economy_epoch_mismatch"),
    "account_missing": (409, "economy_context_required"),
    "path_unavailable": (409, "economy_path_unavailable"),
    "wave_running": (409, "wave_running"),
    "wave_over": (409, "wave_over"),
    "action_conflict": (409, "idempotency_conflict"),
    "input_conflict": (409, "input_conflict"),
    "counter_gap": (409, "input_counter_conflict"),
    "island_changed": (409, "island_changed"),
    "command_before_start": (409, "command_before_start"),
    "health_sync_required": (409, "health_sync_required"),
    "checkpoint_stale": (409, "checkpoint_stale"),
    "checkpoint_divergence": (409, "checkpoint_divergence"),
    "stale_fall": (409, "fall_mismatch"),
    "target_not_fallen": (409, "target_unavailable"),
    "out_of_reach": (409, "out_of_range"),
    "invalid_change": (422, "invalid_transaction"),
    "bad_recovery_input": (422, "validation_error"),
}


def checked(value: object) -> dict:
    if isinstance(value, dict) and value.get("status") == "refused":
        reason = value.get("reason")
        if reason in REFUSALS and set(value) == {"status", "reason"}:
            raise ApiError(*REFUSALS[reason], "Refresh the shared session and retry this action.")
    if not isinstance(value, dict) or value.get("status") == "refused":
        raise SupabaseRejected("The database sent an unreadable shared session answer.")
    return value


def identity(value: str | UUID) -> str:
    return str(value) if isinstance(value, UUID) else identifier(value)


def generation(value: object, *, zero: bool = False) -> str:
    pattern = r"^(0|[1-9][0-9]*)$" if zero else r"^[1-9][0-9]*$"
    if not isinstance(value, str) or re.fullmatch(pattern, value) is None:
        raise ApiError(422, "validation_error", "Use the exact connection generation string.")
    return value


def proof(
    actor: str,
    owner: str,
    epoch: str,
    session: str | None,
    connection: str | None,
    *,
    spectator: bool = False,
) -> dict:
    if spectator and session is None and connection is None:
        return {
            "p_actor_id": identity(actor),
            "p_island_owner": identity(owner),
            "p_run_epoch": identity(epoch),
            "p_session_id": None,
            "p_connection_generation": None,
        }
    if session is None or connection is None:
        raise ApiError(422, "validation_error", "Provide the complete controller proof.")
    return {
        "p_actor_id": identity(actor),
        "p_island_owner": identity(owner),
        "p_run_epoch": identity(epoch),
        "p_session_id": identity(session),
        "p_connection_generation": generation(connection),
    }


def wave_reply(
    value: object,
    owner: str,
    epoch: str | None = None,
    wave_id: str | UUID | None = None,
    *,
    session: str | None = None,
    connection: str | None = None,
    historical: bool = False,
) -> dict:
    try:
        row = NativeWave.model_validate(checked(value))
        origin = Origin.model_validate(row.initialSnapshot["economy"])
        if str(row.islandOwner) != identity(owner) or (
            epoch is not None and str(origin.runEpoch) != identity(epoch)
        ):
            raise ValueError("Wrong shared origin.")
        if wave_id is not None and str(row.waveId) != identity(wave_id):
            raise ValueError("Wrong shared wave.")
        if historical and not row.historical:
            raise ValueError("Replay returned current authority.")
        if (
            row.session is not None
            and row.session.isController
            and (
                session is None
                or connection is None
                or str(row.session.sessionId) != identity(session)
                or row.session.connectionGeneration != generation(connection)
            )
        ):
            raise ValueError("Wrong controller proof.")
        return row.model_dump(mode="json")
    except (ValidationError, ValueError, TypeError, KeyError) as error:
        raise SupabaseRejected("The database sent an unreadable native wave.") from error


async def replay_wave_start(
    admin: SupabaseAdmin,
    actor_id: str,
    island_owner: str,
    run_epoch: str,
    action_uid: str,
) -> dict | None:
    """Probe the owned immutable bell before weather, navigation or current context work."""
    owner, epoch = identity(island_owner), identity(run_epoch)
    replay = checked(
        await admin.call_function(
            "shared_session_wave_replay",
            {
                "p_actor_id": identity(actor_id),
                "p_island_owner": owner,
                "p_run_epoch": epoch,
                "p_action_uid": root_action_uid(action_uid),
            },
        )
    )
    if replay == {"status": "new"}:
        return None
    return wave_reply(replay, owner, epoch, historical=True)


async def start_wave(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    weather: Weather,
    actor_id: str,
    island_owner: str,
    run_epoch: str,
    session_id: str,
    connection_generation: str,
    action_uid: str,
    *,
    rules: list[str],
    snapshot_template: dict | None = None,
    reward_basis=None,
) -> dict:
    actor, owner, epoch = identifier(actor_id), identifier(island_owner), identifier(run_epoch)
    uid = root_action_uid(action_uid)
    replay = await replay_wave_start(admin, actor, owner, epoch, uid)
    if replay is not None:
        return replay
    if snapshot_template is None:
        seed = randbelow(2**31)
        snapshot_template, reward_basis = await shared_wave_template.prepare_shared_wave(
            admin,
            catalogue,
            actor,
            owner,
            weather,
            seed,
            rules,
        )
    else:
        seed = snapshot_template.get("createWave", {}).get("seed")
    if type(seed) is not int or seed < 0 or reward_basis is None:
        raise ApiError(409, "economy_path_unavailable", "The shared wave template is not ready.")
    values = proof(actor, owner, epoch, session_id, connection_generation)
    values.update(
        p_action_uid=uid,
        p_seed=seed,
        p_countdown_seconds=catalogue.waves.countdown_seconds,
        p_minimum_seconds=catalogue.waves.minimum_seconds,
        p_maximum_seconds=catalogue.waves.maximum_seconds,
        p_highest_wave=catalogue.waves.highest_wave,
        p_weather_kind=weather.kind,
        p_weather_ships=weather.ships,
        p_weather_fog=weather.fog,
        p_rules=rules,
        p_snapshot_template=snapshot_template,
        p_reward_basis=reward_basis.envelope(),
    )
    return wave_reply(
        await admin.call_function("shared_session_wave_start", values),
        owner,
        epoch,
        session=session_id,
        connection=connection_generation,
    )


async def join_wave(
    admin, actor_id, wave_id, island_owner, run_epoch, session_id, connection_generation
) -> dict:
    values = proof(actor_id, island_owner, run_epoch, session_id, connection_generation)
    values["p_wave_id"] = identity(wave_id)
    return wave_reply(
        await admin.call_function("shared_session_wave_join", values),
        island_owner,
        run_epoch,
        wave_id,
        session=session_id,
        connection=connection_generation,
    )


async def current_wave(
    admin, actor_id, island_owner, *, session_id=None, connection_generation=None
) -> dict | None:
    if (session_id is None) != (connection_generation is None):
        raise ApiError(422, "validation_error", "Provide both connection proof fields.")
    values = {
        "p_actor_id": identity(actor_id),
        "p_island_owner": identity(island_owner),
        "p_session_id": identity(session_id) if session_id is not None else None,
        "p_connection_generation": generation(connection_generation)
        if connection_generation is not None
        else None,
    }
    result = checked(await admin.call_function("shared_session_wave_current", values))
    if result == {"status": "none"}:
        return None
    return wave_reply(result, island_owner, session=session_id, connection=connection_generation)


def native_command(command: object) -> dict:
    if not isinstance(command, dict):
        raise ApiError(422, "validation_error", "Use a known wave command.")
    kind = command.get("type")
    if kind == "captain_revive_hold_start":
        if set(command) != {"type", "targetId", "fallId"}:
            raise ApiError(422, "validation_error", "Use the exact revival hold fields.")
        try:
            return {
                "type": kind,
                "targetId": str(UUID(command["targetId"])),
                "fallId": str(UUID(command["fallId"])),
            }
        except (ValueError, TypeError, AttributeError) as error:
            raise ApiError(
                422, "validation_error", "Use the saved target and fall identities."
            ) from error
    if kind == "captain_revive_hold_cancel":
        if set(command) != {"type"}:
            raise ApiError(422, "validation_error", "A cancel command has no extra fields.")
        return {"type": kind}
    if kind not in {
        "fire",
        "captain_shot",
        "captain_strike",
        "captain_move",
        "finisher_ready",
        "finisher_input",
    }:
        raise ApiError(422, "validation_error", "Use a known native wave command.")
    return wave_recovery.validate_command(command)


async def append_inputs(
    admin, actor_id, wave_id, island_owner, run_epoch, session_id, connection_generation, inputs
) -> wave_recovery.RecoveryInputResult:
    if not isinstance(inputs, list) or not 1 <= len(inputs) <= wave_recovery.MAX_BATCH:
        raise ApiError(422, "validation_error", "Use a bounded input batch.")
    commands = []
    for item in inputs:
        value = item.model_dump() if hasattr(item, "model_dump") else item
        try:
            value = wave_recovery.RecoveryInput.model_validate(value).model_dump()
        except ValidationError as error:
            raise ApiError(
                422, "validation_error", "Use a valid input counter and tick."
            ) from error
        value["command"] = native_command(value["command"])
        commands.append(value)
    if len(json.dumps(commands, ensure_ascii=True).encode()) > wave_recovery.MAX_BODY_BYTES:
        raise ApiError(422, "validation_error", "The input batch is too large.")
    values = proof(actor_id, island_owner, run_epoch, session_id, connection_generation)
    values.update(p_wave_id=identity(wave_id), p_inputs=commands)
    row = checked(await admin.call_function("shared_session_wave_inputs", values))
    try:
        if set(row) != {"status", "accepted", "headSeq"} or row["status"] != "accepted":
            raise ValueError("Wrong native input response.")
        result = wave_recovery.RecoveryInputResult.model_validate(
            {
                "accepted": row["accepted"],
                "headSeq": row["headSeq"],
            }
        )
        if len(result.accepted) != len(commands) or any(
            event.server_seq > result.head_seq for event in result.accepted
        ):
            raise ValueError("Incomplete native input response.")
        return result
    except (ValidationError, ValueError, KeyError) as error:
        raise SupabaseRejected("The database sent an unreadable native input result.") from error


async def read_events(
    admin,
    actor_id,
    wave_id,
    island_owner,
    run_epoch,
    session_id,
    connection_generation,
    *,
    after=0,
    through=None,
    sealed_through_tick=None,
) -> dict:
    values = proof(
        actor_id, island_owner, run_epoch, session_id, connection_generation, spectator=True
    )
    if (
        type(after) is not int
        or after < 0
        or (through is None) != (sealed_through_tick is None)
        or (
            through is not None
            and (
                type(through) is not int
                or through < 0
                or type(sealed_through_tick) is not int
                or sealed_through_tick < -1
            )
        )
    ):
        raise ApiError(422, "validation_error", "Use a complete bounded journal prefix.")
    values.update(
        p_wave_id=identity(wave_id),
        p_after=after,
        p_through=through,
        p_sealed_through_tick=sealed_through_tick,
    )
    row = checked(await admin.call_function("shared_session_wave_events", values))
    try:
        page = wave_recovery.RecoveryEventPage.model_validate(row)
        if page.through is None or page.closed is None or page.through > page.head_seq:
            raise ValueError("Missing native page boundary.")
        sequences = [event.server_seq for event in page.events]
        if sequences != sorted(set(sequences)) or any(
            seq <= after or seq > page.through for seq in sequences
        ):
            raise ValueError("Wrong native page prefix.")
        return page.model_dump(mode="json", by_alias=True)
    except (ValidationError, ValueError) as error:
        raise SupabaseRejected("The database sent an unreadable native journal page.") from error


async def report_health(
    admin, actor_id, wave_id, island_owner, run_epoch, session_id, connection_generation, report
) -> wave_recovery.RecoveryHealthResult:
    values = proof(actor_id, island_owner, run_epoch, session_id, connection_generation)
    value = report.model_dump(mode="json") if hasattr(report, "model_dump") else dict(report)
    try:
        value.setdefault("waveProtocol", 2)
        checkpoint = wave_recovery.RecoveryHealthRequest.model_validate(value)
        if (
            len(checkpoint.hpUnits) > 26
            or len(checkpoint.basisRepairSeq) > 26
            or any(not 0 <= hp <= wave_recovery.MAX_HP_UNITS for hp in checkpoint.hpUnits.values())
            or any(seq < 0 for seq in checkpoint.basisRepairSeq.values())
        ):
            raise ValueError("Invalid health prefix.")
        values.update(
            p_wave_id=identity(wave_id),
            p_report=checkpoint.model_dump(mode="json", exclude={"waveProtocol"}),
        )
    except (ValidationError, ValueError, TypeError) as error:
        raise ApiError(422, "validation_error", "Use a valid native health prefix.") from error
    row = checked(await admin.call_function("shared_session_wave_health", values))
    try:
        if (
            row.get("status") != "accepted"
            or type(row.get("accepted")) is not bool
            or type(row.get("repeated")) is not bool
        ):
            raise ValueError("Wrong native health status.")
        result = wave_recovery.RecoveryHealthResult.model_validate(
            {key: value for key, value in row.items() if key != "status"}
        )
        if len(result.hp_units) > 26 or any(
            not 0 <= hp <= wave_recovery.MAX_HP_UNITS for hp in result.hp_units.values()
        ):
            raise ValueError("Invalid native HP units.")
        return result
    except (ValidationError, ValueError) as error:
        raise SupabaseRejected("The database sent an unreadable native health result.") from error


async def finish_wave(
    admin,
    catalogue,
    actor_id,
    wave_id,
    island_owner,
    run_epoch,
    session_id,
    connection_generation,
    report,
) -> dict:
    values = proof(actor_id, island_owner, run_epoch, session_id, connection_generation)
    try:
        report = FinishReport.model_validate(report).model_dump(mode="json")
    except ValidationError as error:
        raise ApiError(422, "validation_error", "Use a valid native finish report.") from error
    values.update(p_wave_id=identity(wave_id), p_report=report)
    try:
        row = NativeFinish.model_validate(
            checked(await admin.call_function("shared_session_wave_finish", values))
        )
        if (
            str(row.waveId),
            str(row.origin.islandOwner),
            str(row.origin.runEpoch),
            str(row.completion.playerId),
        ) != (identity(wave_id), identity(island_owner), identity(run_epoch), identity(actor_id)):
            raise ValueError("Wrong original completion scope.")
        if (
            row.session is not None
            and row.session.isController
            and (
                str(row.session.sessionId) != identity(session_id)
                or row.session.connectionGeneration != connection_generation
            )
        ):
            raise ValueError("Wrong current controller.")
        return row.model_dump(mode="json")
    except (ValidationError, ValueError, TypeError) as error:
        raise SupabaseRejected("The database sent an unreadable native completion.") from error


async def session_call(
    admin: SupabaseAdmin,
    actor_id: str,
    command: str,
    body,
    catalogue: IslandCatalogue | None = None,
) -> dict:
    data = body.model_dump(mode="json", exclude_none=True)
    context = data["economy"]
    values = {
        "p_actor_id": identifier(actor_id),
        "p_island_owner": context["islandOwner"],
        "p_run_epoch": context["runEpoch"],
        "p_session_id": data["sessionId"],
    }
    if command == "attach":
        values.update(
            p_expected_generation=data["expectedGeneration"], p_action_uid=data["actionUid"]
        )
    else:
        values["p_connection_generation"] = data["connectionGeneration"]
        if command in {"leave", "settings"}:
            values["p_action_uid"] = data["actionUid"]
        if command == "settings":
            values["p_settings"] = {
                key: data[key]
                for key in ("breakPaused", "autoNext", "countdownSeconds")
                if key in data
            }
    if command not in {"attach", "heartbeat", "disconnect", "leave", "settings"}:
        raise ValueError("Unknown session command.")
    result = await admin.call_function(f"shared_session_{command}", values)
    if (
        command == "attach"
        and isinstance(result, dict)
        and result.get("reason") == "captain_context_required"
    ):
        if catalogue is None:
            raise ValueError("Explicit Captain adoption requires the server catalogue.")
        resolved = await resolve_economy_context(
            admin, actor_id, context["islandOwner"], expected_epoch=context["runEpoch"]
        )
        await personal_captain_store.initialize(admin, resolved, catalogue)
        result = await admin.call_function("shared_session_attach", values)
    try:
        row = SessionReply.model_validate(checked(result))
        owner, epoch = identity(context["islandOwner"]), identity(context["runEpoch"])
        if row.economy is not None and (
            str(row.economy.islandOwner),
            str(row.economy.runEpoch),
        ) != (owner, epoch):
            raise ValueError("Wrong session origin.")
        if row.session is not None and row.session.isController:
            expected = (
                str(int(data["expectedGeneration"]) + 1)
                if command == "attach"
                else data["connectionGeneration"]
            )
            if (
                str(row.session.sessionId) != data["sessionId"]
                or row.session.connectionGeneration != expected
            ):
                raise ValueError("Wrong session proof.")
        if command in {"leave", "settings"}:
            receipt = row.receipt
            if receipt is None or (
                str(receipt.actorId),
                receipt.action,
                receipt.actionUid,
                str(receipt.origin.islandOwner),
                str(receipt.origin.runEpoch),
            ) != (identity(actor_id), f"session_{command}", data["actionUid"], owner, epoch):
                raise ValueError("Wrong session receipt.")
            if (
                command == "leave"
                and receipt.result.connectionGeneration != data["connectionGeneration"]
            ):
                raise ValueError("Wrong released tenure.")
        elif row.receipt is not None or row.repeat is not None or row.economy is None:
            raise ValueError("Wrong metadata result.")
        return row.model_dump(mode="json", exclude_unset=True)
    except (ValidationError, ValueError, TypeError, AttributeError) as error:
        raise SupabaseRejected("The database sent an unreadable session projection.") from error


async def read_session(
    admin: SupabaseAdmin,
    actor_id: str,
    island_owner: str,
    run_epoch: str,
    *,
    session_id: str | None = None,
    connection_generation: str | None = None,
) -> dict:
    owner, epoch = identity(island_owner), identity(run_epoch)
    values = proof(actor_id, owner, epoch, session_id, connection_generation, spectator=True)
    values.pop("p_run_epoch")  # The actual read RPC exposes current metadata; bind the reply below.
    try:
        row = SessionReply.model_validate(
            checked(await admin.call_function("shared_session_read", values))
        )
        if (
            row.receipt is not None
            or row.repeat is not None
            or row.economy is None
            or row.session is None
        ):
            raise ValueError("Missing current session metadata.")
        if str(row.economy.islandOwner) != owner:
            raise ValueError("Wrong current owner.")
        if str(row.economy.runEpoch) != epoch:
            raise ApiError(409, "economy_epoch_mismatch", "This island has started another run.")
        if row.session.isController and (
            session_id is None
            or str(row.session.sessionId) != identity(session_id)
            or row.session.connectionGeneration != connection_generation
        ):
            raise ValueError("Wrong controlling connection.")
        return row.model_dump(mode="json", exclude_unset=True)
    except (ValidationError, ValueError, TypeError) as error:
        raise SupabaseRejected("The database sent an unreadable session projection.") from error
