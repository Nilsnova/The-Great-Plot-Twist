"""The format rules for story.json, written as a small checker and tested.

backend/content/README.md describes the format of story.json. The Python engine and the browser
engine give the same answers for every story that follows it. For a story that does not, they can
differ. For example, a note with no "when" makes Python stop with an error while the browser always
shows the note, and an "ending" set to an empty list counts as false in Python but as true in the
browser. Once the server replays a player's moves with the Python engine (package A3), such a
difference would make the server decide something other than what the player saw. So the rules are
checked here, and the checker itself is tested on stories that break one rule each.

find_story_problems(story) returns a list of problems in plain English. Each one starts with the
place where it was found, for example "scenes.desk.notes.0.when: is required". An empty list means
the story follows the format. Fields that the format does not mention are allowed, because both
engines ignore them (docs/STORY.md relies on that).

The rules can move into backend/tools/lint_content.py when that linter exists (second S1 pull
request). They do not check that every scene can be reached or that flag names are spelled the same
way everywhere; the README says so.

Used by: pytest (uv run pytest, from the backend folder).
"""

import copy
from collections.abc import Callable
from typing import Any

import pytest

from plot_twist.engine import Story, load_story

# The four lists a conditions object may hold (see "Conditions" in backend/content/README.md).
CONDITION_LISTS = ("has", "missing", "flags", "not_flags")

# The tests below use this to say "take this key out of the story".
REMOVE = object()


def where(path: tuple) -> str:
    return ".".join(str(part) for part in path)


def is_text(value: Any) -> bool:
    return isinstance(value, str) and value != ""


def is_list_of_text(value: Any) -> bool:
    return isinstance(value, list) and all(is_text(item) for item in value)


# ---------- The rules, one small function each ----------


def check_required_text(owner: dict, field: str, path: tuple, problems: list[str]) -> None:
    if field not in owner:
        problems.append(f"{where(path + (field,))}: is required")
    elif not is_text(owner[field]):
        problems.append(f"{where(path + (field,))}: must be a text that is not empty")


def check_optional_text(owner: dict, field: str, path: tuple, problems: list[str]) -> None:
    if field in owner and not is_text(owner[field]):
        problems.append(f"{where(path + (field,))}: must be a text that is not empty")


def check_optional_true(owner: dict, field: str, path: tuple, problems: list[str]) -> None:
    if field in owner and owner[field] is not True:
        problems.append(f"{where(path + (field,))}: must be true, or left out")


def check_optional_text_list(owner: dict, field: str, path: tuple, problems: list[str]) -> None:
    if field in owner and not is_list_of_text(owner[field]):
        problems.append(f"{where(path + (field,))}: must be a list of texts that are not empty")


def check_conditions(conditions: Any, path: tuple, problems: list[str]) -> None:
    if not isinstance(conditions, dict):
        problems.append(f"{where(path)}: must be an object")
        return
    for name in CONDITION_LISTS:
        check_optional_text_list(conditions, name, path, problems)


def check_note(note: Any, path: tuple, problems: list[str]) -> None:
    if not isinstance(note, dict):
        problems.append(f"{where(path)}: must be an object")
        return
    if "when" not in note:
        problems.append(f"{where(path + ('when',))}: is required")
    else:
        check_conditions(note["when"], path + ("when",), problems)
    check_required_text(note, "text", path, problems)


def check_action(action: Any, path: tuple, problems: list[str]) -> None:
    if not isinstance(action, dict):
        problems.append(f"{where(path)}: must be an object")
        return
    for field in ("id", "label", "message"):
        check_required_text(action, field, path, problems)
    for field in ("goto", "take", "blocked_message"):
        check_optional_text(action, field, path, problems)
    check_optional_text_list(action, "set", path, problems)
    if "requires" in action:
        check_conditions(action["requires"], path + ("requires",), problems)
    check_optional_true(action, "hide_when_blocked", path, problems)


def check_list_of(
    owner: dict, field: str, check_one: Callable, path: tuple, problems: list[str]
) -> None:
    if field not in owner:
        return
    if not isinstance(owner[field], list):
        problems.append(f"{where(path + (field,))}: must be a list")
        return
    for index, entry in enumerate(owner[field]):
        check_one(entry, path + (field, index), problems)


def check_scene(scene: Any, path: tuple, problems: list[str]) -> None:
    if not isinstance(scene, dict):
        problems.append(f"{where(path)}: must be an object")
        return
    check_required_text(scene, "title", path, problems)
    check_required_text(scene, "text", path, problems)
    check_optional_true(scene, "ending", path, problems)
    check_list_of(scene, "notes", check_note, path, problems)
    check_list_of(scene, "actions", check_action, path, problems)


