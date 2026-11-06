"""Check immutable partner order rows before exposing receipt or countdown information.

Used by: case snapshot parsing and the player-scoped historical receipt lookup.
"""

from typing import Literal

from pydantic import BaseModel, Field, StrictStr, ValidationError, model_validator

from server.game.case_snapshot import Order
from server.supabase_admin import SupabaseRejected


class OrderRow(BaseModel):
    order_no: int = Field(strict=True, ge=1)
    seat_no: int = Field(strict=True, ge=1, le=4)
    npc_id: StrictStr = Field(pattern=r"^[a-z0-9_]{2,40}$")
    kind: Literal["fetch", "search", "pin", "man_light", "wait"]
    target: StrictStr
    ordered_by: StrictStr | None
    route_id: StrictStr | None
    result_card: StrictStr | None
    price: int = Field(strict=True, ge=0)
    ordered_second: int = Field(strict=True, ge=0)
    ready_second: int = Field(strict=True, ge=0)
    arrive_second: int | None = Field(strict=True, ge=0)
    found_second: int | None = Field(strict=True, ge=0)
    pin_second: int | None = Field(strict=True, ge=0)

    @model_validator(mode="after")
    def ordered_times(self):
        times = [self.ready_second, self.arrive_second, self.found_second, self.pin_second]
        if any(
            value is not None and not self.ordered_second <= value <= self.ready_second
            for value in times
        ):
            raise ValueError("An order time is inconsistent.")
        return self


def order_from_row(raw: dict, crew_id: str, player_id: str, order_no: int) -> Order:
    if not isinstance(raw, dict) or any(
        raw.get(key) != expected
        for key, expected in (
            ("crew_id", crew_id),
            ("ordered_by", player_id),
            ("order_no", order_no),
        )
    ):
        raise SupabaseRejected("The order receipt belongs to another scope.")
    try:
        return Order(**OrderRow.model_validate(raw).model_dump())
    except (ValidationError, TypeError):
        raise SupabaseRejected("The order receipt could not be read.") from None
