"""Inactive shared ship-game transaction adapters; public legacy routes are unchanged.

Used by focused adapter tests and future versioned routes. Authentication supplies actor_id;
SQL alone binds round origin and atomically rechecks the exact reserved economy authority.
"""

from server.errors import ApiError
from server.island.boat import BOAT, check_claim
from server.island.economy_operations import root_action_uid
from server.island.shared_boat_store import ClaimRow, StartRow, read_claim, read_start
from server.island.treasury import identifier
from server.island.treasury_store import unreadable
from server.supabase_admin import SupabaseAdmin


def expected_epoch(value: str | None) -> str:
    if value is None:
        raise ApiError(409, "economy_context_required", "Read the island's current run first.")
    return identifier(value)


async def start_round(
    admin: SupabaseAdmin,
    actor_id: str,
    island_owner: str,
    run_epoch: str | None,
    game: str,
    action_uid: str,
) -> StartRow:
    """Create an original server round, or replay only this actor's exact prior start."""
    actor, owner, epoch = identifier(actor_id), identifier(island_owner), expected_epoch(run_epoch)
    if game not in BOAT.games:
        check_claim(game, 0)
    row = read_start(
        await admin.call_function(
            "island_shared_boat_start",
            {
                "p_actor_id": actor,
                "p_island_owner": owner,
                "p_run_epoch": epoch,
                "p_game": game,
                "p_action_uid": root_action_uid(action_uid),
            },
        )
    )
    source = row.receipt.result.round
    if row.receipt.actionUid != action_uid:
        raise unreadable()
    if (str(source.actorId), str(source.islandOwner), str(source.runEpoch), source.game) != (
        actor,
        owner,
        epoch,
        game,
    ):
        raise unreadable()
    return row


async def claim_round(
    admin: SupabaseAdmin,
    actor_id: str,
    round_id: str,
    run_epoch: str | None,
    stars: int,
    action_uid: str,
) -> ClaimRow:
    """Claim a bound round; no caller account, record, price or recipient is accepted.

    No separate current-context preflight blocks historical receipt retries after departure.
    New claims are authorized inside the same SQL transaction as bucket and treasury changes.
    """
    actor, origin, epoch = identifier(actor_id), identifier(round_id), expected_epoch(run_epoch)
    check_claim(BOAT.games[0], stars)
    row, _ = read_claim(
        await admin.call_function(
            "island_shared_boat_claim",
            {
                "p_actor_id": actor,
                "p_round_id": origin,
                "p_run_epoch": epoch,
                "p_stars": stars,
                "p_action_uid": root_action_uid(action_uid),
            },
        )
    )
    receipt = row.receipt
    if receipt.actionUid != action_uid:
        raise unreadable()
    if (
        str(receipt.actorId),
        str(receipt.result.roundId),
        str(receipt.origin.runEpoch),
        receipt.result.stars,
    ) != (
        actor,
        origin,
        epoch,
        stars,
    ):
        raise unreadable()
    return row
