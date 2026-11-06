"""The prediction desk service: puts the questions, Manifold, the rules and the database together.

routes/predictions.py is thin. It checks who is asking and which feature flag is on, then calls one
of the four methods of PredictionDesk:
  * overview()  the questions with their pools and what Manifold says (public)
  * mine()      one captain's coins, today's stakes and results
  * stake()     one stake for a signed-in captain
  * settle()    one settlement by a host: pay the winners, or refund everybody

How a stake is made, in order (the first refusal wins):
  1. A speed limit per player (limits.py).
  2. A look in the history: a stake id that was used already is answered "already applied",
     whatever else has changed since (a closed pool, a new Manifold state).
  3. The question must be on the list and read by a person (questions.py).
  4. The size of the stake (stake_rules.py).
  5. Manifold. The reading must be real: live, cached or stale. With only the recording, outside
     demo mode, the answer is 503 source_unavailable. So it is with a stale reading older than
     15 minutes (the last good answer, kept because Manifold cannot be reached): it is still
     shown, but nobody may stake on it, because the market may have been decided since and some
     captains would know before the desk does. A market that Manifold closed or decided is
     closed for us too.
  6. The closing time: the earliest of ours and Manifold's.
  7. The wallet rules check the coin movement, exactly like every other coin change.
  8. The database function prediction_place_stake does the rest in ONE step (store.py). It checks
     the closing time again, one stake per question and the daily cap, under the lock of the pool.

How a settlement is made, in order:
  1. The question must be on the list. A pool that is settled already answers "already applied".
  2. Manifold is asked, but only as a cross-check: if it has decided yes or no, the host must
     choose the same. If Manifold decided void, the host can only void. Void is always allowed.
     With only the recording (or no data) there is no cross-check, and the host's word stands.
     A stale reading counts for the cross-check however old it is: the age limit is for stakes.
  3. Yes or no only after staking has closed (the earliest closing time we know).
  4. The stakes are read, pools.py works out who gets how many coins, and the database function
     prediction_settle_pool pays everybody in ONE step. It checks the arithmetic again. If the
     pool changed in between (a stake disappeared with a deleted player, or a new stake arrived
     before a void), the stakes are read once more.

Used by: routes/predictions.py and app.py (which builds one PredictionDesk per server).
"""

import asyncio
import logging
from datetime import datetime
from typing import Annotated

import httpx
from fastapi import Depends, Request

from server.adapters.base import CachedSource, SourceUnavailable
from server.clock import Clock, utc_now
from server.errors import ApiError
from server.predictions import store
from server.predictions.limits import StakeLimiter
from server.predictions.pools import VOID, SettlementPlan, plan_settlement
from server.predictions.questions import (
    CONTENT_FOLDER,
    QUESTIONS_FILE,
    Question,
    QuestionsError,
    find_question,
    load_questions,
    served_questions,
)
from server.predictions.refusals import (
    AlreadyDone,
    no_such_question,
    pool_closed,
    pool_open,
    settle_refusal,
    settled_message,
    stake_refusal,
)
from server.predictions.source import make_question_sources
from server.predictions.stake_rules import (
    POOL_CUT_PERCENT,
    check_stake_amount,
    coins_left_today,
    desk_day_start,
    effective_closes_at,
    is_staking_open,
)
from server.predictions.state import (
    CLOSED,
    DECIDED,
    OPEN,
    SETTLED,
    UNKNOWN,
    ManifoldView,
    is_too_old_to_stake,
    question_state,
    read_manifold,
)
from server.predictions.store import PoolRow, SideTotals, StakeRow
from server.predictions.views import (
    MineView,
    QuestionView,
    SettleOrder,
    SettleReceipt,
    StakeLine,
    StakeOrder,
    StakeReceipt,
    build_side_views,
    stake_result,
)
from server.settings import Settings
from server.supabase_admin import AlreadyApplied, SupabaseAdmin
from server.wallet import validate_transaction

