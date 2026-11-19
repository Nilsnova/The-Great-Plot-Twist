"""Checked shared wager RPCs. Used by trusted Harbor services, with no private-money fallback."""

from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, StrictBool, StrictInt, ValidationError

from server.errors import ApiError
from server.island import treasury_store
from server.island.economy_operations import effect_uid, root_action_uid, system_uid
from server.island.treasury import identifier
from server.island.treasury_models import decimal_integer, decimal_string
from server.island.treasury_store import EnvelopeRow, ReceiptRow, Unsigned
from server.island.wager_rules import WagerIntent
from server.supabase_admin import SupabaseAdmin, SupabaseRejected, SupabaseUnavailable


class Checked(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WagerRow(Checked):
    id: UUID
    operationId: UUID
    actorId: UUID
    accountId: UUID
    runEpoch: UUID
    product: Literal["market_call", "football"]
    eventId: str
    selection: str
    stake: Unsigned
    openedAt: AwareDatetime
    settleAt: AwareDatetime
    sourceReservationId: UUID


class SettlementRow(Checked):
    outcome: Literal["won", "lost", "refunded"]
    returnedPayout: Unsigned
    treasuryReceiptId: UUID
    settledAt: AwareDatetime


class OriginRow(Checked):
    mode: Literal["island_shared"]
    version: StrictInt
    islandOwner: UUID
    accountId: UUID
    runEpoch: UUID


class ResultRow(Checked):
    wager: WagerRow
    settlement: SettlementRow | None
    financialReceipt: ReceiptRow


class Receipt(Checked):
    receiptId: UUID
    actionUid: str | None
    action: Literal["island_bet", "island_bet_settle"]
    actorId: UUID | None
    origin: OriginRow
    result: ResultRow


class WagerReply(Checked):
    status: Literal["done"]
    repeat: StrictBool
    receipt: Receipt
    currentEconomy: EnvelopeRow | None


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an unreadable shared wager answer.")


def read_reply(value: object) -> WagerReply:
    """Reject invented product/financial provenance, noncanonical money and stale scope."""
    try:
        reply = WagerReply.model_validate(value)
        receipt, result = reply.receipt, reply.receipt.result
        wager, financial, origin = result.wager, result.financialReceipt, receipt.origin
        stake = decimal_integer(wager.stake)
        WagerIntent(wager.product, wager.eventId, wager.selection, stake)
        if (origin.version != 1 or wager.settleAt <= wager.openedAt
                or (wager.accountId, wager.runEpoch) != (origin.accountId, origin.runEpoch)
                or (financial.accountId, financial.runEpoch, financial.actorId) != (
                    origin.accountId, origin.runEpoch, wager.actorId)):
            raise unreadable()
        if result.settlement is None:
            root_action_uid(receipt.actionUid)
            expected_reason = (
                "market_call_stake" if wager.product == "market_call" else "prediction_stake"
            )
            valid = (receipt.action == "island_bet" and receipt.actorId == wager.actorId
                     and receipt.receiptId == wager.id and financial.id == wager.sourceReservationId
                     and financial.kind == "reserve" and financial.sourceReservationId is None
                     and financial.actionUid == effect_uid(str(wager.operationId), "stake")
                     and financial.reason == expected_reason
                     and financial.reference == "wager:" + str(wager.id)
                     and decimal_integer(financial.balanceDelta) == 0
                     and decimal_integer(financial.committedDelta) == stake)
        else:
            settlement = result.settlement
            payout = decimal_integer(settlement.returnedPayout)
            expected = {"won": 2 * stake, "lost": 0, "refunded": stake}[settlement.outcome]
            expected_reason = (
                "market_call_payout" if wager.product == "market_call" else "prediction_payout"
            )
            valid = (receipt.action == "island_bet_settle" and receipt.actionUid is None
                     and receipt.actorId is None and receipt.receiptId == financial.id
                     and financial.id == settlement.treasuryReceiptId and payout == expected
                     and financial.kind == "settle"
                     and financial.sourceReservationId == wager.sourceReservationId
                     and financial.actionUid == system_uid(str(wager.id), "settle")
                     and financial.reason == expected_reason
                     and financial.reference == "wager:" + str(wager.id) + ":settle"
                     and decimal_integer(financial.balanceDelta) == payout - stake
                     and decimal_integer(financial.committedDelta) == -stake)
        committed = decimal_integer(financial.committedAtCommit)
        revision = decimal_integer(financial.revisionAtCommit)
        if (not valid or revision < 1 or decimal_integer(financial.balanceAtCommit) < committed):
            raise unreadable()
        if reply.currentEconomy is not None:
            account = treasury_store.account_from_row(reply.currentEconomy)
            if (account.account_id, account.run_epoch, account.island_owner) != (
                    str(origin.accountId), str(origin.runEpoch), str(origin.islandOwner)):
                raise unreadable()
            if account.revision < revision:
                raise unreadable()
        return reply
    except (ValidationError, ValueError, TypeError, ApiError) as error:
        raise unreadable() from error


def opening_arguments(
    actor_id: str, island_owner: str, run_epoch: str, action_uid: str,
    intent: WagerIntent, evidence: dict | None,
) -> dict:
    return {"p_actor_id": identifier(actor_id), "p_island_owner": identifier(island_owner),
            "p_run_epoch": identifier(run_epoch), "p_action_uid": root_action_uid(action_uid),
            "p_product": intent.product, "p_event_id": intent.event_id,
            "p_selection": intent.selection, "p_stake": decimal_string(intent.stake),
            "p_evidence": evidence}


def check_refusal(value: object) -> None:
    if isinstance(value, dict) and value.get("status") == "refused":
        if value.get("reason") == "result_pending":
            raise ApiError(409, "result_pending", "A verified wager price/result is not available.")
        if value.get("reason") == "wager_missing":
            raise ApiError(404, "no_such_wager", "This shared wager does not exist.")
        if value.get("reason") == "harbor_closed":
            raise ApiError(409, "harbor_closed", "Win this island's Harbor unlock wave first.")
        treasury_store.check_status(value)


async def run(admin: SupabaseAdmin, name: str, arguments: dict) -> WagerReply:
    value = await admin.call_function(name, arguments)
    check_refusal(value)
    try:
        return read_reply(value)
    except SupabaseRejected as error:
        # The mutation could have committed before an unreadable response arrived.
        raise SupabaseUnavailable() from error


async def find_replay(
    admin: SupabaseAdmin, actor_id: str, island_owner: str, run_epoch: str,
    action_uid: str, intent: WagerIntent,
) -> WagerReply | None:
    arguments = opening_arguments(actor_id, island_owner, run_epoch, action_uid, intent, None)
    arguments.pop("p_evidence")
    value = await admin.call_function("island_wager_replay", arguments)
    if value == {"status": "missing"}:
        return None
    check_refusal(value)
    reply = read_reply(value)
    if reply.repeat is not True:
        raise unreadable()
    check_open_scope(reply, actor_id, island_owner, run_epoch, action_uid, intent)
    return reply


def check_open_scope(
    reply: WagerReply, actor_id: str, owner: str, epoch: str,
    action_uid: str, intent: WagerIntent,
) -> None:
    receipt, wager = reply.receipt, reply.receipt.result.wager
    if (str(receipt.actorId), str(receipt.origin.islandOwner), str(receipt.origin.runEpoch),
            receipt.actionUid, wager.product, wager.eventId, wager.selection, wager.stake) != (
            identifier(actor_id), identifier(owner), identifier(epoch), action_uid,
            intent.product, intent.event_id, intent.selection, decimal_string(intent.stake)):
        raise unreadable()


async def open_wager(
    admin: SupabaseAdmin, actor_id: str, island_owner: str, run_epoch: str,
    action_uid: str, intent: WagerIntent, evidence: dict,
) -> WagerReply:
    arguments = opening_arguments(actor_id, island_owner, run_epoch, action_uid, intent, evidence)
    reply = await run(admin, "island_wager_open", arguments)
    check_open_scope(reply, actor_id, island_owner, run_epoch, action_uid, intent)
    return reply


async def settle_wager(admin: SupabaseAdmin, wager_id: str, evidence: dict | None) -> WagerReply:
    reply = await run(admin, "island_wager_settle",
                      {"p_wager_id": identifier(wager_id), "p_evidence": evidence})
    if str(reply.receipt.result.wager.id) != identifier(wager_id):
        raise SupabaseUnavailable()
    return reply
