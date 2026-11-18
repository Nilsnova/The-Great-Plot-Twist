"""Immutable player-operation identities and disjoint financial effect identifiers.

Used by shared domain adapters. Claims execute inside their SQL transaction, not through a
separate network call. These formatters grant no authority to create an operation or payout.
"""

import re
from dataclasses import dataclass
from uuid import UUID

from server.errors import ApiError
from server.supabase_admin import SupabaseRejected


@dataclass(frozen=True)
class OperationClaim:
    operation_id: str
    repeat: bool


def invalid() -> ApiError:
    return ApiError(422, "invalid_transaction", "The operation identity is not valid.")


def root_action_uid(value: str) -> str:
    if (
        not isinstance(value, str)
        or not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", value)
        or value.startswith(("fx_", "sys_"))
    ):
        raise invalid()
    return value


def _effect_identifier(origin_id: str, key: str, prefix: str) -> str:
    if not isinstance(key, str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,15}", key):
        raise invalid()
    if not isinstance(origin_id, str):
        raise invalid()
    try:
        origin = UUID(origin_id)
    except ValueError as error:
        raise invalid() from error
    return f"{prefix}_{origin.hex}_{key}"


def effect_uid(operation_id: str, key: str) -> str:
    return _effect_identifier(operation_id, key, "fx")


def system_uid(origin_id: str, key: str) -> str:
    return _effect_identifier(origin_id, key, "sys")


def read_operation_claim(value: object) -> OperationClaim:
    if not isinstance(value, dict):
        raise SupabaseRejected("The database sent an unreadable operation claim.")
    if value.get("status") == "refused" and set(value) == {"status", "reason"}:
        refusals = {
            "invalid_change": (422, "invalid_transaction"),
            "action_conflict": (409, "idempotency_conflict"),
            "epoch_mismatch": (409, "economy_epoch_mismatch"),
            "path_unavailable": (409, "economy_path_unavailable"),
        }
        reason = value.get("reason")
        refusal = refusals.get(reason) if isinstance(reason, str) else None
        if refusal is not None:
            raise ApiError(*refusal, "The operation cannot be applied with these inputs.")
    try:
        expected_repeat = {"claimed": False, "replay": True}[value["status"]]
        if (
            set(value) != {"status", "operationId", "repeat"}
            or type(value["repeat"]) is not bool
            or value["repeat"] is not expected_repeat
            or not isinstance(value["operationId"], str)
        ):
            raise ValueError("Invalid operation claim.")
        return OperationClaim(str(UUID(value["operationId"])), expected_repeat)
    except (KeyError, ValueError, TypeError) as error:
        raise SupabaseRejected("The database sent an unreadable operation claim.") from error
