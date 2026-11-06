"""Lantern Duels routes: sealed-signal duels between two captains (package A7).

Two captains each seal a sequence of lantern signals: Flash, Shade or Mirror. Flash outshines
Shade, Shade leaves Mirror nothing to throw back, and Mirror throws Flash back. The server opens
both envelopes at once and decides every round (D003). A duel is friendly or played for equal
play-coin stakes: play money only, coins cannot be bought, cashed out or exchanged for real
prizes. The rules are in backend/server/duels/ (rules.py), what a captain may see is decided in
views.py, and the database part is supabase/migrations/20261106110000_lantern_duels.sql. The
routes only check who is asking and whether the flag "arena" is on.

    GET  /api/duels                list: my duels, the open challenges of others, my coins
    POST /api/duels                send a challenge: seal my signals and hold my stake
    GET  /api/duels/{id}           one duel in full
    POST /api/duels/{id}/move      answer a challenge: seal my signals, and the duel is decided
    POST /api/duels/{id}/cancel    withdraw my challenge, or decline one made to me

Every route first resolves the signed-in player (401 unauthorized), then checks the flag (404
feature_off while "arena" is off, with no database call), and only then checks the body (422
validation_error). The player id comes ONLY from the sign-in, never from the body. Request bodies
refuse extra fields. Every good answer carries `Cache-Control: private, no-store` and
"serverTime", so the screen can count down without trusting the device clock. Times are UTC with
whole seconds, like "2026-11-06T10:00:00Z".

GET /api/duels
    -> {"rules": {"signals": [{"id": "flash", "cost": 2, "beats": "shade"}, ...],
                  "roundChoices": [3, 5], "oilPerRound": 1, "stakeChoices": [0, 10, 25, 50, 100],
                  "cutPercent": 5, "answerHours": 24, "maxWaiting": 3, "pairDailyLimit": 3,
                  "dayStarts": "00:00 Europe/Lisbon"},
        "coins": 900, "heldCoins": 100,
        "incoming": [<summary>], "openChallenges": [<summary>], "yours": [<summary>],
        "recent": [<summary>], "serverTime": "2026-11-06T10:00:05Z"}
    incoming        named challenges to me, still open and not expired (at most 10)
    openChallenges  open challenges of other captains, still open and not expired (at most 10)
    yours           my challenges that are still waiting (at most 3)
    recent          my duels that ended, newest first (at most 10)
    heldCoins       my coins held in waiting challenges
    A summary never carries a signal: {"id", "status", "isOpen", "you", "challengerName",
    "opponentName", "rounds", "oil", "stake", "cutPercent", "winnerTakes", "createdAt",
    "expiresAt", "closedAt", "score", "yourResult", "coinsChange", "heldStake", "canAnswer",
    "canWithdraw", "canDecline"}.
      status        open, finished, withdrawn, declined or expired
      you           challenger, opponent or visitor (someone looking at an open challenge)
      opponentName  null for an unanswered open challenge, or for a captain who has left
      score         finished only: {"you": 3, "them": 1}
      yourResult    finished only: won, lost or draw
      coinsChange   my net coins once it ended (+90, -100, 0); null while open
      heldStake     my coins held in it right now (the challenger of a waiting staked duel)
    Expired challenges of mine are closed and refunded while this list is read (at most 5).
    Errors: 401 unauthorized, 404 feature_off, 502 database_error, 503 database_not_configured
    or database_unavailable.

GET /api/duels/{id}      (the id must be a UUID: 422 validation_error)
    -> {"duel": <summary fields> + "yourSignals" and "reveal", "serverTime": "..."}
    yourSignals  my own sealed signals; null for a visitor
    reveal       null unless the duel is finished. One entry per round from my side:
                 {"round": 1, "yours": "mirror", "theirs": "flash", "point": "you"}, where point
                 is you, them or even. "theirs" is null for a captain who has left.
    Who may look: the two captains, and anyone while an open challenge is still open. An expired
    challenge is closed and refunded first. Errors: 404 no_such_duel (unknown, a named duel you
    are not in, or an answered open challenge you are not in).

POST /api/duels
    {"opponentName": "Captain-3fa85f" or null or left out (an open challenge), "rounds": 3 or 5,
     "stake": 0, 10, 25, 50 or 100, "signals": ["flash", "shade", ...], "actionUid": "q7x2k9m4ab"}
    -> {"duel": <detail: status open>, "coins": 900, "serverTime": "..."}
    "opponentName" is only a lookup key (2 to 24 characters from A-Z, a-z, 0-9, space, _ . -,
    any letter case): it is never stored or shown. "signals" has one signal per round and burns
    at most as much lantern oil as the duel has rounds (Flash 2, Mirror 1, Shade 0).
    "actionUid" is made once per click (8 to 64 letters, digits, hyphens or underscores) and sent
    again unchanged on a retry: a repeat answers 409 already_applied and creates nothing.
    Errors: 404 no_such_captain, 409 already_applied, 409 name_not_unique, 409 too_many_waiting
    (3 challenges waiting), 409 insufficient_funds (nothing was created), 422 validation_error,
    422 bad_rounds, 422 bad_stake, 422 wrong_signal_count, 422 not_enough_oil, 422
    cannot_duel_yourself, 503 database_unavailable (the OUTCOME IS UNKNOWN: read the list
    before you try again).

POST /api/duels/{id}/move
    {"signals": ["mirror", "flash", ...], "actionUid": "z81kq0p3dd"}
    -> {"duel": <detail: status finished, with yourSignals and reveal>, "coins": 1090, "serverTime"}
    Answering IS accepting: in one step the server takes my stake, opens both envelopes, decides
    every round and pays out. The browser sends only signals, never a result or an amount.
    Errors: 404 no_such_duel (unknown, or a named duel for somebody else), 409 already_applied
    (this actionUid answered already), 409 already_sealed (I sealed in this duel before, which
    includes being its challenger), 409 duel_taken (another captain answered an open challenge
    first), 409 duel_closed (withdrawn, declined or decided), 409 duel_expired (the 24 hours
    passed; the challenger's stake went back), 409 daily_pair_limit (3 staked duels with this
    captain per Lisbon day), 409 insufficient_funds, 422 validation_error, 422
    wrong_signal_count, 422 not_enough_oil, 503 database_unavailable (outcome unknown).

POST /api/duels/{id}/cancel      (no body)
    -> {"duel": <detail: status withdrawn, declined or expired>, "coins": 1000, "serverTime"}
    The challenger withdraws, the named captain declines. Either way the challenger's stake comes
    back. Once the window has passed the duel is closed as expired, with the same refund. "coins"
    is my balance if I am the challenger, otherwise null.
    Errors: 404 no_such_duel, 403 not_your_duel (an open challenge of another captain), 409
    already_applied (I closed it this way already, or it ran out of time and was closed and
    refunded already), 409 duel_closed (it ended some other way).

Sealed means sealed. No answer carries the other captain's signals before the duel is finished:
not the list, not the detail, not an error. A withdrawn, declined or expired duel never shows
the challenger's signals to anyone but the challenger. The signals travel only in request
bodies, never in an address, and are never logged.

Used by: the game client (the arena panel at the arena gate in Smugglers' Cove).
"""

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from server.auth import Player, PlayerDep
from server.duels import rules
from server.duels.service import AnswerOrder, ChallengeOrder, DuelListing, DuelReceipt, DuelsDep
from server.duels.views import whole_seconds
from server.errors import ApiError
from server.flags import is_enabled
from server.settings import SettingsDep
from server.supabase_admin import AdminDep

