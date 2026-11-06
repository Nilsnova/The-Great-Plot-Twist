"""Prediction desk routes: hand-picked real questions, play-coin pools, a presenter settle button.

Questions come from Manifold Markets (a play-money forecasting site), picked by hand. A captain
stakes play coins on YES or NO, and the winners share the pool. Play money only: coins cannot be
bought, cashed out or exchanged for real prizes, and every answer of the list carries a line that
says so. The rules are in backend/server/predictions/ (pools.py for the pool, stake_rules.py for the
numbers). The routes only check who is asking and which feature flag is on.

    GET  /api/predictions          anyone, no sign-in
    GET  /api/predictions/mine     signed in
    POST /api/predictions/stake    signed in
    POST /api/predictions/settle   host only (the ids in HOST_PLAYER_IDS, see hosts.py)

While the flag "predictions" is off, all four routes answer 404 feature_off ("The prediction desk
is closed for now."). The sign-in or host check runs first, as in the Island Exchange, so a visitor
who is not signed in gets 401 and a player who is not a host gets 403 on /settle.

GET /api/predictions
    -> {"questions": [{"id", "text", "topic", "decidedBy", "closesAt",
                       "status": "open" | "closed" | "settled", "canStake": true or false,
                       "outcome": null | "yes" | "no" | "void",
                       "settlement": null | "winners" | "refund_void" | "refund_no_winners"
                                     | "refund_one_sided",
                       "settledAt": time or null,
                       "manifold": {"state": "open" | "closed" | "decided" | "unknown",
                                    "decidedAs": null | "yes" | "no" | "void",
                                    "decidedAt": time or null},
                       "sides": [{"side": "yes", "label": "Yes", "coins", "players",
                                  "payoutPerCoin"},
                                 {"side": "no", ...}],
                       "totalCoins", "source": "live" | "cache" | "stale" | "fallback" | null,
                       "fetchedAt": time or null}, ...],
        "rules": {"minStake": 1, "maxStake": 50, "dailyCap": 200, "cutPercent": 5,
                  "cutOf": "losing side", "dayStarts": "00:00 Europe/Lisbon"},
        "attribution": "Questions and results: Manifold Markets (manifold.markets), ...",
        "playMoney": "Forecasting with play coins. Play money: no cash value. ..."}
    Only questions that a person has read are listed (a "pending" question is hidden). "canStake"
    is true only when the status is open, the earliest closing time has not passed, Manifold says
    "open" and the reading is real (live, cache or stale; in demo mode the recording too). A
    "stale" reading older than 15 minutes is still shown but is too old to stake on, so "canStake"
    is false then (and the status stays "open"). The browser never decides this. "payoutPerCoin"
    is about how many coins one staked coin brings back if that side wins, rounded DOWN to 2
    decimals; null while nobody staked on the side. It is the only odds shown: Manifold's own
    probability is never in an answer. "source" and "fetchedAt" say how fresh the reading of
    Manifold is (null when there is no data at all). The answer is cached for 10 seconds
    ("Cache-Control: public, max-age=10, s-maxage=10"), so the address takes no query parameters
    (422 validation_error).
    Needs the migration. 503 predictions_unavailable if the questions file is broken.

GET /api/predictions/mine    (Authorization: Bearer <token>)
    -> {"coins": 940, "stakedToday": 70, "leftToday": 130, "dailyCap": 200, "host": false,
        "stakes": [{"questionId", "text", "side", "amount", "placedAt",
                    "status": "open" | "closed" | "settled",
                    "result": null | "won" | "lost" | "refunded", "payout": null or coins,
                    "settlement", "outcome", "settledAt"}, ...]}
    The newest 50 stakes first. "result" follows from the pool: "winners" with a payout above 0 is
    "won", "winners" with a payout of 0 is "lost", and any "refund_*" is "refunded". "host" says
    whether this player may use /settle. Sent with "Cache-Control: private, no-store".

POST /api/predictions/stake    (Authorization: Bearer <token>)
    {"questionId": "groundhog-2027", "side": "yes" | "no", "amount": 20, "stakeId": "q7x2k9m4ab"}
    -> {"questionId", "side", "amount", "coins", "stakedToday", "leftToday", "sides", "totalCoins"}
    One stake per question, 1 to 50 coins ("amount" must be a whole number), at most 200 coins per
    Lisbon day. "stakeId" is made once per confirmed click (8 to 64 letters, digits, hyphens or
    underscores) and sent again if the request is repeated: the ledger reference is
    "stake:<stakeId>", so a repeat can never stake twice. Any extra field is refused (422).

POST /api/predictions/settle    (Authorization: Bearer <token> of a host)
    {"questionId": "groundhog-2027", "outcome": "yes" | "no" | "void"}
    -> {"questionId", "outcome", "settlement", "settledAt", "paidPlayers", "paidCoins", "cutCoins"}
    Yes or no work only after staking has closed, and if Manifold has decided, the host's choice
    must match Manifold's. Void works at any time and refunds everybody. A pool settles once. The
    question id is the repeat key: a repeat answers 409 already_applied, and a retry after a 503 is
    always safe. The ledger reference of the payouts is "pool:<questionId>", for a win and a refund.
    Errors (standard shape, see errors.py):
      401 unauthorized            no or bad sign-in
      403 forbidden               settling when you are not a host: "Only a host can do this."
      404 feature_off             the flag "predictions" is off
      404 no_such_question        not on the list, or not read by a person yet
      409 already_applied         this stakeId was used before, or the pool is settled already;
                                  nothing changed, treat as done. It is the first answer to a
                                  repeated stake, whatever else has changed since.
      409 pool_closed             staking has closed (our clock, or Manifold closed or decided it)
      409 already_staked          one stake per question
      409 daily_stake_cap         200 coins per Lisbon day (the day starts at 00:00 Lisbon time)
      409 insufficient_funds      not enough coins
      409 pool_open               settling yes or no before staking has closed
      409 outcome_conflict        the host's choice differs from what Manifold decided
      409 stakes_changed          the pool changed twice while it was being settled; try again
      422 validation_error        the request does not fit (a word where a number belongs, ...)
      422 stake_too_small         a stake must be at least 1 coin
      422 stake_too_big           at most 50 coins on one question
      429 too_many_requests       more than 10 stakes in 30 seconds; the Retry-After header says
                                  how many seconds to wait
      503 predictions_unavailable the questions file could not be read when the server started
      503 source_unavailable      Manifold cannot be checked now (a stake needs a real reading,
                                  and a stale one must not be older than 15 minutes)
      503 database_unavailable    the OUTCOME IS UNKNOWN; sending the same stakeId again is safe

Used by: the prediction kiosk screen (frontend/src/screens/predictions/).
"""

