"""Tests for duels/views.py: what one captain may see of one duel. Visibility is decided here.

The fixed numbers are the worked example of the spec (specs/A7-lantern-duels.md, section 2):
Alice ("Brave Puffin 17") challenges Bob ("Captain-3fa85f"), 5 rounds, 100 coins each. Alice
seals Flash, Shade, Shade, Mirror, Shade and Bob answers Mirror, Flash, Shade, Shade, Mirror.
Bob wins 3 to 1. Carol is a third captain who looks at the challenge from outside.
"""

import json
from datetime import UTC, datetime, timedelta, timezone

import pytest

from server.duels import rules
from server.duels.store import DuelRow
from server.duels.views import (
    ViewRefused,
    can_see,
    detail,
    held_coins,
    role_of,
    split_my_duels,
    summary,
)

ALICE = "11111111-1111-4111-8111-111111111111"
BOB = "22222222-2222-4222-8222-222222222222"
CAROL = "33333333-3333-4333-8333-333333333333"
DUEL_ID = "6f1c0c2e-9a52-4b8e-8d3a-0a7c3f1d2b44"

NAMES = {ALICE: "Brave Puffin 17", BOB: "Captain-3fa85f", CAROL: "Captain-7c41d2"}

CREATED = datetime(2026, 11, 6, 10, 0, tzinfo=UTC)
EXPIRES = datetime(2026, 11, 7, 10, 0, tzinfo=UTC)
ANSWERED = datetime(2026, 11, 6, 10, 4, 12, tzinfo=UTC)
NOW = datetime(2026, 11, 6, 10, 0, 5, tzinfo=UTC)

ALICE_SIGNALS = ("flash", "shade", "shade", "mirror", "shade")
BOB_SIGNALS = ("mirror", "flash", "shade", "shade", "mirror")
ALICE_OTHER_PLAN = ("shade", "shade", "shade", "shade", "shade")

SUMMARY_KEYS = [
    "id",
    "status",
    "isOpen",
    "you",
    "challengerName",
    "opponentName",
    "rounds",
    "oil",
    "stake",
    "cutPercent",
    "winnerTakes",
    "createdAt",
    "expiresAt",
    "closedAt",
    "score",
    "yourResult",
    "coinsChange",
    "heldStake",
    "canAnswer",
    "canWithdraw",
    "canDecline",
]


def make_duel(**changes) -> DuelRow:
    """A waiting named challenge from Alice to Bob. Pass keyword arguments to change it."""
    fields = {
        "id": DUEL_ID,
        "challenger_id": ALICE,
        "opponent_id": BOB,
        "is_open": False,
        "rounds": 5,
        "stake": 100,
        "cut_percent": 5,
        "status": "open",
        "outcome": None,
        "round_results": None,
        "created_at": CREATED,
        "expires_at": EXPIRES,
        "answered_at": None,
        "closed_at": None,
    }
    fields.update(changes)
    return DuelRow(**fields)


def finished_duel(**changes) -> DuelRow:
    """The worked example, decided: Bob won 3 to 1."""
    fields = {
        "status": "finished",
        "outcome": "opponent",
        "round_results": ("opponent", "opponent", "even", "opponent", "challenger"),
        "answered_at": ANSWERED,
        "closed_at": ANSWERED,
    }
    fields.update(changes)
    return make_duel(**fields)


def open_challenge(**changes) -> DuelRow:
    """A waiting challenge that any captain may answer."""
    return make_duel(is_open=True, opponent_id=None, **changes)


def without(view: dict, *keys: str) -> dict:
    """A view without some keys."""
    return {key: value for key, value in view.items() if key not in keys}


def signal_words_in(view: dict) -> list[str]:
    """The signal words that appear anywhere in the JSON of a view."""
    text = json.dumps(view, default=str)
    return [word for word in rules.SIGNALS if word in text]


# --- who is who, and who may look ---


def test_the_roles_are_challenger_opponent_and_visitor():
    duel = make_duel()

    assert role_of(duel, ALICE) == "challenger"
    assert role_of(duel, BOB) == "opponent"
    assert role_of(duel, CAROL) == "visitor"


def test_a_named_duel_is_hidden_from_other_captains():
    duel = make_duel()

    assert can_see(duel, ALICE) is True
    assert can_see(duel, BOB) is True
    assert can_see(duel, CAROL) is False
    with pytest.raises(ViewRefused):
        summary(duel, CAROL, NAMES, NOW)
    with pytest.raises(ViewRefused):
        detail(duel, CAROL, NAMES, NOW, None, None)


