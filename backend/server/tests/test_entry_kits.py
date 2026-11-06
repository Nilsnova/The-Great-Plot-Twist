"""Tests for game/entry_kits.py and backend/content/entry_kits.json: the four entry kits.

The kits are data. These tests load the real file and check what the rest of the server relies on:
there are exactly four kits with the agreed ids, every pair of ending and decision belongs to one
kit, the endings and flags are the ones the real story has, and the start places are places the
browser knows. A second group feeds the loader broken files and checks that each one is refused
with a message, so a typo in the content cannot reach a player.

The coins are pinned on purpose (decision N5 in specs/M1-backbone.md, which waited for Nils'
approval of the S0 story drafts and was settled by the story round, D018): if somebody changes an
amount, a test fails and the change gets noticed.

Used by: pytest (cd backend && uv run pytest).
"""

import copy
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from plot_twist.engine import load_story
from server.app import create_app
from server.game.entry_kits import (
    DECISIONS,
    ENTRY_KITS_PATH,
    EntryKits,
    kit_by_id,
    kit_for,
    load_entry_kits,
)
from server.routes.content import PUBLIC_CONTENT
from server.tests.helpers import CONFIGURED_SETTINGS, REPO_ROOT, assert_error
from server.wallet import validate_transaction

REGISTRY_PATH = REPO_ROOT / "frontend" / "src" / "world" / "places" / "registry.js"


def real_kits() -> EntryKits:
    return load_entry_kits()


def real_file() -> dict[str, Any]:
    """The kits file as plain JSON, for the tests that break it on purpose."""
    return json.loads(ENTRY_KITS_PATH.read_text(encoding="utf-8"))


def story_flags() -> set[str]:
    """Every flag that some action of the real story switches on."""
    flags: set[str] = set()
    for scene in load_story()["scenes"].values():
        for action in scene.get("actions", []):
            flags.update(action.get("set", []))
    return flags


# --- the real file ---


def test_there_are_four_kits_with_the_agreed_ids():
    ids = [kit.id for kit in real_kits().kits]

    assert ids == ["true_keeper", "witness", "informant", "stranger"]


def test_each_ending_and_decision_belongs_to_exactly_one_kit():
    pairs = [(kit.ending, kit.decision) for kit in real_kits().kits]

    assert len(set(pairs)) == len(pairs) == 4
    assert sorted(pairs) == [
        ("ending_rescue", "warned"),
        ("ending_trapped", "none"),
        ("ending_trapped", "trusted"),
        ("ending_trapped", "warned"),
    ]


def test_the_coins_are_1000_and_1600_for_the_stranger():
    # N5, settled by the story round (D018): the amounts come from the S0 drafts (CASE-FILE.md 3).
    coins = {kit.id: kit.coins for kit in real_kits().kits}

    assert coins == {"true_keeper": 1000, "witness": 1000, "informant": 1000, "stranger": 1600}


def test_every_kit_ending_is_an_ending_scene_of_the_story():
    scenes = load_story()["scenes"]

    for kit in real_kits().kits:
        assert scenes[kit.ending].get("ending") is True, kit.id


def test_the_decision_and_log_flags_are_flags_the_story_sets():
    kits = real_kits()

    assert {kits.trusted_flag, kits.warned_flag, kits.log_flag} <= story_flags()


def test_the_two_decision_flags_and_the_log_flag_are_three_different_flags():
    kits = real_kits()

    assert len({kits.trusted_flag, kits.warned_flag, kits.log_flag}) == 3


def test_every_start_place_is_a_place_of_the_browser_registry():
    # The registry is browser code. It is read as text: a place is a key of its object.
    registry = REGISTRY_PATH.read_text(encoding="utf-8")

    for kit in real_kits().kits:
        assert f"{kit.start_place}:" in registry, kit.start_place


def test_every_kit_has_a_card_an_item_and_a_name_for_the_player():
    for kit in real_kits().kits:
        assert kit.name and kit.cheap_card
        assert kit.item.id and kit.item.name and kit.item.text


def test_every_kit_payout_passes_the_wallet_rules():
    # The route checks this before the database is called. A kit that failed it could never be
    # granted.
    for kit in real_kits().kits:
        validate_transaction(kit.coins, "kit_grant", "kit")


def test_the_decisions_are_warned_trusted_and_none():
    assert DECISIONS == ("warned", "trusted", "none")
    assert {kit.decision for kit in real_kits().kits} <= set(DECISIONS)


def test_the_kits_file_is_server_only_and_never_served():
    # Being in backend/content/ does not make a file public. Only names on PUBLIC_CONTENT are.
    assert "entry_kits.json" not in PUBLIC_CONTENT.values()
    client = TestClient(create_app(CONFIGURED_SETTINGS))

    for name in ("entry-kits", "entry_kits", "entry_kits.json"):
        assert_error(client.get(f"/api/content/{name}"), 404, "content_not_found")


# --- finding a kit ---


def test_kit_for_gives_the_kit_of_each_ending_and_decision():
    kits = real_kits()

    assert kit_for(kits, "ending_rescue", "warned").id == "true_keeper"
    assert kit_for(kits, "ending_trapped", "warned").id == "witness"
    assert kit_for(kits, "ending_trapped", "trusted").id == "informant"
    assert kit_for(kits, "ending_trapped", "none").id == "stranger"


