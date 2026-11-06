"""Festival boundary, exclusive claim and pairing tests; no storage or external services."""

import json
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from server.festival.claims import LampClaim, claim_lamp, visible_claims
from server.festival.ring import join_ring
from server.festival.timer import festival_timer

CONTENT = json.loads((Path(__file__).parents[2] / "content/festival.json").read_text())
DURATION = CONTENT["durationSeconds"]
LAMPS = tuple(CONTENT["lampIds"])
START = datetime(2026, 11, 6, 12, tzinfo=UTC)
ACTIVE = festival_timer(START, START, DURATION)


def test_content_follows_the_approved_two_day_festival_and_twelve_spots():
    assert DURATION == 48 * 60 * 60
    assert CONTENT["phases"] == ["waiting", "active", "ended"]
    assert len(LAMPS) == len(set(LAMPS)) == 12
    assert CONTENT["ringName"] == "Keepers' Ring"


def test_no_first_solve_means_no_festival_even_far_in_the_future():
    timer = festival_timer(None, START + timedelta(days=365), DURATION)
    assert timer.phase == "waiting"
    assert timer.starts_at is timer.ends_at is None
    assert timer.remaining_seconds == 0


@pytest.mark.parametrize(
    ("offset", "phase", "remaining"),
    [
        (-1, "waiting", 0),
        (0, "active", DURATION),
        (1, "active", DURATION - 1),
        (DURATION - 0.5, "active", 0.5),
        (DURATION, "ended", 0),
        (DURATION + 1, "ended", 0),
    ],
)
def test_timer_boundaries(offset, phase, remaining):
    timer = festival_timer(START, START + timedelta(seconds=offset), DURATION)
    assert timer.phase == phase
    assert timer.remaining_seconds == remaining
    assert timer.starts_at == START
    assert timer.ends_at == START + timedelta(seconds=DURATION)


def test_duration_comes_from_content_argument_and_does_not_slide_with_reads():
    early = festival_timer(START, START + timedelta(hours=1), DURATION)
    late = festival_timer(START, START + timedelta(hours=47), DURATION)
    assert early.ends_at == late.ends_at
    assert festival_timer(START, START + timedelta(seconds=60), 60).phase == "ended"


def test_offsets_describe_the_same_instant_without_shifting_expiry():
    offset_start = START.astimezone(timezone(timedelta(hours=2)))
    assert festival_timer(offset_start, START, DURATION).remaining_seconds == DURATION


@pytest.mark.parametrize("month,day", [(3, 28), (10, 24)])
def test_daylight_saving_changes_never_change_the_forty_eight_real_hours(month, day):
    local_start = datetime(2026, month, day, 12, tzinfo=ZoneInfo("Europe/Berlin"))
    actual_end = local_start.astimezone(UTC) + timedelta(seconds=DURATION)
    timer = festival_timer(local_start, actual_end, DURATION)
    assert timer.phase == "ended"
    assert timer.ends_at == actual_end
    last_second = festival_timer(local_start, actual_end - timedelta(seconds=1), DURATION)
    assert last_second.phase == "active" and last_second.remaining_seconds == 1


@pytest.mark.parametrize("duration", [0, -1, 1.5, True, "172800"])
def test_invalid_duration_is_refused(duration):
    with pytest.raises(ValueError, match="duration"):
        festival_timer(START, START, duration)


@pytest.mark.parametrize("naive_start", [True, False])
def test_naive_dates_are_refused(naive_start):
    with pytest.raises(ValueError, match="timezone"):
        festival_timer(
            START.replace(tzinfo=None) if naive_start else START,
            START if naive_start else START.replace(tzinfo=None),
            DURATION,
        )


@pytest.mark.parametrize("lamp", LAMPS)
def test_every_lamp_can_be_claimed_once_by_its_owner(lamp):
    original = ()
    first = claim_lamp("player-a", lamp, LAMPS, original, ACTIVE)
    assert first.status == "claimed"
    assert first.claims == (LampClaim(lamp, "player-a"),)
    again = claim_lamp("player-a", lamp, LAMPS, first.claims, ACTIVE)
    assert again.status == "repeated"
    assert again.claims == first.claims
    assert original == ()


