"""Treasury settlement arguments from verified product results. Used by Harbor integration.

Only the source reservation identifies its actor, account and epoch. No current membership,
current island, client payout or private-wallet fallback may choose the recipient. The common
treasury primitive owns settlement uniqueness and immutable replay checking.
"""

import re
from uuid import UUID

from server.island.wager_rules import invalid_transaction, nonnegative_whole

ACTION_UID = re.compile(r"[A-Za-z0-9_-]{8,64}\Z")


def settlement_arguments(
    reservation_id: UUID, returned_payout: object, reference: str, action_uid: str
) -> dict[str, str]:
    """Arguments of public.island_treasury_settle, including zero-payout losses.

    The returned payout is the verifier's whole-coin value INCLUDING returned principal,
    AFTER any supported closing fees. Callers must atomically persist the product decision
    with settlement, or durably retry an immutable settlement intent. This builder performs
    no read, write, permission check or money movement.
    """
    payout = nonnegative_whole(returned_payout)
    if not isinstance(reservation_id, UUID):
        raise invalid_transaction()
    if not isinstance(reference, str) or not reference.strip():
        raise invalid_transaction()
    if not isinstance(action_uid, str) or ACTION_UID.fullmatch(action_uid) is None:
        raise invalid_transaction()
    return {
        "p_reservation_id": str(reservation_id),
        "p_returned_payout": str(payout),
        "p_reference": reference,
        "p_action_uid": action_uid,
    }