def test_an_open_challenge_is_visible_to_every_captain_while_it_is_open():
    duel = open_challenge()

    assert can_see(duel, ALICE) is True
    assert can_see(duel, CAROL) is True


def test_an_answered_open_challenge_is_hidden_from_visitors():
    duel = finished_duel(is_open=True)  # Bob answered an open challenge

    assert can_see(duel, ALICE) is True
    assert can_see(duel, BOB) is True
    assert can_see(duel, CAROL) is False


@pytest.mark.parametrize("status", ["withdrawn", "declined", "expired"])
def test_a_closed_open_challenge_is_hidden_from_visitors(status):
    duel = open_challenge(status=status, closed_at=ANSWERED)

    assert can_see(duel, ALICE) is True
    assert can_see(duel, CAROL) is False


# --- the summary of a duel ---


def test_a_summary_has_exactly_the_fields_of_the_contract():
    assert list(summary(make_duel(), BOB, NAMES, NOW)) == SUMMARY_KEYS


def test_the_summary_of_a_waiting_named_challenge_for_the_named_captain():
    view = summary(make_duel(), BOB, NAMES, NOW)

    assert view == {
        "id": DUEL_ID,
        "status": "open",
        "isOpen": False,
        "you": "opponent",
        "challengerName": "Brave Puffin 17",
        "opponentName": "Captain-3fa85f",
        "rounds": 5,
        "oil": 5,
        "stake": 100,
        "cutPercent": 5,
        "winnerTakes": 190,
        "createdAt": CREATED,
        "expiresAt": EXPIRES,
        "closedAt": None,
        "score": None,
        "yourResult": None,
        "coinsChange": None,
        "heldStake": 0,
        "canAnswer": True,
        "canWithdraw": False,
        "canDecline": True,
    }


def test_a_friendly_duel_has_a_winner_who_takes_nothing():
    view = summary(make_duel(stake=0), BOB, NAMES, NOW)

    assert view["winnerTakes"] == 0
    assert view["heldStake"] == 0


def test_a_visitor_sees_an_unanswered_open_challenge_with_no_opponent_name():
    view = summary(open_challenge(), CAROL, NAMES, NOW)

    assert view["you"] == "visitor"
    assert view["opponentName"] is None
    assert view["canAnswer"] is True
    assert (view["canWithdraw"], view["canDecline"]) == (False, False)
    assert view["coinsChange"] is None


def test_the_times_are_utc_with_whole_seconds():
    duel = finished_duel(
        created_at=CREATED + timedelta(microseconds=250000),
        closed_at=ANSWERED + timedelta(microseconds=999999),
    )

    view = summary(duel, ALICE, NAMES, NOW)

    assert view["createdAt"] == CREATED
    assert view["closedAt"] == ANSWERED


def test_a_time_with_another_offset_is_shown_in_utc():
    one_hour_ahead = timezone(timedelta(hours=1))

    view = summary(make_duel(created_at=CREATED.astimezone(one_hour_ahead)), ALICE, NAMES, NOW)

    assert view["createdAt"] == CREATED
    assert view["createdAt"].utcoffset() == timedelta(0)


def test_a_challenger_whose_name_is_missing_still_gets_a_name_line():
    view = summary(make_duel(), BOB, {BOB: "Captain-3fa85f"}, NOW)

    assert view["challengerName"]


def test_a_summary_never_carries_a_signal():
    for_alice = summary(make_duel(), ALICE, NAMES, NOW)
    for_bob = summary(finished_duel(), BOB, NAMES, NOW)

    assert signal_words_in(for_alice) == []
    assert signal_words_in(for_bob) == []


# --- the finished duel, seen from each side ---


def test_a_finished_duel_shows_both_sides_from_each_captain_point_of_view():
    duel = finished_duel()

    for_bob = detail(duel, BOB, NAMES, NOW, own_signals=BOB_SIGNALS, other_signals=ALICE_SIGNALS)
    for_alice = detail(
        duel, ALICE, NAMES, NOW, own_signals=ALICE_SIGNALS, other_signals=BOB_SIGNALS
    )

    assert for_bob["reveal"] == [
        {"round": 1, "yours": "mirror", "theirs": "flash", "point": "you"},
        {"round": 2, "yours": "flash", "theirs": "shade", "point": "you"},
        {"round": 3, "yours": "shade", "theirs": "shade", "point": "even"},
        {"round": 4, "yours": "shade", "theirs": "mirror", "point": "you"},
        {"round": 5, "yours": "mirror", "theirs": "shade", "point": "them"},
    ]
    assert for_alice["reveal"] == [
        {"round": 1, "yours": "flash", "theirs": "mirror", "point": "them"},
        {"round": 2, "yours": "shade", "theirs": "flash", "point": "them"},
        {"round": 3, "yours": "shade", "theirs": "shade", "point": "even"},
        {"round": 4, "yours": "mirror", "theirs": "shade", "point": "them"},
        {"round": 5, "yours": "shade", "theirs": "mirror", "point": "you"},
    ]
    assert (for_bob["score"], for_bob["yourResult"]) == ({"you": 3, "them": 1}, "won")
    assert (for_alice["score"], for_alice["yourResult"]) == ({"you": 1, "them": 3}, "lost")
    assert for_bob["yourSignals"] == list(BOB_SIGNALS)
    assert for_alice["yourSignals"] == list(ALICE_SIGNALS)