logger = logging.getLogger(__name__)

# The ledger references. A stake's ref is this text plus the stakeId that the browser made. A
# payout's ref is this text plus the question id: the same for a win and for a refund.
STAKE_REF_PREFIX = "stake:"
POOL_REF_PREFIX = "pool:"

STAKE_REASON = "prediction_stake"
PAYOUT_REASON = "prediction_payout"


class PredictionDesk:
    """The prediction desk for one server. create_app() makes one and keeps it on the app."""

    def __init__(
        self,
        questions: tuple[Question, ...],
        sources: dict[str, CachedSource],
        clock: Clock = utc_now,
        limiter: StakeLimiter | None = None,
        demo_mode: bool = False,
    ) -> None:
        self.questions = questions
        self.sources = sources
        self.clock = clock
        self.limiter = limiter or StakeLimiter(clock=clock)
        self.demo_mode = demo_mode

    # --- what Manifold says ---

    async def read_manifold_of(self, question: Question, now: datetime) -> ManifoldView:
        """The latest reading of the question's market. With no data at all: unknown."""
        try:
            result = await self.sources[question.id].get()
        except SourceUnavailable:
            return read_manifold(None, now, self.demo_mode)
        return read_manifold(result, now, self.demo_mode)

    async def read_manifolds(
        self, questions: tuple[Question, ...], now: datetime
    ) -> dict[str, ManifoldView]:
        """The readings of several questions at once, by question id."""
        views = await asyncio.gather(*(self.read_manifold_of(q, now) for q in questions))
        return {question.id: view for question, view in zip(questions, views, strict=True)}

    # --- the list ---

    def question_view(
        self,
        question: Question,
        pool: PoolRow | None,
        totals: dict[str, SideTotals],
        manifold: ManifoldView,
        now: datetime,
    ) -> QuestionView:
        sides = build_side_views(totals)
        state = question_state(question, pool, manifold, now)
        return QuestionView(question, state, pool, sides, sum(side.coins for side in sides))

    async def overview(self, admin: SupabaseAdmin) -> tuple[QuestionView, ...]:
        """Every question a person has read, with its pool and what Manifold says."""
        now = self.clock()
        served = served_questions(self.questions)
        ids = [question.id for question in served]
        pools = await store.read_pools(admin, ids)
        totals = await store.read_side_totals(admin, ids)
        manifolds = await self.read_manifolds(served, now)
        return tuple(
            self.question_view(
                question,
                pools.get(question.id),
                totals.get(question.id, {}),
                manifolds[question.id],
                now,
            )
            for question in served
        )

    # --- my stakes ---

    def stake_line(
        self,
        stake: StakeRow,
        pool: PoolRow | None,
        manifolds: dict[str, ManifoldView],
        now: datetime,
    ) -> StakeLine:
        question = next((q for q in self.questions if q.id == stake.question_id), None)
        if question is not None:
            state = question_state(question, pool, manifolds[question.id], now)
            status = state.status
        elif pool is not None and pool.status == SETTLED:
            status = SETTLED
        else:
            status = OPEN if pool is not None and is_staking_open(pool.closes_at, now) else CLOSED
        return StakeLine(stake, question, status, pool, stake_result(stake, pool))

    async def mine(self, admin: SupabaseAdmin, player_id: str) -> MineView:
        """A captain's coins, what they staked today, and their newest stakes with the results."""
        now = self.clock()
        coins = await store.read_balance(admin, player_id)
        staked_today = await store.read_staked_today(admin, player_id, desk_day_start(now))
        rows = await store.read_player_stakes(admin, player_id)
        ids = sorted({row.question_id for row in rows})
        pools = await store.read_pools(admin, ids)
        listed = tuple(q for q in self.questions if q.id in ids)
        manifolds = await self.read_manifolds(listed, now)
        lines = tuple(
            self.stake_line(row, pools.get(row.question_id), manifolds, now) for row in rows
        )
        return MineView(coins, staked_today, coins_left_today(staked_today), lines)

    # --- a stake ---

    async def manifold_for_stake(self, question: Question, now: datetime) -> ManifoldView:
        """The reading a stake needs: a real one, from a market that is still open on Manifold.

        Raises 503 source_unavailable with only the recording (outside demo mode), with no data,
        or with a stale reading older than STALE_LIMIT_FOR_STAKE, and 409 pool_closed if Manifold
        has closed or decided the market. (A stale reading that already says "decided" or "closed"
        gives 409 pool_closed however old it is: that is the safe direction, and the more helpful
        answer.)
        """
        source = self.sources[question.id]
        result = await source.get()  # raises SourceUnavailable if there is nothing at all
        manifold = read_manifold(result, now, self.demo_mode)
        if manifold.state == UNKNOWN:
            raise SourceUnavailable(source.name)
        if manifold.state in (CLOSED, DECIDED):
            raise pool_closed(on_manifold=True)
        if is_too_old_to_stake(manifold, now):
            raise SourceUnavailable(source.name)
        return manifold

    async def stake(self, admin: SupabaseAdmin, player_id: str, order: StakeOrder) -> StakeReceipt:
        """Stake for a captain. Raises an ApiError if the rules do not allow it."""
        self.limiter.check(player_id)
        if await store.stake_exists(admin, player_id, order.stake_id):
            raise AlreadyDone("This stake was already placed.")

        question = find_question(self.questions, order.question_id)
        if question is None:
            raise no_such_question()
        check_stake_amount(order.amount)
        now = self.clock()
        manifold = await self.manifold_for_stake(question, now)
        closes_at = effective_closes_at(question.closes_at, manifold.closes_at, manifold.decided_at)
        if not is_staking_open(closes_at, now):
            raise pool_closed()
        validate_transaction(-order.amount, STAKE_REASON, f"{STAKE_REF_PREFIX}{order.stake_id}")

        arguments = store.place_stake_arguments(
            player_id,
            question.id,
            order.side,
            order.amount,
            order.stake_id,
            closes_at,
            desk_day_start(now),
        )
        try:
            outcome = await store.run_place_stake(admin, arguments)
        except AlreadyApplied as error:  # the same stake id arrived twice at the same moment
            raise AlreadyDone("This stake was already placed.") from error
        if not outcome.done:
            raise stake_refusal(outcome)
        sides = build_side_views(outcome.sides)
        return StakeReceipt(
            question,
            order.side,
            order.amount,
            outcome.balance,
            outcome.staked_today,
            coins_left_today(outcome.staked_today),
            sides,
            sum(side.coins for side in sides),
        )

    # --- a settlement ---

    def check_against_manifold(self, outcome: str, manifold: ManifoldView) -> None:
        """A real reading that is decided limits the host: the same yes or no, or void.

        Void is always allowed. With only the recording, or no data, there is nothing to check
        against and the host's word stands.
        """
        if outcome == VOID or not manifold.is_real or manifold.state != DECIDED:
            return
        if manifold.decided_as == VOID:
            raise ApiError(
                409,
                "outcome_conflict",
                "Manifold cancelled this question or gave no clear YES or NO. Void it.",
            )
        if manifold.decided_as != outcome:
            raise ApiError(
                409,
                "outcome_conflict",
                f"Manifold decided this question as {manifold.decided_as.upper()}. "
                f"Settle it as {manifold.decided_as}, or void it.",
            )

    def check_payout_moves(self, plan: SettlementPlan, question: Question) -> None:
        """Check each coin movement of the settlement with the wallet rules, before the database."""
        ref = f"{POOL_REF_PREFIX}{question.id}"
        for payout in plan.payouts:
            validate_transaction(payout.coins, PAYOUT_REASON, ref)

    async def settled_already(self, admin: SupabaseAdmin, question: Question) -> AlreadyDone:
        """The error for a pool that was settled by somebody else a moment ago."""
        pool = await store.read_pool(admin, question.id)
        return AlreadyDone(settled_message(pool))

    async def settle_once(
        self, admin: SupabaseAdmin, question: Question, order: SettleOrder, closes_at: datetime
    ) -> store.SettleOutcome:
        """Read the stakes, work out the payouts and run the database function once."""
        stakes = await store.read_pool_stakes(admin, question.id)
        plan = plan_settlement(stakes, order.outcome, POOL_CUT_PERCENT)
        self.check_payout_moves(plan, question)
        arguments = store.settle_arguments(
            question.id, order.outcome, closes_at, plan.payouts, store.SETTLED_BY_HOST
        )
        try:
            return await store.run_settle(admin, arguments)
        except AlreadyApplied as error:  # another host settled the pool at the same moment
            raise await self.settled_already(admin, question) from error

    async def settle(self, admin: SupabaseAdmin, order: SettleOrder) -> SettleReceipt:
        """Settle a pool for a host. Raises an ApiError if the rules do not allow it."""
        question = find_question(self.questions, order.question_id)
        if question is None:
            raise no_such_question()
        pool = await store.read_pool(admin, question.id)
        if pool is not None and pool.status == SETTLED:
            raise AlreadyDone(settled_message(pool))

        now = self.clock()
        manifold = await self.read_manifold_of(question, now)
        self.check_against_manifold(order.outcome, manifold)
        state = question_state(question, pool, manifold, now)
        if order.outcome != VOID and state.status == OPEN:
            raise pool_open(state.closes_at)

        outcome = await self.settle_once(admin, question, order, state.closes_at)
        if not outcome.done and outcome.reason == "stakes_changed":
            outcome = await self.settle_once(admin, question, order, state.closes_at)
        if not outcome.done:
            raise settle_refusal(outcome)
        logger.info(
            "Settled %s as %s (%s): %d payouts, %d coins, %d coins left the game.",
            question.id,
            order.outcome,
            outcome.settlement,
            outcome.paid_players,
            outcome.paid_coins,
            outcome.cut_coins,
        )
        return SettleReceipt(
            question,
            order.outcome,
            outcome.settlement,
            outcome.settled_at,
            outcome.paid_players,
            outcome.paid_coins,
            outcome.cut_coins,
        )


