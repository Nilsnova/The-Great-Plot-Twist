"""Check bank shape, safe templates and deterministic partner line selection.

Used by: developers verifying dialogue without copying or printing canonical prose.
"""

import json
from dataclasses import FrozenInstanceError

import pytest

from server.game.npc_lines import DEFAULT_LINES_PATH, load_lines, parse_lines, pick_line


@pytest.fixture
def raw():
    return json.loads(DEFAULT_LINES_PATH.read_text(encoding="utf-8"))


def same_line(actual, expected):
    if actual != expected:
        pytest.fail("The chosen partner line differs.", pytrace=False)


def replace_line(raw, value):
    raw["events"]["arrived"]["lines"]["any"] = [value]


def test_no_line_has_a_dash_a_card_or_deduction_id_or_a_banned_word(raw):
    bank = load_lines()
    values = {"minutes": 10, "light": "the lamp", "price": 50}
    count = 0
    for event, record in raw["events"].items():
        for variant, lines in record["lines"].items():
            for salt, template in enumerate(lines):
                same_line(
                    pick_line(bank, event, variant, salt, values), template.format_map(values)
                )
                count += 1
    assert count == 34


def test_line_choice_follows_the_salt_rule_and_allows_added_lines(raw):
    raw["events"]["arrived"]["lines"]["any"] = ["Ready.", "Aye.", "All set."]
    bank = parse_lines(raw)
    for salt in (0, 1, 2, 3, 10, 1000001):
        same_line(pick_line(bank, "arrived", "any", salt), ("Ready.", "Aye.", "All set.")[salt % 3])


def test_raw_order_kinds_and_refusals_use_the_stored_variant_maps(raw):
    bank = parse_lines(raw)
    values = {"minutes": 10, "light": "the lamp", "price": 50}
    for event, record in raw["events"].items():
        for alias, variant in record.get("variant_map", {}).items():
            same_line(
                pick_line(bank, event, alias, 1, values),
                pick_line(bank, event, variant, 1, values),
            )


def test_bank_is_frozen_and_detached_from_the_input(raw):
    replace_line(raw, "Ready.")
    bank = parse_lines(raw)
    replace_line(raw, "Aye.")
    raw["events"]["order_accepted"]["variant_map"]["fetch"] = "pin"
    same_line(pick_line(bank, "arrived", "any", 0), "Ready.")
    values = {"minutes": 10, "light": "the lamp"}
    same_line(
        pick_line(bank, "order_accepted", "fetch", 0, values),
        pick_line(bank, "order_accepted", "go", 0, values),
    )
    with pytest.raises(FrozenInstanceError):
        bank._lines = {}
    with pytest.raises(TypeError):
        bank._lines["arrived"]["any"] = ("Aye.",)
    with pytest.raises(TypeError):
        bank._variant_maps["order_accepted"]["fetch"] = "pin"
    assert "Ready." not in repr(bank)


def test_length_limit_counts_the_stored_template_before_substitution(raw):
    replace_line(raw, "a" * 80)
    bank = parse_lines(raw)
    assert len(pick_line(bank, "arrived", "any", 0)) == 80
    raw["events"]["arrived"]["lines"]["any"] = ["{light}"]
    raw["events"]["arrived"]["placeholders_used"] = ["light"]
    assert len(pick_line(parse_lines(raw), "arrived", "any", 0, {"light": "a" * 100})) == 100


@pytest.mark.parametrize(
    "line",
    [
        "",
        " ",
        "a" * 81,
        "\N{LATIN SMALL LETTER E WITH ACUTE}",
        "A\nB",
        "A\tB",
        "A-B",
        "A--B",
        "A\N{EN DASH}B",
        "A\N{EM DASH}B",
        "C1",
        "c8.",
        "D4",
        "D19",
        "{unknown}",
        "{light.name}",
        "{light[0]}",
        "{minutes!r}",
        "{minutes:02}",
        "{minutes:}",
        "{",
        "}",
        "{{light}}",
        12,
        None,
        True,
    ],
    ids=lambda value: type(value).__name__,
)
def test_invalid_templates_fail_with_generic_diagnostics(raw, line):
    replace_line(raw, line)
    with pytest.raises(ValueError, match="^The partner line bank is invalid[.]$"):
        parse_lines(raw)