def test_another_player_cannot_take_an_occupied_lamp():
    claims = (LampClaim(LAMPS[0], "player-a"),)
    result = claim_lamp("player-b", LAMPS[0], LAMPS, claims, ACTIVE)
    assert result.status == "occupied"
    assert result.claims == claims


def test_limit_is_per_lamp_not_one_lamp_total_per_player():
    claims = (LampClaim(LAMPS[0], "player-a"),)
    result = claim_lamp("player-a", LAMPS[1], LAMPS, claims, ACTIVE)
    assert result.status == "claimed"
    assert len(result.claims) == 2
    assert len(claims) == 1


def test_unknown_lamp_does_not_change_claims():
    assert claim_lamp("player-a", "missing", LAMPS, (), ACTIVE).status == "unknown_lamp"


@pytest.mark.parametrize(
    "first,now",
    [
        (None, START),
        (START, START - timedelta(seconds=1)),
        (START, START + timedelta(seconds=DURATION)),
    ],
)
def test_closed_festival_hides_claims_and_refuses_new_ones(first, now):
    timer = festival_timer(first, now, DURATION)
    claims = (LampClaim(LAMPS[0], "player-a"),)
    result = claim_lamp("player-b", LAMPS[1], LAMPS, claims, timer)
    assert result.status == "closed"
    assert result.claims == claims
    assert visible_claims(claims, timer) == ()
    assert visible_claims(claims, ACTIVE) == claims


def test_repeating_a_claim_does_not_extend_the_festival():
    claims = (LampClaim(LAMPS[0], "player-a"),)
    timer = festival_timer(START, START + timedelta(seconds=DURATION), DURATION)
    assert claim_lamp("player-a", LAMPS[0], LAMPS, claims, timer).status == "closed"


def test_join_then_fifo_pair_returns_a_proposal_without_creating_a_duel():
    first = join_ring("player-a", (), frozenset(), ACTIVE, arena_enabled=True)
    assert first.status == "queued" and first.pair is None
    second = join_ring("player-b", first.queue, frozenset(), ACTIVE, arena_enabled=True)
    assert second.status == "paired"
    assert second.pair == ("player-a", "player-b") and second.queue == ()
    assert first.queue == ("player-a",)


def test_repeated_queue_join_preserves_position_and_never_self_pairs():
    queue = ("player-a", "player-b")
    result = join_ring("player-b", queue, frozenset(), ACTIVE, arena_enabled=True)
    assert result.status == "repeated" and result.queue == queue and result.pair is None


def test_fifo_skips_players_already_in_a_duel_and_preserves_the_remainder():
    queue = ("busy", "player-a", "player-a", "player-b")
    result = join_ring("player-c", queue, frozenset({"busy"}), ACTIVE, arena_enabled=True)
    assert result.pair == ("player-a", "player-c")
    assert result.queue == ("player-b",)
    assert queue == ("busy", "player-a", "player-a", "player-b")


def test_active_duel_player_cannot_join():
    result = join_ring("busy", ("player-a",), frozenset({"busy"}), ACTIVE, arena_enabled=True)
    assert result.status == "in_duel" and result.pair is None
    assert result.queue == ("player-a",)


@pytest.mark.parametrize("first,arena", [(START, False), (None, True)])
def test_queue_requires_active_festival_and_arena(first, arena):
    timer = festival_timer(first, START, DURATION)
    result = join_ring("player-b", ("player-a",), frozenset(), timer, arena_enabled=arena)
    assert result.status == "closed" and result.pair is None
    assert result.queue == ("player-a",)


def test_expiry_refuses_pairing_even_when_somebody_is_waiting():
    timer = festival_timer(START, START + timedelta(seconds=DURATION), DURATION)
    assert (
        join_ring("player-b", ("player-a",), frozenset(), timer, arena_enabled=True).status
        == "closed"
    )


@pytest.mark.parametrize("player", ["", " "])
def test_a_verified_nonempty_player_is_required(player):
    with pytest.raises(ValueError, match="verified player"):
        claim_lamp(player, LAMPS[0], LAMPS, (), ACTIVE)
    with pytest.raises(ValueError, match="verified player"):
        join_ring(player, (), frozenset(), ACTIVE, arena_enabled=True)
