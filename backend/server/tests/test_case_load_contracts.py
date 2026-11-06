"""Additional case load regressions for references used by later rules and safe errors.

Used by: pytest. Mutations never copy or print protected content.
"""

import pytest

from server.game.case_checks import LOAD_TIME_CHECKS
from server.game.case_data import CaseDataError, parse_case
from server.game.case_lint import LINT_RULES
from server.tests.case_data_helpers import raw_case


@pytest.mark.parametrize(
    ("rule", "change"),
    [
        ("L1", lambda raw: raw["cards"][0]["routes"][0].update(timer_minutes=-1)),
        ("L2", lambda raw: raw["entry_profiles"][0].update(id="UPPERCASE")),
        ("L2", lambda raw: raw["reveal"]["lines"][0].update(id="UPPERCASE")),
        ("L3", lambda raw: raw["night"]["lights"][0].update(place="unknown_place")),
        ("L3", lambda raw: raw["night"]["lights"][0].update(hotspot="unknown_hotspot")),
        ("L3", lambda raw: raw["night"]["lights"][-1]["ready"].update(fit_after=["D9"])),
        ("L3", lambda raw: raw["partners"]["kit_order"].append("unknown_kit")),
        ("L3", lambda raw: raw["continuity_lines"][0].update(place="unknown_place")),
        ("L3", lambda raw: raw["reveal"]["order"].append("unknown_line")),
        ("L3", lambda raw: raw["deductions"][0]["opens"].append("C9")),
    ],
    ids=[
        "negative-timer",
        "profile-id",
        "reveal-id",
        "light-place",
        "light-hotspot",
        "light-gate",
        "partner-kit",
        "continuity-place",
        "reveal-order",
        "opened-card",
    ],
)
def test_later_rules_cannot_receive_unresolved_references(rule, change):
    raw = raw_case()
    change(raw)

    with pytest.raises(CaseDataError) as caught:
        LOAD_TIME_CHECKS[rule](parse_case(raw))

    assert caught.value.rule == rule
    assert raw["accusation"]["culprit"] not in str(caught.value)


def test_a_feature_flag_is_not_a_free_route_available_to_every_profile():
    raw = raw_case()
    raw["cards"][0]["routes"][0]["needs_flag"] = "market"

    assert LINT_RULES["L10"](parse_case(raw))


@pytest.mark.parametrize("location", ["window", "closing"])
def test_an_invalid_object_key_is_not_repeated_in_a_loading_error(location):
    raw = raw_case()
    private_id = raw["accusation"]["culprit"]
    if location == "window":
        raw["case_clock"]["windows"][private_id] = "invalid object"
    else:
        raw["reveal"]["closing_lines"][private_id] = "invalid object"

    with pytest.raises(CaseDataError) as caught:
        parse_case(raw)

    assert private_id not in str(caught.value)
