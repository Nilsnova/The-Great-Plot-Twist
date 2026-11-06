"""The Lantern Duels service: puts the rules, the views and the database together for the routes.

routes/duels.py is thin. It checks who is asking and whether the flag "arena" is on, then calls
one of the five methods of DuelService:
  * list()    a captain's duels in three lists, the open challenges of others, and their coins
  * get()     one duel in full, from the point of view of the caller
  * create()  send a challenge (seal the challenger's signals, hold the stake)
  * answer()  answer one: seal the answerer's signals, open both envelopes, settle the coins
  * cancel()  withdraw a challenge (the challenger) or decline it (the named captain)

How a challenge is sent:
  1. A look in the history: a click that was sent already is answered "already applied".
  2. rules.py checks the rounds, the stake and the signals (the oil).
  3. The database function duel_create does the rest in ONE step: the duel, the challenger's
     envelope and the stake. It refuses a name nobody has, or two captains share, and a fourth
     waiting challenge.

How an answer is made:
  1. The duel is read. A named duel for somebody else is a 404; an open challenge never is.
  2. The caller's own envelope is read: the same actionUid is a repeat ("already applied"), any
     other means they sealed before ("already sealed", which includes the challenger).
  3. A duel that is closed is "taken" or "closed", and one past its deadline is refunded (the
     lazy expiry below) and refused.
  4. rules.py checks the signals, and resolves the duel against the challenger's envelope. This
     is the only moment the server READS the challenger's signals for somebody else: to work out
     the result. They go nowhere except into the database function.
  5. The database function duel_answer settles everything in ONE step: the answerer's stake and
     envelope, the results, and the payout or the refunds.

Timeouts are lazy. Nothing runs on a timer (Vercel Cron cannot be used with Services). A challenge
past its deadline is closed, and its stake returned, by the next request that touches it: the
list or the detail of either captain, a cancel, or an answer attempt. The database clock decides
(duel_void refuses with not_expired if its clock disagrees), so a challenge is never refunded
early.

Sealed means sealed. views.py decides what a captain may see. This file reads the OTHER captain's
envelope only for a finished duel (to build the reveal) or to resolve an answer.

Used by: routes/duels.py and app.py (which builds one DuelService per server).
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Any

from fastapi import Depends, Request

from server.clock import Clock, utc_now
from server.duels import rules, store, views
from server.duels.refusals import refusal_error
from server.duels.rules import Resolution
from server.duels.store import DuelRow
from server.supabase_admin import AlreadyApplied, SupabaseAdmin, SupabaseRejected

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ChallengeOrder:
    """What a captain asked for when sending a challenge. The route builds it."""

    opponent_name: str | None  # None: an open challenge
    rounds: int
    stake: int
    signals: tuple[str, ...]
    action_uid: str  # made by the browser once per click; the same again if the click is repeated


@dataclass(frozen=True)
class AnswerOrder:
    """What a captain asked for when answering a challenge."""

    signals: tuple[str, ...]
    action_uid: str


@dataclass(frozen=True)
class DuelReceipt:
    """One duel in full after an action (or a look), and the caller's coins if they changed."""

    detail: dict[str, Any]  # views.detail(): the exact JSON keys of the contract
    coins: int | None  # the caller's balance after the action; None if it is not part of the answer
    now: datetime


@dataclass(frozen=True)
class DuelListing:
    """A captain's view of the ring: their duels in lists, and their coins."""

    coins: int
    held_coins: int  # coins held in challenges that are still waiting
    incoming: list[dict[str, Any]]
    open_challenges: list[dict[str, Any]]
    yours: list[dict[str, Any]]
    recent: list[dict[str, Any]]
    now: datetime