router = APIRouter()

# The length limits of an actionUid and of a captain's name (the display-name rule, profiles).
ACTION_UID_MIN_LENGTH = 8
ACTION_UID_MAX_LENGTH = 64
ACTION_UID_PATTERN = r"^[A-Za-z0-9_-]+$"
NAME_MIN_LENGTH = 2
NAME_MAX_LENGTH = 24
NAME_PATTERN = r"^[A-Za-z0-9 _.-]+$"

# A sequence has one signal per round, so 3 to 5 signals. rules.py checks the exact number.
MIN_SIGNALS = min(rules.ROUND_CHOICES)
MAX_SIGNALS = max(rules.ROUND_CHOICES)

# The same words as rules.SIGNALS. A test checks that the two lists agree.
SignalName = Literal["flash", "shade", "mirror"]

NO_STORE = "private, no-store"


async def require_arena(player: PlayerDep, settings: SettingsDep, response: Response) -> Player:
    """Every duel route: the signed-in player (401), then the flag (404 feature_off).

    It runs before FastAPI checks the body of the request, so a closed ring never reaches the
    database or a validation message. A good answer holds personal data, so it carries
    `Cache-Control: private, no-store`. An error answer holds none (only a code and a sentence)
    and carries no cache header, like the errors of GET /api/me.
    """
    if not is_enabled("arena", settings.flags):
        raise ApiError(404, "feature_off", "The Lantern Duels ring is not open yet.")
    response.headers["Cache-Control"] = NO_STORE
    return player