def desk_from_settings(
    settings: Settings,
    transport: httpx.AsyncBaseTransport | None = None,
    clock: Clock = utc_now,
    folder=CONTENT_FOLDER,
) -> PredictionDesk:
    """Build the real desk: the questions file, one source for each question, the rules.

    Building it never calls the network: a source asks Manifold only when it is asked. In demo
    mode no source ever does. A mistake in the questions file raises QuestionsError here, with a
    message that says where.
    """
    questions = load_questions(folder / QUESTIONS_FILE.name)
    sources = make_question_sources(questions, settings, transport, clock, folder)
    return PredictionDesk(questions, sources, clock=clock, demo_mode=settings.demo_mode)


def desk_or_none(settings: Settings) -> PredictionDesk | None:
    """Like desk_from_settings, but a broken questions file does not stop the whole server.

    The desk is a feature that is switched off by default. If its data cannot be read (for
    example it did not make it into the deployment), the rest of the API must keep working. The
    error goes to the log, and the desk routes answer 503 predictions_unavailable.
    """
    try:
        return desk_from_settings(settings)
    except QuestionsError as error:
        logger.error("The prediction desk cannot start: %s", error)
        return None


def get_desk(request: Request) -> PredictionDesk:
    """FastAPI dependency: the desk that create_app() stored on the app."""
    desk = request.app.state.predictions
    if desk is None:
        raise ApiError(
            503, "predictions_unavailable", "The prediction desk is not available right now."
        )
    return desk


# Write `desk: DeskDep` in a route and FastAPI hands you the desk.
DeskDep = Annotated[PredictionDesk, Depends(get_desk)]