from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from server.adapters.base import SourceKind
from server.auth import PlayerDep
from server.errors import ApiError
from server.flags import is_enabled
from server.hosts import HostDep
from server.predictions.desk import DeskDep
from server.predictions.stake_rules import (
    DAILY_STAKE_CAP,
    DESK_TIMEZONE_NAME,
    MAX_STAKE,
    MIN_STAKE,
    POOL_CUT_PERCENT,
)
from server.predictions.state import ManifoldView
from server.predictions.views import (
    MineView,
    QuestionView,
    SettleOrder,
    SettleReceipt,
    SideView,
    StakeLine,
    StakeOrder,
    StakeReceipt,
)
from server.settings import SettingsDep
from server.supabase_admin import AdminDep

router = APIRouter()

# How long a browser or the Vercel network may reuse the list of questions.
LIST_CACHE_SECONDS = 10

# The lengths of a stakeId. With "stake:" in front it must fit into a wallet ref (120).
STAKE_ID_MIN_LENGTH = 8
STAKE_ID_MAX_LENGTH = 64

# The two lines the screen always shows. Credit Manifold in text, and never link to a betting site.
ATTRIBUTION = (
    "Questions and results: Manifold Markets (manifold.markets), a play-money forecasting site."
)
PLAY_MONEY = (
    "Forecasting with play coins. Play money: no cash value. It cannot be bought or cashed out."
)

Side = Literal["yes", "no"]
Outcome = Literal["yes", "no", "void"]
Settlement = Literal["winners", "refund_void", "refund_no_winners", "refund_one_sided"]
QuestionStatus = Literal["open", "closed", "settled"]


def whole_seconds(moment: datetime | None) -> datetime | None:
    """A time in UTC without microseconds, so the JSON reads 2026-11-20T10:02:11Z."""
    return None if moment is None else moment.astimezone(UTC).replace(microsecond=0)


class SideOut(BaseModel):
    """One side of one question."""

    side: Side
    label: str
    coins: int
    players: int
    payoutPerCoin: float | None  # camelCase on purpose: these are the exact JSON keys


class ManifoldOut(BaseModel):
    """What Manifold says about the market. Never its probability."""

    state: Literal["open", "closed", "decided", "unknown"]
    decidedAs: Outcome | None
    decidedAt: datetime | None


