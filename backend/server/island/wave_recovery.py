"""Authenticated protocol-2 recovery journal transport.

The database owns membership, sequence assignment, sealing and checkpoint CAS. This
module validates the bounded wire shape and translates stable SQL refusal codes.
"""

import json
import math
import re
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr

from server.errors import ApiError
from server.island import layout, service, store, wall_health, wave_events
from server.island import rules as island_rules
from server.island.catalogue import RESEARCH_CAPSTONES, IslandCatalogue, Weather
from server.island.store import Island, IslandRow
from server.island.structure_recovery_manifest import (
    MANIFEST_FILE,
    RECOVERY_MANIFEST,
    SUPPORTED_KINDS,
    max_structure_hp,
)
from server.island.structure_recovery_rate import recovery_rate_factor
from server.island.wall_cohort import PERIMETER_WALL_CAPACITY, is_inventory_wall_id
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

UID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
ID = re.compile(r"^[a-z0-9_-]{1,32}$", re.IGNORECASE)
MAX_BATCH = 32
MAX_BODY_BYTES = 16 * 1024
MAX_PAGE = 256
MAX_HP_UNITS = 1_000_000
SNAPSHOT_READ_ATTEMPTS = 2
MAX_RECOVERY_STRUCTURES = PERIMETER_WALL_CAPACITY + 11  # All walls and D060 tower spots.


class RecoveryInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    inputUid: StrictStr = Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")
    actorCounter: StrictInt = Field(ge=1, le=2**63 - 1)
    tick: StrictInt = Field(ge=0, le=18_000)
    command: dict[str, Any]


class RecoveryInputBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    waveProtocol: StrictInt = Field(ge=2, le=2)
    inputs: list[RecoveryInput] = Field(min_length=1, max_length=MAX_BATCH)


class RecoveryEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    server_seq: StrictInt = Field(alias="serverSeq", ge=1)
    effective_tick: StrictInt = Field(alias="effectiveTick", ge=0)
    type: StrictStr
    payload: dict[str, Any]
    participant_token: UUID | None = Field(default=None, alias="participantToken")