def check_item(item: Any, path: tuple, problems: list[str]) -> None:
    if not isinstance(item, dict):
        problems.append(f"{where(path)}: must be an object")
        return
    check_required_text(item, "name", path, problems)
    check_required_text(item, "description", path, problems)


def check_each_value(story: dict, field: str, check_one: Callable, problems: list[str]) -> None:
    """Check every entry of story[field], which maps an id to an item or a scene."""
    if not isinstance(story.get(field), dict):
        problems.append(f"{field}: must be an object")
        return
    for entry_id, entry in story[field].items():
        check_one(entry, (field, entry_id), problems)


def check_start(story: dict, problems: list[str]) -> None:
    scenes = story.get("scenes")
    if not isinstance(scenes, dict):
        return  # the problem with "scenes" is already reported
    start = story.get("start")
    if not is_text(start) or start not in scenes:
        problems.append("start: must name a scene of the story")


def find_story_problems(story: Story) -> list[str]:
    problems: list[str] = []
    check_required_text(story, "title", (), problems)
    check_each_value(story, "items", check_item, problems)
    check_each_value(story, "scenes", check_scene, problems)
    check_start(story, problems)
    return problems


# ---------- The tests ----------


def story_with(path: tuple, value: Any) -> Story:
    """A copy of the real story with one value changed, or taken out when value is REMOVE."""
    story = copy.deepcopy(load_story())
    owner = story
    for key in path[:-1]:
        owner = owner[key]
    if value is REMOVE:
        del owner[path[-1]]
    else:
        owner[path[-1]] = value
    return story


def test_the_real_story_follows_the_format():
    assert find_story_problems(load_story()) == []


def test_fields_the_format_does_not_mention_are_allowed():
    story = load_story()
    story["version"] = 2
    story["scenes"]["desk"]["mood"] = "quiet"
    story["scenes"]["desk"]["notes"][0]["colour"] = "grey"
    story["scenes"]["desk"]["actions"][0]["sound"] = "click"

    assert find_story_problems(story) == []


# Where things are in the real story, named after what they are.
TO_DESK = ("scenes", "cottage", "actions", 0)
TAKE_KEY = ("scenes", "desk", "actions", 0)
READ_LOG = ("scenes", "desk", "actions", 1)
UNLOCK_DOOR = ("scenes", "tower_door", "actions", 0)
NOTE_KEY_MISSING = ("scenes", "desk", "notes", 0)
NOTE_KEY_TAKEN = ("scenes", "desk", "notes", 1)

# Each case breaks one rule: (what is wrong, where in the story, the bad value).
BROKEN_STORIES = [
    ("a title that is missing", ("title",), REMOVE),
    ("a start that names no scene", ("start",), "moon_base"),
    ("an item without a name", ("items", "brass_key", "name"), REMOVE),
    ("a scene without text", ("scenes", "cottage", "text"), REMOVE),
    ("an ending that is an empty list", ("scenes", "ending_rescue", "ending"), []),
    ("actions that are not a list", ("scenes", "cottage", "actions"), {}),
    ("a note without a when", NOTE_KEY_MISSING + ("when",), REMOVE),
    ("a note whose text is a number", NOTE_KEY_MISSING + ("text",), 5),
    ("a when list that is a single text", NOTE_KEY_TAKEN + ("when", "has"), "brass_key"),
    ("an action id that is empty", READ_LOG + ("id",), ""),
    ("an action without a label", TO_DESK + ("label",), REMOVE),
    ("an action message that is null", TO_DESK + ("message",), None),
    ("a goto that is empty", TO_DESK + ("goto",), ""),
    ("a take that is a list", TAKE_KEY + ("take",), ["brass_key"]),
    ("a blocked_message that is null", UNLOCK_DOOR + ("blocked_message",), None),
    ("a hide_when_blocked that is an object", TAKE_KEY + ("hide_when_blocked",), {}),
    ("a set that is null", READ_LOG + ("set",), None),
    ("a set that holds a number", READ_LOG + ("set",), ["read_log", 3]),
    ("a requires that is a list", UNLOCK_DOOR + ("requires",), ["brass_key"]),
    ("a requires list that is null", TAKE_KEY + ("requires", "missing"), None),
]


@pytest.mark.parametrize("description, path, bad_value", BROKEN_STORIES)
def test_a_badly_formed_story_is_reported_where_it_is_wrong(description, path, bad_value):
    problems = find_story_problems(story_with(path, bad_value))

    assert len(problems) == 1, description
    assert problems[0].startswith(where(path))


def test_every_problem_is_reported_not_only_the_first():
    story = story_with(("start",), "moon_base")
    story["scenes"]["desk"]["notes"][0].pop("when")

    problems = find_story_problems(story)

    assert len(problems) == 2