@pytest.mark.parametrize(
    ("ending", "decision"),
    [
        ("ending_rescue", "trusted"),  # the story cannot end in a rescue without warning the harbor
        ("ending_rescue", "none"),
        ("ending_nowhere", "warned"),
        ("ending_trapped", "maybe"),
    ],
)
def test_kit_for_an_unknown_pair_is_a_content_error_and_never_a_kit(ending, decision):
    with pytest.raises(ValueError, match="No entry kit"):
        kit_for(real_kits(), ending, decision)


def test_kit_by_id_finds_each_kit():
    kits = real_kits()

    for kit in kits.kits:
        assert kit_by_id(kits, kit.id) is kit


def test_kit_by_id_refuses_an_unknown_id():
    with pytest.raises(ValueError, match="No entry kit"):
        kit_by_id(real_kits(), "dragon")


def test_a_kit_is_a_frozen_value():
    kit = real_kits().kits[0]

    with pytest.raises(AttributeError):
        kit.coins = 5


# --- broken files are refused ---


def change(mutate: Callable[[dict[str, Any]], None]) -> Callable[[dict[str, Any]], dict[str, Any]]:
    """Turn a function that edits the good file into one that returns the edited copy."""

    def apply(good: dict[str, Any]) -> dict[str, Any]:
        broken = copy.deepcopy(good)
        mutate(broken)
        return broken

    return apply


def drop_from_first_kit(field: str) -> Callable[[dict[str, Any]], dict[str, Any]]:
    return change(lambda broken: broken["kits"][0].pop(field))


def set_on_first_kit(field: str, value: object) -> Callable[[dict[str, Any]], dict[str, Any]]:
    return change(lambda broken: broken["kits"][0].__setitem__(field, value))


def duplicate_the_pair(broken: dict[str, Any]) -> None:
    broken["kits"][1]["ending"] = broken["kits"][0]["ending"]
    broken["kits"][1]["decision"] = broken["kits"][0]["decision"]


BROKEN_FILES = {
    "a missing coins field": drop_from_first_kit("coins"),
    "a missing item": drop_from_first_kit("item"),
    "a missing cheap card": drop_from_first_kit("cheapCard"),
    "an unknown decision": set_on_first_kit("decision", "maybe"),
    "coins of 0": set_on_first_kit("coins", 0),
    "negative coins": set_on_first_kit("coins", -5),
    "more coins than a wallet change may hold": set_on_first_kit("coins", 1_000_001),
    "coins as text": set_on_first_kit("coins", "1000"),
    "coins as true": set_on_first_kit("coins", True),
    "coins with decimals": set_on_first_kit("coins", 1000.5),
    "a kit id with a capital letter": set_on_first_kit("id", "True_Keeper"),
    "a kit id with a dash": set_on_first_kit("id", "true-keeper"),
    "an empty name": set_on_first_kit("name", "   "),
    "a start place with a space": set_on_first_kit("startPlace", "lighthouse isle"),
    "an item without text": change(lambda broken: broken["kits"][0]["item"].pop("text")),
    "an item that is not an object": set_on_first_kit("item", "keeper_permit"),
    "a kit that is not an object": change(lambda broken: broken["kits"].__setitem__(0, "kit")),
    "a duplicate ending and decision pair": change(duplicate_the_pair),
    "a duplicate kit id": change(
        lambda broken: broken["kits"][1].__setitem__("id", broken["kits"][0]["id"])
    ),
    "no kits": change(lambda broken: broken.__setitem__("kits", [])),
    "kits that are not a list": change(lambda broken: broken.__setitem__("kits", {})),
    "a missing log flag": change(lambda broken: broken.pop("logFlag")),
    "a log flag that is not text": change(lambda broken: broken.__setitem__("logFlag", 7)),
    "a missing decision flags object": change(lambda broken: broken.pop("decisionFlags")),
    "a missing trusted flag": change(lambda broken: broken["decisionFlags"].pop("trusted")),
    "the same flag for both decisions": change(
        lambda broken: broken["decisionFlags"].__setitem__("trusted", "warned_harbor")
    ),
    "the log flag is also a decision flag": change(
        lambda broken: broken.__setitem__("logFlag", "warned_harbor")
    ),
}


@pytest.mark.parametrize("make_broken", BROKEN_FILES.values(), ids=BROKEN_FILES.keys())
def test_a_broken_kit_file_is_refused(make_broken, tmp_path: Path):
    broken_file = tmp_path / "entry_kits.json"
    broken_file.write_text(json.dumps(make_broken(real_file())), encoding="utf-8")

    with pytest.raises(ValueError, match=r"entry_kits\.json"):
        load_entry_kits(broken_file)


@pytest.mark.parametrize("text", ["this is not json", "[]", "null", '"kits"', ""])
def test_a_kit_file_that_is_not_a_json_object_is_refused(text, tmp_path: Path):
    broken_file = tmp_path / "entry_kits.json"
    broken_file.write_text(text, encoding="utf-8")

    with pytest.raises(ValueError, match=r"entry_kits\.json"):
        load_entry_kits(broken_file)


def test_a_missing_kit_file_is_an_os_error_the_route_can_catch(tmp_path: Path):
    with pytest.raises(OSError):
        load_entry_kits(tmp_path / "not_there.json")


def test_the_good_file_loads_from_a_copy_too(tmp_path: Path):
    # The broken-file tests above start from this copy. If the copy did not load, they would all
    # pass for the wrong reason.
    good_copy = tmp_path / "entry_kits.json"
    good_copy.write_text(json.dumps(real_file()), encoding="utf-8")

    assert load_entry_kits(good_copy) == real_kits()