# Write `player: ArenaPlayerDep` in a route and FastAPI checks the login and the flag for you.
ArenaPlayerDep = Annotated[Player, Depends(require_arena)]


class ChallengeRequest(BaseModel):
    """What the browser sends to POST /api/duels. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    # A lookup key for a named challenge; left out or null makes an open challenge.
    opponentName: str | None = Field(
        default=None,
        min_length=NAME_MIN_LENGTH,
        max_length=NAME_MAX_LENGTH,
        pattern=NAME_PATTERN,
    )
    # StrictInt: 5 is fine, but "5" and 5.5 are refused. rules.py checks the allowed values.
    rounds: StrictInt
    stake: StrictInt
    signals: list[SignalName] = Field(min_length=MIN_SIGNALS, max_length=MAX_SIGNALS)
    # Made by the browser once per click. It is the duel's create_uid, never part of a ledger ref.
    actionUid: str = Field(
        min_length=ACTION_UID_MIN_LENGTH,
        max_length=ACTION_UID_MAX_LENGTH,
        pattern=ACTION_UID_PATTERN,
    )


class AnswerRequest(BaseModel):
    """What the browser sends to POST /api/duels/{id}/move. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    signals: list[SignalName] = Field(min_length=MIN_SIGNALS, max_length=MAX_SIGNALS)
    actionUid: str = Field(
        min_length=ACTION_UID_MIN_LENGTH,
        max_length=ACTION_UID_MAX_LENGTH,
        pattern=ACTION_UID_PATTERN,
    )


class ScoreOut(BaseModel):
    """Rounds taken: mine against theirs."""

    you: int
    them: int


class SummaryOut(BaseModel):
    """One duel in a list, from the point of view of the caller. It never carries a signal."""

    id: str
    status: Literal["open", "finished", "withdrawn", "declined", "expired"]
    isOpen: bool  # camelCase on purpose: these are the exact JSON keys the browser reads
    you: Literal["challenger", "opponent", "visitor"]
    challengerName: str
    opponentName: str | None
    rounds: int
    oil: int
    stake: int
    cutPercent: int
    winnerTakes: int
    createdAt: datetime
    expiresAt: datetime
    closedAt: datetime | None
    score: ScoreOut | None
    yourResult: Literal["won", "lost", "draw"] | None
    coinsChange: int | None
    heldStake: int
    canAnswer: bool
    canWithdraw: bool
    canDecline: bool


class RevealOut(BaseModel):
    """One opened round, from the point of view of the caller."""

    round: int
    yours: str | None
    theirs: str | None  # null for a captain who has left
    point: Literal["you", "them", "even"]


class DetailOut(SummaryOut):
    """One duel in full."""

    yourSignals: list[str] | None
    reveal: list[RevealOut] | None


class SignalRuleOut(BaseModel):
    id: str
    cost: int
    beats: str


class RulesOut(BaseModel):
    """The numbers of the rules, so the screen never has to guess them."""

    signals: list[SignalRuleOut]
    roundChoices: list[int]
    oilPerRound: int
    stakeChoices: list[int]
    cutPercent: int
    answerHours: int
    maxWaiting: int
    pairDailyLimit: int
    dayStarts: str


