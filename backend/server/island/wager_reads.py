"""Authorized source-account wager pages and public-source choices for shared Harbor cards."""

from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, ValidationError

from server.island import treasury_store
from server.island.economy_permissions import require_economy_action
from server.island.treasury_models import decimal_integer
from server.island.treasury_store import EnvelopeRow, Unsigned
from server.supabase_admin import SupabaseAdmin, SupabaseRejected


class Item(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    product: Literal["market_call", "football"]
    eventId: str
    selection: str
    stake: Unsigned
    openedAt: AwareDatetime
    settleAt: AwareDatetime
    status: Literal["open", "won", "lost", "refunded"]
    payout: Unsigned | None
    actorName: str
    home: str | None
    away: str | None


class Page(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["done"]
    economy: EnvelopeRow
    product: Literal["market_call", "football"]
    items: list[Item] = Field(max_length=50)
    nextCursor: UUID | None


async def read_page(
    admin: SupabaseAdmin, actor_id: str, owner: str, product: str,
    *, epoch: str | None = None, cursor: str | None = None,
) -> dict:
    permit = await require_economy_action(
        admin, actor_id, owner, "island_visit", expected_epoch=epoch,
    )
    value = treasury_store.check_status(await admin.call_function("island_wager_page", {
        "p_actor_id": actor_id, "p_island_owner": owner, "p_run_epoch": epoch,
        "p_product": product, "p_cursor": cursor,
    }))
    try:
        page = Page.model_validate(value)
        account = treasury_store.account_from_row(page.economy)
        if (account.account_id, account.run_epoch, account.island_owner, page.product) != (
                permit.context.account_id, permit.context.run_epoch, owner, product):
            raise ValueError
        for item in page.items:
            if item.product != product or decimal_integer(item.stake) < 1:
                raise ValueError
            if (item.status == "open") != (item.payout is None):
                raise ValueError
        return page.model_dump(mode="json", exclude={"status"})
    except (ValidationError, ValueError) as error:
        raise SupabaseRejected("The database sent an unreadable island wager page.") from error