def test_a_draw_is_a_draw_for_both_captains():
    duel = finished_duel(outcome="draw", round_results=("challenger", "opponent", "even"), rounds=3)

    for_alice = summary(duel, ALICE, NAMES, NOW)
    for_bob = summary(duel, BOB, NAMES, NOW)

    assert (for_alice["yourResult"], for_bob["yourResult"]) == ("draw", "draw")
    assert (for_alice["score"], for_bob["score"]) == ({"you": 1, "them": 1}, {"you": 1, "them": 1})


CLOSED_WITHOUT_PLAY = {"closed_at": ANSWERED}


@pytest.mark.parametrize(
    ("duel", "viewer", "expected"),
    [
        # Bob won 3 to 1 and takes 190 of the pot of 200, minus his own stake of 100.
        (finished_duel(), BOB, 90),
        (finished_duel(), ALICE, -100),
        (finished_duel(outcome="challenger", round_results=("challenger",) * 5), ALICE, 90),
        (finished_duel(outcome="draw", round_results=("even",) * 5), ALICE, 0),
        (finished_duel(outcome="draw", round_results=("even",) * 5), BOB, 0),
        (finished_duel(stake=0), BOB, 0),
        (finished_duel(stake=0), ALICE, 0),
        # A duel that was closed without play: the challenger's stake came back, nobody lost.
        (make_duel(status="withdrawn", **CLOSED_WITHOUT_PLAY), ALICE, 0),
        (make_duel(status="withdrawn", **CLOSED_WITHOUT_PLAY), BOB, 0),
        (make_duel(status="declined", **CLOSED_WITHOUT_PLAY), ALICE, 0),
        (make_duel(status="declined", **CLOSED_WITHOUT_PLAY), BOB, 0),
        (make_duel(status="expired", **CLOSED_WITHOUT_PLAY), ALICE, 0),
        (make_duel(status="expired", **CLOSED_WITHOUT_PLAY), BOB, 0),
    ],
)
def test_coins_change_for_winner_loser_draw_and_closed_duels(duel, viewer, expected):
    view = summary(duel, viewer, NAMES, NOW)

    assert view["coinsChange"] == expected


@pytest.mark.parametrize("status", ["withdrawn", "declined", "expired"])
def test_a_duel_closed_without_play_has_no_score_and_no_result(status):
    view = summary(make_duel(status=status, **CLOSED_WITHOUT_PLAY), ALICE, NAMES, NOW)

    assert view["score"] is None
    assert view["yourResult"] is None


def test_coins_change_is_not_known_while_the_duel_is_open():
    assert summary(make_duel(), ALICE, NAMES, NOW)["coinsChange"] is None
    assert summary(make_duel(), BOB, NAMES, NOW)["coinsChange"] is None


@pytest.mark.parametrize("stake", rules.STAKE_CHOICES)
def test_coins_change_agrees_with_the_rules_for_every_stake(stake):
    duel = finished_duel(stake=stake)

    expected = rules.coins_change(stake, 5, "opponent", "opponent")

    assert summary(duel, BOB, NAMES, NOW)["coinsChange"] == expected


# --- held stake ---


@pytest.mark.parametrize(
    ("duel_changes", "viewer", "expected"),
    [
        ({}, ALICE, 100),  # the challenger of a waiting staked duel
        ({}, BOB, 0),
        ({"stake": 0}, ALICE, 0),
        ({"status": "withdrawn", "closed_at": ANSWERED}, ALICE, 0),
        ({"status": "expired", "closed_at": ANSWERED}, ALICE, 0),
        ({"is_open": True, "opponent_id": None}, CAROL, 0),
        ({"is_open": True, "opponent_id": None}, ALICE, 100),
    ],
)
def test_held_stake_shows_only_for_the_challenger_of_a_waiting_staked_duel(
    duel_changes, viewer, expected
):
    assert summary(make_duel(**duel_changes), viewer, NAMES, NOW)["heldStake"] == expected


