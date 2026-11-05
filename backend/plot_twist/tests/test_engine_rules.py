"""Engine rules that the other tests do not pin down, tested one rule at a time.

The original acceptance tests (test_acceptance.py) play the story from the outside. When the
engine was imported, mutation checks (breaking one rule in a copy of the engine on purpose, then
seeing whether any test notices) found rules that nothing exercised. These tests close the gaps.

Rules the real story can never show, so these tests change a copy of it. In the real story every
pick-up is already blocked a second time by a "requires" condition, and no ending lists any
actions, so the engine's own safety rules never get a chance to act:
  - R2: the engine never puts the same item in the inventory twice;
  - an ended story offers no actions and accepts none.

Rules the real story does show, but that the scenarios A1-A6 never check:
  - "not_flags" hides a choice once the flag is on;
  - a note is shown only while its conditions hold;
  - a flag is stored once, however often its action is repeated;
  - an accepted move remembers its message;
  - the three fixed texts for a refused move.

The one deliberate change from the solo engine: a Game without a save_path never opens a file,
because the web server never writes files.

These tests are NOT from the solo game. The browser engine has the same tests in
frontend/tests/story-engine-rules.test.js.

Used by: pytest (uv run pytest, from the backend folder).
"""

import pytest

from plot_twist.engine import Action, Game, GameState, Story, load_story

# The three fixed texts for a refused move. The browser engine uses exactly the same words.
ENDED_TEXT = "This story has ended. Start a new game to play again."
NOT_HERE_TEXT = "You can't do that here."
NOT_NOW_TEXT = "You can't do that right now."


def make_game(story: Story | None = None) -> Game:
    game = Game(story=story)
    game.new_game()
    return game


def play(game: Game, *action_ids: str) -> None:
    for action_id in action_ids:
        assert game.perform(action_id).accepted, f"{action_id} was rejected"


def find_action(story: Story, scene_id: str, action_id: str) -> Action:
    return next(a for a in story["scenes"][scene_id]["actions"] if a["id"] == action_id)


def visible_ids(game: Game) -> list[str]:
    return [action["id"] for action, _allowed in game.visible_actions()]


# ---------- Rules the real story can never show ----------


def test_an_item_is_never_collected_twice_even_if_the_story_offers_it_again():
    story = load_story()
    del find_action(story, "desk", "take_key")["requires"]  # now nothing blocks a second pick-up
    game = make_game(story)

    assert game.perform("to_desk").accepted
    assert game.perform("take_key").accepted
    assert game.perform("take_key").accepted  # the story allows it, so the engine must stop it

    assert game.state.inventory == ["brass_key"]


def test_an_ended_story_offers_no_actions_even_if_the_ending_lists_some():
    story = load_story()
    story["scenes"]["ending_rescue"]["actions"] = [
        {"id": "linger", "label": "Stay a while", "message": "You stay."}
    ]
    game = make_game(story)
    game.state = GameState(scene="ending_rescue", ended=True)

    assert game.visible_actions() == []
    assert game.perform("linger").accepted is False


# ---------- Rules the real story shows, but the scenarios A1-A6 never check ----------


def test_not_flags_hides_the_choices_once_the_harbor_is_warned():
    game = make_game()

    play(game, "to_shore", "warn_harbor")

    assert "trust_fisherman" not in visible_ids(game)
    assert "warn_harbor" not in visible_ids(game)


def test_a_note_is_shown_only_while_its_conditions_hold():
    story = load_story()
    game = make_game(story)

    play(game, "to_shore", "trust_fisherman")

    trusted_note = story["scenes"]["shore"]["notes"][1]["text"]
    assert game.scene_notes() == [trusted_note]


def test_a_flag_is_stored_once_even_if_its_action_is_repeated():
    game = make_game()

    play(game, "to_desk", "read_log", "read_log")

    assert game.state.flags == ["read_log"]


def test_an_accepted_move_remembers_its_message():
    story = load_story()
    game = make_game(story)

    play(game, "to_tower")

    assert game.state.message == find_action(story, "cottage", "to_tower")["message"]


def test_a_blocked_choice_without_a_text_of_its_own_says_you_cannot_do_that_right_now():
    game = make_game()
    play(game, "to_desk", "take_key", "desk_back", "to_desk")  # the drawer is empty now (A3)

    assert game.perform("take_key").message == NOT_NOW_TEXT


def test_a_choice_that_belongs_to_another_scene_says_you_cannot_do_that_here():
    game = make_game()  # the player is in the cottage, and "climb" belongs to the stairwell

    assert game.perform("climb").message == NOT_HERE_TEXT


def test_after_an_ending_every_choice_says_the_story_has_ended():
    game = make_game()
    game.state = GameState(scene="ending_rescue", ended=True)

    assert game.perform("signal").message == ENDED_TEXT


# ---------- The deliberate change: no save path means no file ----------


def test_a_game_without_a_save_path_never_opens_a_file(monkeypatch):
    story = load_story()  # read the story first: opening files is forbidden from here on

    def refuse_to_open(*args, **kwargs):
        raise AssertionError("the engine tried to open a file")

    monkeypatch.setattr("plot_twist.engine.open", refuse_to_open, raising=False)
    game = make_game(story)

    assert game.perform("to_desk").accepted
    assert game.has_save() is False


def test_resume_without_a_save_path_says_there_is_no_file():
    game = Game(story=load_story())

    with pytest.raises(FileNotFoundError):
        game.resume()