class DuelListResponse(BaseModel):
    """What GET /api/duels returns."""

    rules: RulesOut
    coins: int
    heldCoins: int
    incoming: list[SummaryOut]
    openChallenges: list[SummaryOut]
    yours: list[SummaryOut]
    recent: list[SummaryOut]
    serverTime: datetime


class DuelResponse(BaseModel):
    """What GET /api/duels/{id} returns."""

    duel: DetailOut
    serverTime: datetime


class DuelActionResponse(DuelResponse):
    """What the three POST routes return: the duel and the caller's coins."""

    coins: int | None


def rules_out() -> RulesOut:
    """The rules of the server as the screen reads them."""
    signals = [
        SignalRuleOut(id=signal, cost=rules.OIL_COST[signal], beats=rules.BEATS[signal])
        for signal in rules.SIGNALS
    ]
    return RulesOut(
        signals=signals,
        roundChoices=list(rules.ROUND_CHOICES),
        oilPerRound=rules.OIL_PER_ROUND,
        stakeChoices=list(rules.STAKE_CHOICES),
        cutPercent=rules.CUT_PERCENT,
        answerHours=rules.ANSWER_HOURS,
        maxWaiting=rules.MAX_WAITING,
        pairDailyLimit=rules.PAIR_DAILY_LIMIT,
        dayStarts=f"00:00 {rules.DUEL_DAY_TIMEZONE_NAME}",
    )


def server_time(moment: datetime) -> datetime:
    whole = whole_seconds(moment)
    assert whole is not None
    return whole


def action_response(receipt: DuelReceipt) -> DuelActionResponse:
    detail: Any = receipt.detail
    return DuelActionResponse(
        duel=DetailOut(**detail), coins=receipt.coins, serverTime=server_time(receipt.now)
    )


def list_response(listing: DuelListing) -> DuelListResponse:
    return DuelListResponse(
        rules=rules_out(),
        coins=listing.coins,
        heldCoins=listing.held_coins,
        incoming=[SummaryOut(**duel) for duel in listing.incoming],
        openChallenges=[SummaryOut(**duel) for duel in listing.open_challenges],
        yours=[SummaryOut(**duel) for duel in listing.yours],
        recent=[SummaryOut(**duel) for duel in listing.recent],
        serverTime=server_time(listing.now),
    )


@router.get("/duels")
async def list_duels(player: ArenaPlayerDep, duels: DuelsDep, admin: AdminDep) -> DuelListResponse:
    return list_response(await duels.list(admin, player.id))


@router.post("/duels")
async def create_duel(
    request: ChallengeRequest, player: ArenaPlayerDep, duels: DuelsDep, admin: AdminDep
) -> DuelActionResponse:
    order = ChallengeOrder(
        opponent_name=request.opponentName,
        rounds=request.rounds,
        stake=request.stake,
        signals=tuple(request.signals),
        action_uid=request.actionUid,
    )
    return action_response(await duels.create(admin, player.id, order))


@router.get("/duels/{duel_id}")
async def read_duel(
    duel_id: UUID, player: ArenaPlayerDep, duels: DuelsDep, admin: AdminDep
) -> DuelResponse:
    receipt = await duels.get(admin, player.id, str(duel_id))
    return DuelResponse(duel=DetailOut(**receipt.detail), serverTime=server_time(receipt.now))


@router.post("/duels/{duel_id}/move")
async def answer_duel(
    duel_id: UUID,
    request: AnswerRequest,
    player: ArenaPlayerDep,
    duels: DuelsDep,
    admin: AdminDep,
) -> DuelActionResponse:
    order = AnswerOrder(signals=tuple(request.signals), action_uid=request.actionUid)
    return action_response(await duels.answer(admin, player.id, str(duel_id), order))


@router.post("/duels/{duel_id}/cancel")
async def cancel_duel(
    duel_id: UUID, player: ArenaPlayerDep, duels: DuelsDep, admin: AdminDep
) -> DuelActionResponse:
    return action_response(await duels.cancel(admin, player.id, str(duel_id)))