def test_a_finished_duel_holds_no_stake_any_more():
    assert summary(finished_duel(), ALICE, NAMES, NOW)["heldStake"] == 0


# --- the buttons ---

ONE_SECOND = timedelta(seconds=1)


@pytest.mark.parametrize(
    ("duel", "viewer", "now", "can_answer", "can_withdraw", "can_decline"),
    [
        # A named challenge: the named captain may answer or decline, the challenger may withdraw.
        (make_duel(), BOB, NOW, True, False, True),
        (make_duel(), ALICE, NOW, False, True, False),
        # An open challenge: any other captain may answer. Nobody can decline an open challenge.
        (open_challenge(), CAROL, NOW, True, False, False),
        (open_challenge(), BOB, NOW, True, False, False),
        (open_challenge(), ALICE, NOW, False, True, False),
        # Once the window has passed nobody can answer or decline. The challenger can still
        # withdraw, which gives the stake back.
        (make_duel(), BOB, EXPIRES - ONE_SECOND, True, False, True),
        (make_duel(), BOB, EXPIRES, False, False, False),
        (make_duel(), ALICE, EXPIRES, False, True, False),
        (open_challenge(), CAROL, EXPIRES + ONE_SECOND, False, False, False),
        # A closed duel has no buttons at all.
        (finished_duel(), BOB, NOW, False, False, False),
        (finished_duel(), ALICE, NOW, False, False, False),
        (make_duel(status="withdrawn", closed_at=ANSWERED), BOB, NOW, False, False, False),
        (make_duel(status="declined", closed_at=ANSWERED), ALICE, NOW, False, False, False),
        (make_duel(status="expired", closed_at=ANSWERED), ALICE, NOW, False, False, False),
    ],
)
def test_the_buttons_follow_the_role_and_the_status(
    duel, viewer, now, can_answer, can_withdraw, can_decline
):
    view = summary(duel, viewer, NAMES, now)

    assert (view["canAnswer"], view["canWithdraw"], view["canDecline"]) == (
        can_answer,
        can_withdraw,
        can_decline,
    )


# --- the detail of a duel: your signals and the reveal ---


def test_a_detail_is_a_summary_plus_your_signals_and_the_reveal():
    view = detail(make_duel(), ALICE, NAMES, NOW, own_signals=ALICE_SIGNALS, other_signals=None)

    assert list(view) == [*SUMMARY_KEYS, "yourSignals", "reveal"]


def test_the_challenger_sees_their_own_signals_in_a_waiting_duel():
    view = detail(make_duel(), ALICE, NAMES, NOW, own_signals=ALICE_SIGNALS, other_signals=None)

    assert view["yourSignals"] == list(ALICE_SIGNALS)
    assert view["reveal"] is None
    assert view["heldStake"] == 100
    assert view["canWithdraw"] is True


def test_the_named_captain_sees_that_the_challenger_sealed_but_not_what():
    view = detail(make_duel(), BOB, NAMES, NOW, own_signals=None, other_signals=None)

    assert view["status"] == "open"  # an open challenge always has a sealed envelope
    assert view["you"] == "opponent"
    assert view["yourSignals"] is None
    assert view["reveal"] is None
    assert view["score"] is None
    assert signal_words_in(view) == []


def test_the_view_of_an_unanswered_duel_is_the_same_whatever_the_challenger_sealed():
    duel = make_duel()

    sealed_one_way = detail(duel, ALICE, NAMES, NOW, ALICE_SIGNALS, None)
    sealed_another_way = detail(duel, ALICE, NAMES, NOW, ALICE_OTHER_PLAN, None)

    # Nothing else is derived from the envelope: no oil spent, no count, no sealed-at time.
    assert without(sealed_one_way, "yourSignals") == without(sealed_another_way, "yourSignals")
    assert sealed_one_way["yourSignals"] != sealed_another_way["yourSignals"]


@pytest.mark.parametrize("status", ["open", "withdrawn", "declined", "expired"])
@pytest.mark.parametrize("viewer", [ALICE, BOB])
def test_the_view_refuses_the_other_envelope_while_the_duel_is_open(status, viewer):
    closed_at = None if status == "open" else ANSWERED
    duel = make_duel(status=status, closed_at=closed_at)

    with pytest.raises(ViewRefused):
        detail(duel, viewer, NAMES, NOW, own_signals=BOB_SIGNALS, other_signals=ALICE_SIGNALS)


