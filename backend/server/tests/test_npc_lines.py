"""The fixed partner bank rejects hints and unsafe formats, and picks lines deterministically."""

import json
from copy import deepcopy

import pytest

from server.crews.seats import PARTNERS
from server.game.npc_lines import BANK_PATH, NpcLinesError, load_bank, parse_bank, pick_line


def raw_bank():
    return json.loads(BANK_PATH.read_text(encoding="utf-8"))


def replace_line(raw, text):
    raw["events"]["arrived"]["lines"]["any"][0] = text
    return raw


def test_the_real_bank_has_every_event_card_reason_group_and_canonical_speaker():
    bank = load_bank()
    assert set(bank.events) == {
        "order_accepted",
        "arrived",
        "found_card",
        "found_nothing",
        "pinned_card",
        "cannot_do_it",
        "manning_light",
        "beam_locked",
        "case_solved",
        "takeover",
    }
    assert set(bank.events["found_card"].lines) == {f"C{number}" for number in range(1, 9)}
    assert set(bank.events["pinned_card"].lines) == {f"C{number}" for number in range(1, 9)}
    assert sum(len(lines) for event in bank.events.values() for lines in event.lines.values()) == 34
    assert dict(bank.speakers) == PARTNERS


def test_bank_records_and_nested_lines_cannot_be_changed_after_loading():
    bank = load_bank()
    with pytest.raises(TypeError):
        bank.events["arrived"] = bank.events["takeover"]
    with pytest.raises(TypeError):
        bank.events["arrived"].lines["any"] = ("new",)
    assert isinstance(bank.events["arrived"].lines["any"], tuple)


def test_line_choice_follows_the_order_and_seat_salt_rules():
    bank = load_bank()
    for salt in range(1, 12):
        event = bank.events["order_accepted"]
        assert pick_line(bank, "order_accepted", "fetch", salt, {"minutes": 10}) == event.lines[
            "go"
        ][salt % 2].format(minutes=10)
        assert pick_line(bank, "order_accepted", "go", salt, {"minutes": 10}) == pick_line(
            bank, "order_accepted", "fetch", salt, {"minutes": 10}
        )
        solved = bank.events["case_solved"].lines["any"]
        assert pick_line(bank, "case_solved", "any", salt, {}) == solved[salt % 2]
    assert "5" in pick_line(bank, "order_accepted", "pin", 1, {"minutes": 5})
    assert "the Harbor Light" in pick_line(
        bank, "manning_light", "any", 1, {"light": "the Harbor Light"}
    )


def test_reason_maps_and_the_skeleton_line_come_only_from_the_bank():
    bank = load_bank()
    assert pick_line(bank, "cannot_do_it", "light_not_for_partners", 0, {}) == pick_line(
        bank, "cannot_do_it", "wrong_kit", 0, {}
    )
    assert pick_line(bank, "cannot_do_it", "no_lead", 0, {}) == pick_line(
        bank, "cannot_do_it", "not_ready", 0, {}
    )
    assert pick_line(bank, "pinned_card", "C4", 3, {}) == "Same seal on the crates. Pinning it."


@pytest.mark.parametrize(
    "text",
    (
        "x" * 81,
        "A long dash — here.",
        "A short dash - here.",
        "Two--dashes.",
        "Non ASCII café.",
        "New\nline.",
        "Tab\there.",
        "C1 is here.",
        "D4 is ready.",
        "A CLUE.",
        "Hidden things.",
        "Harbor Masters.",
        "Why not sail?",
        "Perhaps wait.",
        "Culprits.",
        "Fishermen.",
        "Foremen.",
        "Matches.",
        "Tries.",
        "{unknown}",
        "{minutes.__class__}",
        "{minutes[0]}",
        "{minutes!r}",
        "{minutes:010}",
        "An unmatched {",
        "An unmatched }",
        "{{minutes}}",
    ),
)
def test_bad_line_text_is_rejected_without_repeating_it_in_the_error(text):
    with pytest.raises(NpcLinesError) as error:
        parse_bank(replace_line(raw_bank(), text))
    assert text not in str(error.value)


@pytest.mark.parametrize(
    "change",
    (
        lambda raw: raw.update(format_version=True),
        lambda raw: raw.update(max_characters=81),
        lambda raw: raw.update(max_characters=False),
        lambda raw: raw["placeholders"].update(extra="unknown"),
        lambda raw: raw["speakers"]["2"].update(npc_id="impostor"),
        lambda raw: raw["events"].pop("arrived"),
        lambda raw: raw["events"]["found_card"]["lines"].pop("C8"),
        lambda raw: raw["events"]["arrived"].update(lines={"any": []}),
        lambda raw: raw["events"]["arrived"].update(lines={"any": "not a list"}),
        lambda raw: raw["events"]["arrived"].update(placeholders_used=["unknown"]),
        lambda raw: raw["events"]["order_accepted"].update(variant_map={"fetch": "missing"}),
    ),
)
def test_broken_bank_contracts_fail_closed(change):
    raw = raw_bank()
    change(raw)
    with pytest.raises(NpcLinesError):
        parse_bank(raw)


def test_a_declared_placeholder_must_be_allowed_for_that_event():
    with pytest.raises(NpcLinesError):
        parse_bank(replace_line(raw_bank(), "Wait {minutes} minutes."))


def test_placeholder_values_are_server_numbers_or_printable_light_names():
    bank = load_bank()
    for values in ({}, {"minutes": True}, {"minutes": -1}, {"minutes": 1.5}, {"minutes": "5"}):
        with pytest.raises(NpcLinesError):
            pick_line(bank, "cannot_do_it", "busy", 0, values)
    for light in ("", "line\nbreak", "<b>light</b>", 3):
        with pytest.raises(NpcLinesError):
            pick_line(bank, "manning_light", "any", 1, {"light": light})
    assert "0" in pick_line(bank, "cannot_do_it", "busy", 0, {"minutes": 0})


def test_unknown_events_variants_and_invalid_salts_fail_closed():
    bank = load_bank()
    for event, variant, salt in (
        ("missing", "any", 0),
        ("arrived", "missing", 0),
        ("arrived", "any", -1),
        ("arrived", "any", True),
    ):
        with pytest.raises(NpcLinesError):
            pick_line(bank, event, variant, salt, {})


def test_loader_rejects_unreadable_invalid_and_duplicate_json_without_leaking_text(tmp_path):
    path = tmp_path / "bank.json"
    for text in ("not json", '{"format_version":1,"format_version":1}'):
        path.write_text(text)
        with pytest.raises(NpcLinesError) as error:
            load_bank(path)
        assert text not in str(error.value)
    path.unlink()
    with pytest.raises(NpcLinesError):
        load_bank(path)


def test_later_additions_to_a_variant_keep_the_salt_rule():
    raw = deepcopy(raw_bank())
    raw["events"]["arrived"]["lines"]["any"].append("Back at the berth, Captain.")
    bank = parse_bank(raw)
    assert pick_line(bank, "arrived", "any", 3, {}) == "Back at the berth, Captain."
