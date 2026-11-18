"""Shared island treasury identity and server-only financial primitives.

Used by the new permission/economy lanes; existing routes do not call this module yet.
Game purchases must combine their financial and asset change in one SQL transaction.
"""

import re
from uuid import UUID

from server.errors import ApiError
from server.island import treasury_store
from server.island.treasury_models import (
    EconomyContext,
    TreasuryAccount,
    TreasuryResult,
    decimal_string,
)
from server.supabase_admin import SupabaseAdmin

__all__ = [
    "EconomyContext",
    "TreasuryAccount",
    "TreasuryResult",
    "admit",
    "credit",
    "reserve",
    "resolve_economy_context",
    "settle",
    "spend",
]

SPEND_REASONS = frozenset(
    {
        "building_purchase",
        "crew_hire",
        "weapon_purchase",
        "tech_research",
        "wreck_repair",
        "tower_skill",
        "tower_tree",
        "structure_repair",
    }
)
RESERVE_REASONS = frozenset(
    {
        "market_stake",
        "market_call_stake",
        "prediction_stake",
        "arena_stake",
    }
)
CREDIT_REASONS = frozenset({"pirate_loot", "building_refund", "boat_game"})


def invalid() -> ApiError:
    return ApiError(422, "invalid_transaction", "The treasury change is not valid.")


def amount(value: int, *, zero: bool = False) -> str:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or value < 0
        or (value == 0 and not zero)
    ):
        raise invalid()
    return decimal_string(value)


def identifier(value: str) -> str:
    if not isinstance(value, str):
        raise invalid()
    try:
        return str(UUID(value))
    except ValueError as error:
        raise invalid() from error


def operation(action_uid: str, reference: str) -> None:
    if not isinstance(action_uid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", action_uid):
        raise invalid()
    if not isinstance(reference, str) or not 1 <= len(reference) <= 120 or not reference.strip():
        raise invalid()


def scope(context: EconomyContext) -> dict:
    if context.mode != "island_shared" or context.version != 1:
        raise ApiError(409, "economy_context_required", "Reload this island's treasury.")
    return {
        "p_actor_id": identifier(context.actor_id),
        "p_account_id": identifier(context.account_id),
        "p_run_epoch": identifier(context.run_epoch),
    }


async def resolve_economy_context(
    admin: SupabaseAdmin, actor_id: str, island_owner: str, *, expected_epoch: str | None = None
) -> EconomyContext:
    actor_id, island_owner = identifier(actor_id), identifier(island_owner)
    if expected_epoch is not None:
        expected_epoch = identifier(expected_epoch)
    row = treasury_store.check_status(
        await admin.call_function(
            "island_economy_context",
            {"p_island_owner": island_owner},
        )
    )
    if row.get("status") == "legacy" and row.get("islandOwner") == island_owner:
        if expected_epoch is not None:
            raise ApiError(409, "economy_context_required", "This island uses legacy accounting.")
        return EconomyContext("personal_legacy", 0, actor_id, island_owner, None, None, None)
    if row.get("status") != "ok":
        raise treasury_store.unreadable()
    account = treasury_store.read_envelope(row.get("economy"))
    if account.island_owner != island_owner:
        raise treasury_store.unreadable()
    if expected_epoch is not None and expected_epoch != account.run_epoch:
        raise ApiError(409, "economy_epoch_mismatch", "This island has started another run.")
    return EconomyContext(
        "island_shared",
        1,
        actor_id,
        island_owner,
        account.account_id,
        account.run_epoch,
        account.revision,
    )


async def admit(
    admin: SupabaseAdmin, actor_id: str, island_owner: str, action_uid: str, starting_coins: int
) -> TreasuryResult:
    operation(action_uid, "starting_coins")
    return await treasury_store.call(
        admin,
        "island_treasury_admit",
        {
            "p_actor_id": identifier(actor_id),
            "p_island_owner": identifier(island_owner),
            "p_action_uid": action_uid,
            "p_starting_coins": amount(starting_coins, zero=True),
        },
    )


async def spend(
    admin: SupabaseAdmin,
    context: EconomyContext,
    coins: int,
    reason: str,
    reference: str,
    action_uid: str,
) -> TreasuryResult:
    operation(action_uid, reference)
    if reason not in SPEND_REASONS:
        raise invalid()
    return await treasury_store.call(
        admin,
        "island_treasury_spend",
        {
            **scope(context),
            "p_action_uid": action_uid,
            "p_reason": reason,
            "p_reference": reference,
            "p_amount": amount(coins),
        },
    )


async def reserve(
    admin: SupabaseAdmin,
    context: EconomyContext,
    principal: int,
    fee: int,
    reason: str,
    reference: str,
    action_uid: str,
) -> TreasuryResult:
    operation(action_uid, reference)
    if reason not in RESERVE_REASONS:
        raise invalid()
    return await treasury_store.call(
        admin,
        "island_treasury_reserve",
        {
            **scope(context),
            "p_action_uid": action_uid,
            "p_reason": reason,
            "p_reference": reference,
            "p_principal": amount(principal),
            "p_fee": amount(fee, zero=True),
        },
    )


async def credit(
    admin: SupabaseAdmin,
    *,
    actor_id: str,
    account_id: str,
    run_epoch: str,
    coins: int,
    reason: str,
    reference: str,
    action_uid: str,
) -> TreasuryResult:
    operation(action_uid, reference)
    if reason not in CREDIT_REASONS:
        raise invalid()
    return await treasury_store.call(
        admin,
        "island_treasury_credit",
        {
            "p_actor_id": identifier(actor_id),
            "p_account_id": identifier(account_id),
            "p_run_epoch": identifier(run_epoch),
            "p_action_uid": action_uid,
            "p_reason": reason,
            "p_reference": reference,
            "p_amount": amount(coins),
        },
    )


async def settle(
    admin: SupabaseAdmin,
    reservation_id: str,
    returned_payout: int,
    reference: str,
    action_uid: str,
) -> TreasuryResult:
    operation(action_uid, reference)
    return await treasury_store.call(
        admin,
        "island_treasury_settle",
        {
            "p_reservation_id": identifier(reservation_id),
            "p_returned_payout": amount(returned_payout, zero=True),
            "p_reference": reference,
            "p_action_uid": action_uid,
        },
    )