class QuestionOut(BaseModel):
    """One question on the list."""

    id: str
    text: str
    topic: str
    decidedBy: str
    closesAt: datetime
    status: QuestionStatus
    canStake: bool
    outcome: Outcome | None
    settlement: Settlement | None
    settledAt: datetime | None
    manifold: ManifoldOut
    sides: list[SideOut]
    totalCoins: int
    source: SourceKind | None
    fetchedAt: datetime | None


class RulesOut(BaseModel):
    """The numbers of the rules, so the screen never has to guess them."""

    minStake: int
    maxStake: int
    dailyCap: int
    cutPercent: int
    cutOf: str
    dayStarts: str


class PredictionsResponse(BaseModel):
    """What GET /api/predictions returns. It contains no secrets and no player data."""

    questions: list[QuestionOut]
    rules: RulesOut
    attribution: str
    playMoney: str


class MineStakeOut(BaseModel):
    """One of the signed-in player's stakes."""

    questionId: str
    text: str
    side: Side
    amount: int
    placedAt: datetime
    status: QuestionStatus
    result: Literal["won", "lost", "refunded"] | None
    payout: int | None
    settlement: Settlement | None
    outcome: Outcome | None
    settledAt: datetime | None


class MineResponse(BaseModel):
    """What GET /api/predictions/mine returns."""

    coins: int
    stakedToday: int
    leftToday: int
    dailyCap: int
    host: bool
    stakes: list[MineStakeOut]


class StakeRequest(BaseModel):
    """What the browser sends to POST /api/predictions/stake. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    # Question ids are lowercase letters, digits and hyphens (questions.json).
    questionId: str = Field(min_length=2, max_length=40, pattern=r"^[a-z0-9-]+$")
    side: Side
    # StrictInt: 20 is fine, but "20" and 20.5 are refused instead of quietly repaired. The range
    # is checked by the desk, which answers stake_too_small or stake_too_big.
    amount: StrictInt
    # Made by the browser once per confirmed click. With "stake:" in front it becomes the ref.
    stakeId: str = Field(
        min_length=STAKE_ID_MIN_LENGTH,
        max_length=STAKE_ID_MAX_LENGTH,
        pattern=r"^[A-Za-z0-9_-]+$",
    )


class StakeResponse(BaseModel):
    """What POST /api/predictions/stake returns after a finished stake."""

    questionId: str
    side: Side
    amount: int
    coins: int  # the wallet balance after the stake
    stakedToday: int
    leftToday: int
    sides: list[SideOut]
    totalCoins: int


class SettleRequest(BaseModel):
    """What a host sends to POST /api/predictions/settle. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    questionId: str = Field(min_length=2, max_length=40, pattern=r"^[a-z0-9-]+$")
    outcome: Outcome


class SettleResponse(BaseModel):
    """What POST /api/predictions/settle returns after a finished settlement."""

    questionId: str
    outcome: Outcome
    settlement: Settlement
    settledAt: datetime
    paidPlayers: int
    paidCoins: int
    cutCoins: int


def require_predictions_open(settings: SettingsDep) -> None:
    """Every route of the desk exists only while the flag "predictions" is on."""
    if not is_enabled("predictions", settings.flags):
        raise ApiError(404, "feature_off", "The prediction desk is closed for now.")


# A dependency that comes after the sign-in check and before the desk in a route's parameters, so
# the order of the answers is 401 or 403, then 404 feature_off, then 503 predictions_unavailable.
PredictionsOpenDep = Annotated[None, Depends(require_predictions_open)]


def side_out(side: SideView) -> SideOut:
    per_coin = side.payout_per_coin
    return SideOut(
        side=side.side,
        label=side.label,
        coins=side.coins,
        players=side.players,
        payoutPerCoin=None if per_coin is None else float(per_coin),
    )


def manifold_out(manifold: ManifoldView) -> ManifoldOut:
    return ManifoldOut(
        state=manifold.state,
        decidedAs=manifold.decided_as,
        decidedAt=whole_seconds(manifold.decided_at),
    )