class DuelService:
    """Lantern Duels for one server. create_app() makes one and keeps it on the app."""

    def __init__(self, clock: Clock = utc_now) -> None:
        self.clock = clock

    # --- helpers ---

    @staticmethod
    async def read_visible(admin: SupabaseAdmin, player_id: str, duel_id: str) -> DuelRow:
        """The duel, or a 404 if it is not there or this captain may not see it."""
        duel = await store.read_duel(admin, duel_id)
        if duel is None or not views.can_see(duel, player_id):
            raise refusal_error("no_such_duel")
        return duel

    @staticmethod
    async def void_if_expired(admin: SupabaseAdmin, duel: DuelRow, player_id: str) -> bool:
        """Close a challenge whose window has passed and give the stake back. True if it did.

        A refusal means there is nothing to do: the database clock says the window is not over
        yet (not_expired), or somebody closed the duel first (duel_closed).
        """
        arguments = store.void_arguments(duel.id, player_id, rules.EXPIRED)
        outcome = await store.run_void(admin, arguments)
        return outcome.done

    @staticmethod
    def captains_in(duels: list[DuelRow]) -> list[str | None]:
        ids: list[str | None] = []
        for duel in duels:
            ids.extend([duel.challenger_id, duel.opponent_id])
        return ids

    @staticmethod
    async def build_detail(
        admin: SupabaseAdmin, player_id: str, duel: DuelRow, now: datetime
    ) -> dict[str, Any]:
        """One duel in full, from the point of view of `player_id`.

        The caller's own envelope is read for a participant. The OTHER captain's envelope is read
        only when the duel is finished, and views.detail() refuses it in any other case.
        """
        role = views.role_of(duel, player_id)
        own_signals = None
        other_signals = None
        if role != views.VISITOR:
            own_signals = (await store.read_envelope(admin, duel.id, player_id)).signals
            other_id = duel.opponent_id if role == rules.CHALLENGER else duel.challenger_id
            if duel.status == rules.FINISHED and other_id is not None:
                other_signals = (await store.read_envelope(admin, duel.id, other_id)).signals
        names = await store.read_names(admin, [duel.challenger_id, duel.opponent_id])
        return views.detail(duel, player_id, names, now, own_signals, other_signals)

    async def receipt(
        self, admin: SupabaseAdmin, player_id: str, duel_id: str, coins: int | None, now: datetime
    ) -> DuelReceipt:
        """Read the duel back after an action and answer with it, as GET would."""
        duel = await store.read_duel(admin, duel_id)
        if duel is None:
            raise SupabaseRejected("The duel could not be read back.")
        return DuelReceipt(await self.build_detail(admin, player_id, duel, now), coins, now)

    # --- GET /api/duels/{id} ---

    async def get(self, admin: SupabaseAdmin, player_id: str, duel_id: str) -> DuelReceipt:
        """One duel in full. An expired challenge is closed and refunded first."""
        now = self.clock()
        duel = await self.read_visible(admin, player_id, duel_id)
        if duel.status == rules.OPEN and views.window_has_passed(duel, now):
            await self.void_if_expired(admin, duel, player_id)
            duel = await self.read_visible(admin, player_id, duel_id)
        return DuelReceipt(await self.build_detail(admin, player_id, duel, now), None, now)

    # --- POST /api/duels ---

    async def create(
        self, admin: SupabaseAdmin, player_id: str, order: ChallengeOrder
    ) -> DuelReceipt:
        """Send a challenge. Raises an ApiError if the rules do not allow it."""
        if await store.create_uid_exists(admin, player_id, order.action_uid):
            raise AlreadyApplied()
        rules.check_choices(order.rounds, order.stake)
        rules.check_sequence(order.signals, order.rounds)

        arguments = store.create_arguments(
            player_id,
            order.opponent_name,
            order.rounds,
            order.stake,
            order.signals,
            order.action_uid,
        )
        outcome = await store.run_create(admin, arguments)
        if not outcome.done:
            raise refusal_error(outcome.reason)
        return await self.receipt(admin, player_id, outcome.duel_id, outcome.balance, self.clock())

    # --- POST /api/duels/{id}/move ---

    async def check_answerable(
        self, admin: SupabaseAdmin, duel: DuelRow, player_id: str, action_uid: str, now: datetime
    ) -> None:
        """Steps 2 and 3 of an answer: not sealed before, the duel is open, the window is open."""
        mine = await store.read_envelope(admin, duel.id, player_id)
        if mine.is_sealed:
            if mine.action_uid == action_uid:
                raise AlreadyApplied()
            raise refusal_error("already_sealed")
        if duel.status != rules.OPEN:
            answered = duel.is_open and duel.status == rules.FINISHED
            raise refusal_error("duel_taken" if answered else "duel_closed")
        if views.window_has_passed(duel, now):
            await self.void_if_expired(admin, duel, player_id)
            raise refusal_error("duel_expired")

    @staticmethod
    async def resolve_against_the_challenger(
        admin: SupabaseAdmin, duel: DuelRow, signals: tuple[str, ...]
    ) -> Resolution:
        """Open both envelopes: read the challenger's signals (server only), work out the result."""
        challenger = await store.read_envelope(admin, duel.id, duel.challenger_id)
        if len(challenger.signals) != duel.rounds:
            logger.warning("A duel has an envelope that does not fit its rounds.")
            raise SupabaseRejected("The duel is not in a state we can answer.")
        return rules.resolve(challenger.signals, signals)

    async def answer(
        self, admin: SupabaseAdmin, player_id: str, duel_id: str, order: AnswerOrder
    ) -> DuelReceipt:
        """Answer a challenge. Raises an ApiError if the rules do not allow it."""
        now = self.clock()
        duel = await store.read_duel(admin, duel_id)
        # A named duel is hidden from other captains. An open challenge is never a 404 for a
        # signed-in captain, so a late visitor hears "taken" instead.
        if duel is None or (not duel.is_open and views.role_of(duel, player_id) == views.VISITOR):
            raise refusal_error("no_such_duel")
        await self.check_answerable(admin, duel, player_id, order.action_uid, now)
        rules.check_sequence(order.signals, duel.rounds)

        resolution = await self.resolve_against_the_challenger(admin, duel, order.signals)
        day_start = rules.duel_day_start(now)
        arguments = store.answer_arguments(
            duel.id, player_id, order.signals, order.action_uid, resolution, day_start
        )
        outcome = await store.run_answer(admin, arguments)
        if not outcome.done:
            if outcome.reason == "duel_expired":
                await self.void_if_expired(admin, duel, player_id)
            raise refusal_error(outcome.reason)
        return await self.receipt(admin, player_id, duel.id, outcome.balance, now)

    # --- POST /api/duels/{id}/cancel ---

    @staticmethod
    def closing_status(duel: DuelRow, role: str, now: datetime) -> str:
        """withdrawn, declined or expired: how this caller closes this duel."""
        if duel.status == rules.OPEN and views.window_has_passed(duel, now):
            return rules.EXPIRED
        return rules.WITHDRAWN if role == rules.CHALLENGER else rules.DECLINED

    async def cancel(self, admin: SupabaseAdmin, player_id: str, duel_id: str) -> DuelReceipt:
        """Withdraw a challenge (the challenger) or decline it (the named captain).

        After the deadline the same call closes it as expired, with the same refund. A duel that
        is expired already is answered "already applied", whoever asks again.
        """
        now = self.clock()
        duel = await self.read_visible(admin, player_id, duel_id)
        role = views.role_of(duel, player_id)
        if role == views.VISITOR:
            raise refusal_error("not_your_duel")
        if duel.status == rules.EXPIRED:
            # A first cancel after the deadline, or a clean-up, closed it as expired and gave the
            # stake back. The database would call a second cancel "closed some other way", but for
            # the caller it is a repeat: nothing is left to do, so say "already applied".
            raise AlreadyApplied()

        new_status = self.closing_status(duel, role, now)
        outcome = await store.run_void(admin, store.void_arguments(duel.id, player_id, new_status))
        if not outcome.done and outcome.reason == "not_expired":
            # The two clocks disagree by a hair. Close it the normal way instead.
            new_status = rules.WITHDRAWN if role == rules.CHALLENGER else rules.DECLINED
            outcome = await store.run_void(
                admin, store.void_arguments(duel.id, player_id, new_status)
            )
        if not outcome.done:
            raise refusal_error(outcome.reason)
        coins = outcome.challenger_balance if role == rules.CHALLENGER else None
        return await self.receipt(admin, player_id, duel.id, coins, now)

    # --- GET /api/duels ---

    async def sweep(
        self, admin: SupabaseAdmin, duels: list[DuelRow], player_id: str, now: datetime
    ) -> bool:
        """Close the captain's expired challenges, at most SWEEP_LIMIT per request.

        True if at least one was closed, so the caller reads the list again.
        """
        asked = 0
        closed_any = False
        for duel in duels:
            if asked >= rules.SWEEP_LIMIT:
                break
            if duel.status == rules.OPEN and views.window_has_passed(duel, now):
                asked += 1
                closed_any = await self.void_if_expired(admin, duel, player_id) or closed_any
        return closed_any

    @staticmethod
    def summaries(
        duels: list[DuelRow], player_id: str, names: dict[str, str], now: datetime
    ) -> list[dict[str, Any]]:
        return [views.summary(duel, player_id, names, now) for duel in duels]

    async def list(self, admin: SupabaseAdmin, player_id: str) -> DuelListing:
        """A captain's duels in lists. Their expired challenges are closed and refunded first."""
        now = self.clock()
        duels = await store.read_my_duels(admin, player_id)
        if await self.sweep(admin, duels, player_id, now):
            duels = await store.read_my_duels(admin, player_id)
        others = await store.read_open_challenges(admin, player_id, now)
        coins = await store.read_balance(admin, player_id)
        names = await store.read_names(admin, self.captains_in(duels + others))

        mine = views.split_my_duels(duels, player_id, now)
        return DuelListing(
            coins=coins,
            held_coins=views.held_coins(duels, player_id),
            incoming=self.summaries(mine.incoming, player_id, names, now),
            open_challenges=self.summaries(others, player_id, names, now),
            yours=self.summaries(mine.yours, player_id, names, now),
            recent=self.summaries(mine.recent, player_id, names, now),
            now=now,
        )


def get_duels(request: Request) -> DuelService:
    """FastAPI dependency: the service that create_app() stored on the app."""
    return request.app.state.duels


# Write `duels: DuelsDep` in a route and FastAPI hands you the service.
DuelsDep = Annotated[DuelService, Depends(get_duels)]
