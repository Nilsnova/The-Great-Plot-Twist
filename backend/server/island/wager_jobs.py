"""Bounded durable settlement worker. Used by the secret-protected scheduler endpoint."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError

from server.errors import ApiError
from server.island import treasury_store, wager_service, wager_store
from server.market.exchange import MarketService
from server.sports.source import SportsSource
from server.supabase_admin import SupabaseAdmin, SupabaseRejected


class Job(BaseModel):
    model_config = ConfigDict(extra="forbid")
    wagerId: UUID
    product: Literal["market_call", "football"]
    eventId: str


def retry_code(error: Exception) -> str:
    if isinstance(error, ApiError):
        if error.code == "result_pending":
            return "result_pending"
        if error.code in ("database_unavailable", "database_error"):
            return "database_unavailable"
        return "source_unavailable"
    return "worker_error"


async def settle_due_jobs(
    admin: SupabaseAdmin, market: MarketService | None, sports: SportsSource | None,
    *, limit: int = 40,
) -> dict[str, int]:
    """Discovery holds no locks; each original settlement takes common financial locks itself.

    Grouped source requests avoid charging provider budgets once per same-event bet. Failure
    leaves durable retry work. An unavailable market can still receive its clock-based refund.
    """
    row = treasury_store.check_status(await admin.call_function(
        "island_wager_jobs_due", {"p_limit": limit},
    ))
    try:
        if set(row) != {"status", "jobs"} or row["status"] != "done":
            raise ValueError
        if not isinstance(row["jobs"], list) or len(row["jobs"]) > limit:
            raise ValueError
        jobs = [Job.model_validate(job) for job in row["jobs"]]
    except (ValidationError, ValueError, TypeError) as error:
        raise SupabaseRejected("The database sent an unreadable settlement queue.") from error
    result = {"considered": len(jobs), "settled": 0, "retried": 0}
    snapshot = None
    if market is not None and any(job.product == "market_call" for job in jobs):
        try:
            snapshot = await market.snapshot(admin, trading_enabled=True)
        except ApiError:
            pass
    football: dict[str, dict | Exception] = {}
    for job in jobs:
        try:
            if job.product == "market_call":
                state = snapshot.find(job.eventId) if snapshot is not None else None
                evidence = wager_service.market_evidence(state) if state is not None else None
            else:
                if job.eventId not in football:
                    try:
                        if sports is None:
                            raise ApiError(503, "sports_unavailable", "Sports source unavailable.")
                        reading = await sports.match(job.eventId, fresh=True)
                        football[job.eventId] = wager_service.football_evidence(reading)
                    except Exception as error:
                        football[job.eventId] = error
                evidence = football[job.eventId]
                if isinstance(evidence, Exception):
                    raise evidence
            await wager_store.settle_wager(admin, str(job.wagerId), evidence)
            result["settled"] += 1
        except Exception as error:
            # Never persist/log raw provider or request details in retry diagnostics.
            reply = await admin.call_function("island_wager_job_retry", {
                "p_wager_id": str(job.wagerId), "p_error": retry_code(error),
            })
            if reply != {"status": "done"}:
                treasury_store.check_status(reply)
                raise SupabaseRejected("The wager retry could not be recorded.") from error
            result["retried"] += 1
    return result