def question_out(view: QuestionView) -> QuestionOut:
    question = view.question
    pool = view.pool
    state = view.state
    manifold = state.manifold
    return QuestionOut(
        id=question.id,
        text=question.text,
        topic=question.topic,
        decidedBy=question.decided_by,
        closesAt=whole_seconds(state.closes_at),
        status=state.status,
        canStake=state.can_stake,
        outcome=pool.outcome if pool else None,
        settlement=pool.settlement if pool else None,
        settledAt=whole_seconds(pool.settled_at) if pool else None,
        manifold=manifold_out(manifold),
        sides=[side_out(side) for side in view.sides],
        totalCoins=view.total_coins,
        source=manifold.source,
        fetchedAt=whole_seconds(manifold.fetched_at),
    )


def rules_out() -> RulesOut:
    return RulesOut(
        minStake=MIN_STAKE,
        maxStake=MAX_STAKE,
        dailyCap=DAILY_STAKE_CAP,
        cutPercent=POOL_CUT_PERCENT,
        cutOf="losing side",
        dayStarts=f"00:00 {DESK_TIMEZONE_NAME}",
    )


def mine_stake_out(line: StakeLine) -> MineStakeOut:
    stake = line.stake
    pool = line.pool
    return MineStakeOut(
        questionId=stake.question_id,
        text=line.question.text if line.question else stake.question_id,
        side=stake.side,
        amount=stake.amount,
        placedAt=whole_seconds(stake.created_at),
        status=line.status,
        result=line.result,
        payout=stake.payout,
        settlement=pool.settlement if pool else None,
        outcome=pool.outcome if pool else None,
        settledAt=whole_seconds(pool.settled_at) if pool else None,
    )


def mine_response(view: MineView, is_host: bool) -> MineResponse:
    return MineResponse(
        coins=view.coins,
        stakedToday=view.staked_today,
        leftToday=view.left_today,
        dailyCap=DAILY_STAKE_CAP,
        host=is_host,
        stakes=[mine_stake_out(line) for line in view.stakes],
    )


def stake_response(receipt: StakeReceipt) -> StakeResponse:
    return StakeResponse(
        questionId=receipt.question.id,
        side=receipt.side,
        amount=receipt.amount,
        coins=receipt.coins,
        stakedToday=receipt.staked_today,
        leftToday=receipt.left_today,
        sides=[side_out(side) for side in receipt.sides],
        totalCoins=receipt.total_coins,
    )


def settle_response(receipt: SettleReceipt) -> SettleResponse:
    return SettleResponse(
        questionId=receipt.question.id,
        outcome=receipt.outcome,
        settlement=receipt.settlement,
        settledAt=whole_seconds(receipt.settled_at),
        paidPlayers=receipt.paid_players,
        paidCoins=receipt.paid_coins,
        cutCoins=receipt.cut_coins,
    )


@router.get("/predictions")
async def get_predictions(
    request: Request,
    response: Response,
    open_: PredictionsOpenDep,
    desk: DeskDep,
    admin: AdminDep,
) -> PredictionsResponse:
    # The answer is cached by address. A made-up query string would skip the cache, so every
    # request would make the server look again.
    if request.query_params:
        raise ApiError(422, "validation_error", "This address takes no query parameters.")
    views = await desk.overview(admin)
    response.headers["Cache-Control"] = (
        f"public, max-age={LIST_CACHE_SECONDS}, s-maxage={LIST_CACHE_SECONDS}"
    )
    return PredictionsResponse(
        questions=[question_out(view) for view in views],
        rules=rules_out(),
        attribution=ATTRIBUTION,
        playMoney=PLAY_MONEY,
    )


@router.get("/predictions/mine")
async def get_mine(
    response: Response,
    player: PlayerDep,
    open_: PredictionsOpenDep,
    desk: DeskDep,
    admin: AdminDep,
    settings: SettingsDep,
) -> MineResponse:
    view = await desk.mine(admin, player.id)
    response.headers["Cache-Control"] = "private, no-store"
    return mine_response(view, is_host=player.id in settings.host_player_ids)


@router.post("/predictions/stake")
async def post_stake(
    request: StakeRequest,
    player: PlayerDep,
    open_: PredictionsOpenDep,
    desk: DeskDep,
    admin: AdminDep,
) -> StakeResponse:
    order = StakeOrder(request.questionId, request.side, request.amount, request.stakeId)
    receipt = await desk.stake(admin, player.id, order)
    return stake_response(receipt)


@router.post("/predictions/settle")
async def post_settle(
    request: SettleRequest,
    host: HostDep,
    open_: PredictionsOpenDep,
    desk: DeskDep,
    admin: AdminDep,
) -> SettleResponse:
    receipt = await desk.settle(admin, SettleOrder(request.questionId, request.outcome))
    return settle_response(receipt)