@pytest.mark.parametrize(
    "word",
    [
        "harbor master",
        "harbormaster",
        "fisherman",
        "foreman",
        "commander",
        "culprit",
        "guilty",
        "suspect",
        "traitor",
        "villain",
        "betray",
        "blame",
        "clue",
        "hint",
        "deduction",
        "deduce",
        "pair",
        "match",
        "proof",
        "proves",
        "clears",
        "innocent",
        "hidden",
        "secret",
        "lie",
        "liar",
        "window",
        "should",
        "maybe",
        "perhaps",
        "probably",
        "interesting",
        "strange",
        "odd",
        "suspicious",
        "fishy",
        "try",
        "why not",
        "think",
        "elena",
        "fishermen",
        "foremen",
        "tries",
        "matches",
    ],
    ids=[f"word{number}" for number in range(44)],
)
def test_banned_words_are_case_insensitive_whole_words_including_plurals(raw, word):
    values = (
        (word.upper(),)
        if word in ("fishermen", "foremen", "tries", "matches")
        else (word.upper(), word + "s")
    )
    for value in values:
        replace_line(raw, f"Aye, {value}.")
        with pytest.raises(ValueError, match="^The partner line bank is invalid[.]$"):
            parse_lines(raw)


def test_words_containing_banned_substrings_are_allowed(raw):
    replace_line(raw, "Oddly enough, the supplies lieutenants carry are here.")
    parse_lines(raw)


@pytest.mark.parametrize(
    "mutation",
    [
        lambda x: x.update(format_version=True),
        lambda x: x.update(format_version=2),
        lambda x: x.update(max_characters=81),
        lambda x: x.update(about=""),
        lambda x: x.update(extra="metadata"),
        lambda x: x["events"].pop("arrived"),
        lambda x: x["events"]["arrived"]["lines"].update(any=[]),
        lambda x: x["events"]["arrived"]["lines"].update(other=["Ready."]),
        lambda x: x["events"]["arrived"].update(placeholders_used=["light"]),
        lambda x: x["events"]["arrived"].update(placeholders_used=["light", "light"]),
        lambda x: x["events"]["arrived"].update(placeholders_used=[{}]),
        lambda x: x["events"]["order_accepted"]["variant_map"].update(fetch="missing"),
        lambda x: x["events"]["order_accepted"].pop("variant_map"),
        lambda x: x["speakers"].pop("4"),
        lambda x: x["speakers"]["2"].update(npc_id=x["speakers"]["1"]["npc_id"]),
    ],
    ids=[f"shape{number}" for number in range(15)],
)
def test_invalid_bank_shape_fails_closed(raw, mutation):
    mutation(raw)
    with pytest.raises(ValueError, match="^The partner line bank is invalid[.]$"):
        parse_lines(raw)


@pytest.mark.parametrize("raw", [None, [], {}, {"format_version": 1}])
def test_incomplete_bank_fails_with_a_value_error(raw):
    with pytest.raises(ValueError, match="^The partner line bank is invalid[.]$"):
        parse_lines(raw)


@pytest.mark.parametrize("contents", ["not JSON", '{"events": {}, "events": {}}', "\xff"])
def test_unreadable_or_ambiguous_files_have_generic_errors(tmp_path, contents):
    path = tmp_path / "lines.json"
    path.write_bytes(contents.encode("latin-1"))
    with pytest.raises(ValueError, match="^The partner line bank could not be read[.]$"):
        load_lines(path)
    with pytest.raises(ValueError, match="^The partner line bank could not be read[.]$"):
        load_lines(tmp_path / "missing.json")


def test_load_lines_accepts_a_path_and_validates_its_contents(tmp_path, raw):
    replace_line(raw, "Ready.")
    path = tmp_path / "lines.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    same_line(pick_line(load_lines(str(path)), "arrived", "any", 0), "Ready.")


@pytest.mark.parametrize("salt", [True, -1, 1.0, "1", None])
def test_salt_must_be_a_nonnegative_integer(salt):
    with pytest.raises(ValueError):
        pick_line(load_lines(), "arrived", "any", salt)


def test_unknown_events_variants_and_invalid_values_fail_without_echoing_inputs():
    bank = load_lines()
    for event, variant in (("missing", "any"), ("arrived", "missing")):
        with pytest.raises(ValueError, match="^The requested partner line is not available[.]$"):
            pick_line(bank, event, variant, 0)
    for values in (
        {},
        {"minutes": True},
        {"minutes": -1},
        {"minutes": "10"},
        {"unknown": 1},
        {"light": ""},
        [],
    ):
        with pytest.raises(ValueError):
            pick_line(bank, "order_accepted", "go", 0, values)
