"""View calculations, countdown stability and boundary changes from the case contract."""

from dataclasses import replace
from datetime import timedelta, timezone

import pytest

from server.game.case_data import load_case
from server.game.case_view import CLOCK_KEYS, build_case_view
from server.tests.case_fixtures import EXAMPLE_NOW, VIEWER, example_snapshot


@pytest.fixture(scope="module")
def data():
    return load_case()


def without_clock_keys(value):
    if isinstance(value, dict):
        return {
            key: without_clock_keys(item) for key, item in value.items() if key not in CLOCK_KEYS
        }
    if isinstance(value, list):
        return [without_clock_keys(item) for item in value]
    return value


def route_in(view, route_id):
    return next(
        route
        for spot in view["search"]["spots"]
        for route in spot.get("routes", [])
        if route["id"] == route_id
    )


def test_the_spec_example_view_is_what_the_rules_build(data):
    view = build_case_view(data, example_snapshot(), VIEWER, EXAMPLE_NOW)

    assert view["caseId"] == data.case_id
    assert (view["writeRevision"], view["now"], view["minute"]) == (8, 2125, 35)
    assert view["me"] == {
        "seatNo": 1,
        "kit": "informant",
        "readLog": False,
        "coins": 1300,
        "timber": 20,
    }
    ferry = route_in(view, "C2.ferry_log_timed")
    assert (ferry["canStart"], ferry["reason"], ferry["waitMinutes"]) == (
        False,
        "locked_window",
        15,
    )
    assert view["search"]["jobs"] == [
        {
            "routeId": "C4.back_room",
            "cardId": "C4",
            "title": data.card("C4").title,
            "total": 300,
            "remaining": 112,
            "done": False,
            "foundLine": None,
        }
    ]
    credits = view["credits"]
    assert [(row["seat"], row["pins"], row["deductionParts"]) for row in credits] == [
        (1, 2, 1),
        (3, 1, 0),
    ]
    assert [row["state"] for row in view["board"]["cards"]] == ["used", "used", "pinned"]
    assert [row["cardId"] for row in view["board"]["leads"]] == ["C4", "C7"]
    assert view["board"]["logLead"] is None
    assert view["board"]["canPair"] is True
    assert view["reveal"] == {"available": False}
    assert "revision" not in view


def test_time_alone_changes_only_the_clock_keys(data):
    snapshot = example_snapshot()
    first = without_clock_keys(build_case_view(data, snapshot, VIEWER, 2101))

    for second in range(2102, 2237):
        assert without_clock_keys(build_case_view(data, snapshot, VIEWER, second)) == first


def test_revision_never_decreases_and_changes_on_every_write_and_every_landing(data):
    snapshot = example_snapshot()
    before = build_case_view(data, snapshot, VIEWER, 2236)
    landed = build_case_view(data, snapshot, VIEWER, 2237)
    written = build_case_view(data, replace(snapshot, write_revision=9), VIEWER, 2237)

    assert [before["writeRevision"], landed["writeRevision"], written["writeRevision"]] == [8, 8, 9]
    assert without_clock_keys(before) != without_clock_keys(landed)
    assert without_clock_keys(landed) != without_clock_keys(written)


def test_a_job_disappears_ten_minutes_after_landing(data):
    before = build_case_view(data, example_snapshot(), VIEWER, 2836)
    after = build_case_view(data, example_snapshot(), VIEWER, 2837)

    assert any(job["routeId"] == "C4.back_room" for job in before["search"]["jobs"])
    assert not any(job["routeId"] == "C4.back_room" for job in after["search"]["jobs"])


def test_forming_or_missing_viewer_has_no_case_view(data):
    assert build_case_view(data, replace(example_snapshot(), status="forming"), VIEWER, 0) is None
    assert build_case_view(data, example_snapshot(), "not-a-seated-player", 0) is None


def test_a_listed_window_changes_structure_when_it_opens_and_closes(data):
    window = data.window("ferry_in")
    opening = (2 * window.every_minutes + window.from_minute) * 60
    closing = opening + window.open_minutes * 60
    snapshot = example_snapshot()

    for boundary in (opening, closing):
        before = build_case_view(data, snapshot, VIEWER, boundary - 1)
        after = build_case_view(data, snapshot, VIEWER, boundary)
        assert without_clock_keys(before) != without_clock_keys(after)
    assert route_in(build_case_view(data, snapshot, VIEWER, opening), "C2.ferry_log_timed")[
        "canStart"
    ]
    assert not route_in(build_case_view(data, snapshot, VIEWER, closing), "C2.ferry_log_timed")[
        "canStart"
    ]


def test_started_at_is_utc_even_when_the_database_answer_uses_an_offset(data):
    snapshot = example_snapshot()
    snapshot = replace(
        snapshot, started_at=snapshot.started_at.astimezone(timezone(timedelta(hours=1)))
    )

    view = build_case_view(data, snapshot, VIEWER, EXAMPLE_NOW)

    assert view["crew"]["startedAt"] == "2026-11-13T10:02:00Z"