def test_a_visitor_has_no_signals_to_show_and_none_may_be_shown_to_them():
    duel = open_challenge()

    with pytest.raises(ViewRefused):
        detail(duel, CAROL, NAMES, NOW, own_signals=ALICE_SIGNALS, other_signals=None)
    with pytest.raises(ViewRefused):
        detail(duel, CAROL, NAMES, NOW, own_signals=None, other_signals=ALICE_SIGNALS)


def test_a_withdrawn_duel_shows_the_challenger_signals_to_nobody_else():
    duel = make_duel(status="withdrawn", closed_at=ANSWERED)

    for_bob = detail(duel, BOB, NAMES, NOW, own_signals=None, other_signals=None)
    for_alice = detail(duel, ALICE, NAMES, NOW, own_signals=ALICE_SIGNALS, other_signals=None)

    assert signal_words_in(for_bob) == []
    assert for_alice["yourSignals"] == list(ALICE_SIGNALS)
    assert for_alice["reveal"] is None


def test_the_reveal_has_one_entry_per_round_numbered_from_one():
    view = detail(
        finished_duel(), BOB, NAMES, NOW, own_signals=BOB_SIGNALS, other_signals=ALICE_SIGNALS
    )

    assert [entry["round"] for entry in view["reveal"]] == [1, 2, 3, 4, 5]


def test_a_captain_who_left_shows_no_name_and_no_signals():
    # Bob answered an open challenge and his profile was deleted later: opponent_id is null.
    duel = finished_duel(is_open=True, opponent_id=None)

    view = detail(duel, ALICE, NAMES, NOW, own_signals=ALICE_SIGNALS, other_signals=None)

    assert view["opponentName"] is None
    assert [entry["theirs"] for entry in view["reveal"]] == [None] * 5
    assert [entry["yours"] for entry in view["reveal"]] == list(ALICE_SIGNALS)
    assert view["score"] == {"you": 1, "them": 3}


# --- the lists: incoming, yours and recent ---


def test_incoming_are_named_challenges_to_me_that_are_open_and_not_expired():
    waiting_for_me = make_duel(id="a")
    mine = make_duel(id="b", challenger_id=BOB, opponent_id=ALICE)  # Bob challenged Alice
    expired = make_duel(id="c", expires_at=NOW)
    finished = finished_duel(id="d")
    open_one = open_challenge(id="e")

    lists = split_my_duels([waiting_for_me, mine, expired, finished, open_one], BOB, NOW)

    assert [duel.id for duel in lists.incoming] == ["a"]


def test_yours_are_my_challenges_that_are_still_waiting():
    waiting = make_duel(id="a")
    open_one = open_challenge(id="b")
    closed = make_duel(id="c", status="withdrawn", closed_at=ANSWERED)
    incoming = make_duel(id="d", challenger_id=BOB, opponent_id=ALICE)

    lists = split_my_duels([waiting, open_one, closed, incoming], ALICE, NOW)

    assert [duel.id for duel in lists.yours] == ["a", "b"]


def test_recent_are_my_duels_that_ended_newest_first():
    older = finished_duel(id="a", closed_at=ANSWERED)
    newer = make_duel(id="b", status="expired", closed_at=ANSWERED + timedelta(hours=2))
    waiting = make_duel(id="c")

    lists = split_my_duels([older, newer, waiting], ALICE, NOW)

    assert [duel.id for duel in lists.recent] == ["b", "a"]


def test_the_lists_keep_to_their_limits():
    many = [make_duel(id=f"w{number}") for number in range(12)]
    ended = [finished_duel(id=f"f{number}") for number in range(15)]

    for_bob = split_my_duels(many + ended, BOB, NOW)
    for_alice = split_my_duels(many + ended, ALICE, NOW)

    assert len(for_bob.incoming) == rules.OPEN_CHALLENGES_LIMIT
    assert len(for_alice.yours) == rules.MAX_WAITING
    assert len(for_alice.recent) == rules.RECENT_LIMIT


def test_held_coins_are_the_stakes_of_my_waiting_challenges():
    duels = [
        make_duel(id="a", stake=100),
        open_challenge(id="b", stake=25),
        make_duel(id="c", stake=50, status="withdrawn", closed_at=ANSWERED),
        make_duel(id="d", stake=10, challenger_id=BOB, opponent_id=ALICE),
        make_duel(id="e", stake=0),
    ]

    assert held_coins(duels, ALICE) == 125  # a (100) and b (25); c is closed, e is friendly
    assert held_coins(duels, BOB) == 10  # only d is his own challenge