class RecoveryEventPage(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    head_seq: StrictInt = Field(alias="headSeq", ge=0)
    sealed_through_tick: StrictInt = Field(alias="sealedThroughTick", ge=-1)
    through: StrictInt | None = Field(default=None, ge=0)
    events: list[RecoveryEvent] = Field(max_length=MAX_PAGE)
    # 20261118030000: whether the wave is closed (its seal no longer moves); older SQL omits it.
    closed: StrictBool | None = None


class RecoveryHealthRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    waveProtocol: StrictInt = Field(ge=2, le=2)
    islandEpoch: UUID
    checkpointUid: StrictStr = Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")
    throughTick: StrictInt = Field(ge=0, le=18_000)
    inputHeadSeq: StrictInt = Field(ge=0)
    lastRepairSeq: StrictInt = Field(ge=0)
    basisRepairSeq: dict[UUID, StrictInt] = Field(max_length=MAX_RECOVERY_STRUCTURES)
    hpUnits: dict[UUID, StrictInt] = Field(max_length=MAX_RECOVERY_STRUCTURES)


class RecoveryCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    islandEpoch: UUID
    checkpointUid: StrictStr = Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")
    throughTick: StrictInt = Field(ge=0, le=18_000)
    inputHeadSeq: StrictInt = Field(ge=0)
    lastRepairSeq: StrictInt = Field(ge=0)
    basisRepairSeq: dict[UUID, StrictInt] = Field(max_length=MAX_RECOVERY_STRUCTURES)
    hpUnits: dict[UUID, StrictInt] = Field(max_length=MAX_RECOVERY_STRUCTURES)


class RecoveryInputResult(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    accepted: list[RecoveryEvent]
    head_seq: StrictInt = Field(alias="headSeq", ge=0)


class RecoveryHealthResult(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    accepted: bool
    repeated: bool = False
    through_tick: StrictInt = Field(alias="throughTick", ge=0)
    input_head_seq: StrictInt = Field(alias="inputHeadSeq", ge=0)
    last_repair_seq: StrictInt = Field(alias="lastRepairSeq", ge=0)
    hp_units: dict[UUID, StrictInt] = Field(alias="hpUnits")


_COMMAND_FIELDS: dict[str, set[str]] = {
    "fire": {"type", "cannonId", "targetId"},
    "lamps_lit": {"type"},
    "captain_shot": {
        "type",
        "targetId",
        "x",
        "z",
        "ax",
        "az",
        "seen",
        "level",
        "skills",
        "weapon",
    },
    "captain_strike": {"type", "targetId", "x", "z", "seen", "level", "skills"},
    "captain_move": {"type", "x", "z", "colour", "away"},
    "captain_revive": {"type", "targetId", "x", "z", "skills"},
    "finisher_ready": {"type", "shipId"},
    "finisher_input": {"type", "from", "marks", "easy"},
}
_REQUIRED_COMMAND_FIELDS = {
    "fire": {"cannonId", "targetId"},
    "captain_shot": {"targetId", "x", "z"},
    "captain_strike": {"targetId", "x", "z"},
    "captain_move": {"x", "z"},
    "captain_revive": {"targetId", "x", "z"},
    "finisher_ready": {"shipId"},
    "finisher_input": {"from", "marks"},
}
UUID_TEXT = re.compile(r"^[0-9a-fA-F-]{36}$")


def _number(value: Any, *, low: float = -499.999, high: float = 499.999) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and low <= value <= high


def validate_command(command: dict[str, Any]) -> dict[str, Any]:
    """Reject commands outside the existing sim input vocabulary and exact field bounds."""
    if not isinstance(command, dict) or not isinstance(command.get("type"), str):
        raise ApiError(422, "validation_error", "A wave command needs a known type.")
    kind = command["type"]
    allowed = _COMMAND_FIELDS.get(kind)
    if (
        allowed is None
        or set(command) - allowed
        or not _REQUIRED_COMMAND_FIELDS.get(kind, {"type"}) <= set(command)
    ):
        raise ApiError(422, "validation_error", "The wave command contains unknown fields.")
    try:
        raw_client = json.dumps(command, separators=(",", ":"), ensure_ascii=True).encode()
    except (TypeError, ValueError) as error:
        raise ApiError(422, "validation_error", "The wave command is invalid.") from error
    if len(raw_client) > MAX_BODY_BYTES:
        raise ApiError(422, "validation_error", "The wave command is too large.")
    for key in ("cannonId", "wallId", "shipId"):
        if key in command and (not isinstance(command[key], str) or not ID.fullmatch(command[key])):
            raise ApiError(422, "validation_error", f"The {key} is invalid.")
    if "targetId" in command:
        target = command["targetId"]
        valid_null_shot = kind == "captain_shot" and target is None
        valid_revive_token = (
            kind == "captain_revive" and isinstance(target, str) and UUID_TEXT.fullmatch(target)
        )
        if (
            not valid_null_shot
            and not valid_revive_token
            and (not isinstance(target, str) or not ID.fullmatch(target))
        ):
            raise ApiError(422, "validation_error", "The targetId is invalid.")
    if kind in {"captain_move", "captain_shot", "captain_strike", "captain_revive"}:
        for key in ("x", "z"):
            if key not in command or not _number(command[key]):
                raise ApiError(422, "validation_error", "Captain coordinates are invalid.")
    if kind == "captain_shot":
        if ("ax" in command) != ("az" in command) or (
            "ax" in command and not (_number(command["ax"]) and _number(command["az"]))
        ):
            raise ApiError(422, "validation_error", "Captain aim is invalid.")
    if "seen" in command and (
        not isinstance(command["seen"], int)
        or isinstance(command["seen"], bool)
        or not 0 <= command["seen"] <= 18_000
    ):
        # The tick the shooter saw (fix/playtest-1117): reach is checked there, 2 s back at most.
        raise ApiError(422, "validation_error", "The seen tick is invalid.")
    if kind == "captain_move":
        if "colour" in command and (
            not isinstance(command["colour"], int)
            or isinstance(command["colour"], bool)
            or command["colour"] not in range(10)
        ):
            raise ApiError(422, "validation_error", "Captain colour is invalid.")
        if "away" in command and command["away"] is not True:
            raise ApiError(422, "validation_error", "Captain away state is invalid.")
    if kind == "finisher_input":
        marks, start = command.get("marks"), command.get("from")
        if (
            not isinstance(start, int)
            or isinstance(start, bool)
            or not 0 <= start <= 3000
            or not isinstance(marks, list)
            or not 1 <= len(marks) <= 24
            or any(
                not isinstance(x, int) or isinstance(x, bool) or not -1 <= x <= 100 for x in marks
            )
            or ("easy" in command and not isinstance(command["easy"], bool))
        ):
            raise ApiError(422, "validation_error", "Finisher samples are invalid.")
    # Existing clients may send Captain stats beside an action. Keep
    # accepting that old shape for migration, but never persist it as
    # authority; the RPC attaches server-read metadata separately.
    command = {
        key: value for key, value in command.items() if key not in {"level", "skills", "weapon"}
    }
    raw = json.dumps(command, separators=(",", ":"), ensure_ascii=True).encode()
    if len(raw) > MAX_BODY_BYTES:
        raise ApiError(422, "validation_error", "The wave command is too large.")
    return command


def _refusal(reply: Any) -> None:
    if not isinstance(reply, dict):
        raise SupabaseRejected("The recovery journal could not be read.")
    reason = reply.get("reason")
    if reason == "too_early":
        # A protocol-2 finish before the wave's minimum: the same 409 as the legacy finish.
        wait = reply.get("waitSeconds")
        wait = wait if isinstance(wait, int) and not isinstance(wait, bool) and wait > 0 else 1
        raise ApiError(
            409,
            "wave_too_early",
            f"The wave is not over yet. Try again in {wait} seconds.",
            headers={"Retry-After": str(wait)},
        )
    mapped = {
        "structure_recovery_required": (
            409,
            "structure_recovery_required",
            "Perimeter waves need recovery support.",
        ),
        "perimeter_rules_required": (
            409,
            "perimeter_rules_required",
            "Reload to use the perimeter wall rules.",
        ),
        "no_such_wave": (404, "no_such_wave", "There is no such wave."),
        "not_in_wave": (403, "not_in_wave", "Join the wave first: you are not in this wave."),
        "wave_over": (409, "wave_over", "This wave is over."),
        "client_update_required": (
            409,
            "client_update_required",
            "Reload to join this recovery wave.",
        ),
        "input_conflict": (
            409,
            "input_conflict",
            "An input UID was already used for another command.",
        ),
        "counter_gap": (
            409,
            "input_counter_conflict",
            "Reload the wave before sending more commands.",
        ),
        "health_sync_required": (
            409,
            "health_sync_required",
            "Replay the wave journal and submit a newer health checkpoint.",
        ),
        "checkpoint_stale": (
            409,
            "checkpoint_stale",
            "Replay the wave journal and submit a newer health checkpoint.",
        ),
        "checkpoint_divergence": (
            409,
            "checkpoint_divergence",
            "The same wave prefix produced different health; replay from the journal.",
        ),
        "epoch_mismatch": (
            409,
            "stale_recovery_state",
            "The island was reset while this wave was running.",
        ),
        "wave_running": (409, "wave_running", "A wave is already under way on this island."),
        "island_changed": (
            409,
            "island_changed",
            "The island changed while the wave was being prepared. Retry the same request.",
        ),
        "not_member": (
            403,
            "not_member",
            "Join this island's game before joining its wave.",
        ),
        "no_such_island": (404, "no_such_island", "There is no island with that code."),
        "player_not_set_up": (
            404,
            "player_not_set_up",
            "Set up your island before joining a wave.",
        ),
        "command_before_start": (
            409,
            "command_before_start",
            "Combat inputs are not open yet.",
        ),
        "page_incomplete": (
            409,
            "page_incomplete",
            "Fetch every event through the current page before polling again.",
        ),
        "page_watermark_invalid": (
            409,
            "page_watermark_invalid",
            "Restart the journal page from its saved watermark.",
        ),
    }
    if reason in mapped:
        status, code, message = mapped[reason]
        raise ApiError(status, code, message)
    if reply.get("status") == "refused":
        raise SupabaseRejected(f"The recovery request was refused: {reason or 'unknown'}.")


async def call_lifecycle_rpc(
    admin: SupabaseAdmin, function: str, arguments: dict[str, Any], *, statuses: set[str]
) -> dict[str, Any]:
    """Call one versioned wave lifecycle RPC and retain its status for the model parser."""
    reply = await admin.call_function(function, arguments)
    _refusal(reply)
    if not isinstance(reply, dict) or reply.get("status") not in statuses:
        raise SupabaseRejected(f"The {function} response could not be read.")
    return reply


async def build_snapshot_template(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    island: Island,
    weather: Weather,
    seed: int,
    kept_rules: list[str],
    *,
    expected_wall_policy: tuple[int, int] | None = None,
) -> dict[str, Any]:
    """Build server-owned static createWave inputs; the admission RPC fills locked HP identities.

    This read is only a template. The SQL admission RPC must validate the built/layout identity
    under the owner-island lock and replace the recovery structures from current DB rows.
    """
    expected_revision: int | None = None
    view = None
    for _ in range(SNAPSHOT_READ_ATTEMPTS):
        before = await read_recovery_revision(admin, island.owner)
        view = await service.look_open(admin, catalogue, island)
        after = await read_recovery_revision(admin, island.owner)
        if before == after:
            expected_revision = after
            break
    if expected_revision is None or view is None:
        raise ApiError(
            409,
            "island_changed",
            "The island changed while the wave was being prepared. Retry the same request.",
        )
    geometry = layout.island_layout(catalogue.more_tower_spots)
    complete_geometry = layout.island_layout(more=True)
    info = getattr(view, "layout", service.FIXED_LAYOUT)
    policy = (info.wall_rule_version, info.wall_capacity)
    try:
        layout.check_wall_policy(*policy)
    except ValueError as error:
        raise SupabaseRejected("The frozen wall policy could not be read.") from error
    if expected_wall_policy is not None and policy != expected_wall_policy:
        raise ApiError(409, "island_changed", "The wall policy changed. Retry the same request.")
    perimeter = policy[0] == 1
    if perimeter and "pathing" not in kept_rules:
        raise ApiError(409, "perimeter_rules_required", "Perimeter walls need the pathing update.")
    known = {spot.spot: spot.slot for spot in complete_geometry.spots}
    seen: set[str] = set()
    defenses = []
    structure_config: dict[str, dict[str, Any]] = {}
    wall_tier = view.campaign.tiers.get("wall")
    wall_research = None if wall_tier is None else wall_tier.choice_2
    workshops = [
        spot
        for spot in view.spots
        if spot.built and spot.kind == "house" and spot.spec == "workshop" and spot.level >= 2
    ]
    for spot in view.spots:
        if not spot.built:
            continue
        inventory = perimeter and is_inventory_wall_id(spot.id, policy[1])
        slot = "wall" if inventory else known.get(spot.id)
        allowed = {
            "wall": {"wall"},
            "tower": set(SUPPORTED_KINDS) - {"wall"},
            "watchtower": {"watchtower"},
            "house": {"house"},
        }.get(slot, set())
        if (
            spot.id in seen
            or spot.kind not in allowed
            or not all(
                isinstance(value, (float, int))
                and not isinstance(value, bool)
                and math.isfinite(value)
                and layout.on_grid(geometry, float(value))
                for value in (spot.x, spot.z)
            )
        ):
            raise SupabaseRejected("The frozen defense identity or position could not be read.")
        seen.add(spot.id)
        item: dict[str, Any] = {
            "id": spot.id,
            "kind": spot.kind,
            "level": spot.level,
            "x": spot.x,
            "z": spot.z,
        }
        # The defense in the legacy client's shape (frontend island/spots.js defenses()), so both
        # wave systems fight the same island (fix/playtest-1117): a capstone counts only while it is
        # the island's tier-3 pick, the tier-2 pick of the kind rides as `bonus`, and the upgrade
        # tree is {a, b} (it was [a, b], which the sim's readTree read as no tree at all).
        tier = view.campaign.tiers.get(spot.kind)
        spec = spot.spec
        if (
            spec is not None
            and spec in RESEARCH_CAPSTONES.get(spot.kind, ())
            and (tier is None or tier.choice_3 != spec)
        ):
            spec = None
        if spec is not None:
            item["spec"] = spec
        if tier is not None and tier.choice_2 is not None:
            item["bonus"] = tier.choice_2
        if spot.tree is not None:
            item["tree"] = {"a": spot.tree[0], "b": spot.tree[1]}
        defenses.append(item)
        if spot.kind in SUPPORTED_KINDS:
            nearby_workshops = sum(
                1
                for house in workshops
                if house.x is not None
                and house.z is not None
                and spot.x is not None
                and spot.z is not None
                and (house.x - spot.x) ** 2 + (house.z - spot.z) ** 2 <= 10**2
            )
            selected_wall_spec = spec if spot.kind == "wall" else None
            selected_wall_research = wall_research if spot.kind == "wall" else None
            max_hp = max_structure_hp(
                spot.kind, spot.level, selected_wall_spec, selected_wall_research
            )
            rate = recovery_rate_factor(
                view.crew.get("carpenter", 0),
                nearby_workshops,
                spot.kind,
                selected_wall_spec,
                selected_wall_research,
                True,
            )
            structure_config[spot.id] = {
                "kind": spot.kind,
                "level": spot.level,
                "maxHP": float(max_hp),
                "rateNumerator": rate.numerator,
                "rateDenominator": rate.denominator,
                "wallSpec": selected_wall_spec,
                "wallResearch": selected_wall_research,
                "nearbyWorkshops": nearby_workshops,
            }

    rule_options = {
        "tower_health": "towerHealth",
        "pathing": "pathing",
        "tower_obstacles": "towerObstacles",
        "rescue": "rescue",
        "defenses_v2": "defensesV2",
        "ship_fire": "shipFire",
    }
    create_wave: dict[str, Any] = {
        "weather": {"ships": weather.ships, "fog": weather.fog},
        "island": {"hp": 100},
        "defenses": defenses,
        "crew": dict(view.crew),
        "flagship": False,
        "countdown": 0,
        "coast": {"rx": geometry.rx, "rz": geometry.rz, "seed": geometry.seed},
        "lanes": [
            {"id": "east", "bearing": 0},
            {"id": "south", "bearing": 90},
            {"id": "west", "bearing": 180},
        ],
        "heart": {"x": geometry.heart[0], "z": geometry.heart[1], "ring": 12},
        "finishers": True,
        "finisherPreparation": True,
    }
    for rule_name, option_name in rule_options.items():
        create_wave[option_name] = rule_name in kept_rules
    if perimeter:
        create_wave["perimeterWalls"] = True

    events = {
        str(number): wave_events.event_for(number, seed)
        for number in range(1, catalogue.waves.highest_wave + 1)
    }
    bosses = {
        str(number): number % catalogue.waves.boss_every == 0
        for number in range(1, catalogue.waves.highest_wave + 1)
    }
    recovery_config = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    recovery_config["baseRateUnitsPerSecond"] = [5000, 3]
    recovery_config["recoveryRateFactors"] = {
        "carpenterMultiplierPerWorker": 1,
        "carpenterMaximumWorkers": 2,
        "workshopPercentPerHouse": 30,
        "workshopPercentCap": 50,
        "workshopRadius": 10,
        "wallSpecRateFactors": {"quick_mend": [2, 1], "bastion": [3, 1]},
        "wallResearchRateFactors": {"mason_drill": [3, 2]},
    }
    default_positions = {spot.spot: {"x": spot.x, "z": spot.z} for spot in complete_geometry.spots}
    return {
        "expectedRevision": expected_revision,
        "weather": dict(create_wave["weather"]),
        "createWave": create_wave,
        "priceSchedule": island_rules.price_table(catalogue),
        "eventByWave": events,
        "bossByWave": bosses,
        "recoveryConfig": recovery_config,
        "defaultPositions": default_positions,
        "structureConfigBySpot": structure_config,
        "legacyWallRecoverSeconds": wall_health.RECOVERY_SECONDS,
        "configVersion": RECOVERY_MANIFEST.recovery_version,
        "supportedStructureKinds": list(SUPPORTED_KINDS),
        "wallRuleVersion": policy[0],
        "wallCapacity": policy[1],
    }


async def read_recovery_revision(admin: SupabaseAdmin, owner: str) -> int:
    """Read the monotone server revision used to fence multi-query snapshot assembly."""
    rows = await admin.select_rows(
        "island_recovery_state",
        {"select": "revision", "island_owner": f"eq.{owner}", "limit": "1"},
    )
    if not rows:
        raise SupabaseRejected("The island recovery revision could not be read.")
    value = rows[0].get("revision")
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise SupabaseRejected("The island recovery revision could not be read.")
    return value


async def read_owner_island(admin: SupabaseAdmin, owner: str) -> Island:
    """Read the canonical island identity needed to build a trusted start template."""
    rows = await admin.select_rows(
        "islands",
        {
            "select": "player_id,code,wave_best,flags",
            "player_id": f"eq.{owner}",
            "limit": "1",
        },
    )
    if not rows:
        raise ApiError(404, "no_such_island", "There is no island with that code.")
    row = store.read_model(IslandRow, rows[0])
    return Island(owner, store.checked_code(row.code), row.wave_best, row.flags)


async def append_inputs(
    admin: SupabaseAdmin,
    player_id: str,
    wave_id: UUID,
    inputs: list[RecoveryInput],
    *,
    arsenal: bool = False,
) -> RecoveryInputResult:
    """Append commands; `arsenal` (the flag) makes the journal carry the arsenal copy the shooter
    carries on the defended island, the gun their own screen uses (20261118040000)."""
    body = [
        {
            "inputUid": item.inputUid,
            "actorCounter": item.actorCounter,
            "tick": item.tick,
            "command": validate_command(item.command),
        }
        for item in inputs
    ]
    encoded = json.dumps(body, separators=(",", ":"), ensure_ascii=True).encode()
    if len(encoded) > MAX_BODY_BYTES:
        raise ApiError(422, "validation_error", "The input batch is too large.")
    reply = await admin.call_function(
        "recovery_wave_inputs",
        {
            "p_player_id": player_id,
            "p_wave_id": str(wave_id),
            "p_inputs": body,
            "p_arsenal": arsenal,
        },
    )
    _refusal(reply)
    if not isinstance(reply, dict) or reply.get("status") != "accepted":
        raise SupabaseRejected("The wave inputs could not be accepted.")
    return RecoveryInputResult.model_validate(
        {key: value for key, value in reply.items() if key in {"accepted", "headSeq"}}
    )


async def read_events(
    admin: SupabaseAdmin,
    player_id: str,
    wave_id: UUID,
    after: int,
    through: int | None,
    sealed_through_tick: int | None = None,
) -> RecoveryEventPage:
    reply = await admin.call_function(
        "recovery_wave_events_page",
        {
            "p_player_id": player_id,
            "p_wave_id": str(wave_id),
            "p_after": after,
            "p_through": through,
            "p_sealed_through_tick": sealed_through_tick,
        },
    )
    _refusal(reply)
    if not isinstance(reply, dict) or reply.get("status") != "ok":
        raise SupabaseRejected("The recovery journal could not be read.")
    return RecoveryEventPage.model_validate(
        {key: value for key, value in reply.items() if key != "status"}
    )


async def report_health(
    admin: SupabaseAdmin, player_id: str, wave_id: UUID, report: RecoveryHealthRequest
) -> RecoveryHealthResult:
    if max(len(report.hpUnits), len(report.basisRepairSeq)) > MAX_RECOVERY_STRUCTURES:
        raise ApiError(422, "validation_error", "The health vector is too large.")
    if any(not 0 <= hp <= MAX_HP_UNITS for hp in report.hpUnits.values()):
        raise ApiError(
            422, "validation_error", "Health units must be between zero and full health."
        )
    reply = await admin.call_function(
        "recovery_wave_report_health",
        {
            "p_player_id": player_id,
            "p_wave_id": str(wave_id),
            "p_island_epoch": str(report.islandEpoch),
            "p_checkpoint_uid": report.checkpointUid,
            "p_through_tick": report.throughTick,
            "p_input_head_seq": report.inputHeadSeq,
            "p_last_repair_seq": report.lastRepairSeq,
            "p_basis_repair_seq": {str(k): v for k, v in report.basisRepairSeq.items()},
            "p_hp_units": {str(k): v for k, v in report.hpUnits.items()},
        },
    )
    _refusal(reply)
    if not isinstance(reply, dict) or reply.get("status") != "accepted":
        raise SupabaseRejected("The wave health checkpoint could not be accepted.")
    return RecoveryHealthResult.model_validate(
        {key: value for key, value in reply.items() if key != "status"}
    )
