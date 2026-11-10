"""Game rules for Plot Twist: which actions are allowed, what they change, how progress is saved.

The story is supplied content (backend/content/story.json). This module only knows the rules.

This is the engine of Nils' solo game (plot_twist/engine.py at commit e235ee4) with the same
rules. Two things changed on purpose:
  - the story file now lives in backend/content/story.json;
  - saving to a file is optional. With save_path=None (the default) no file is ever written,
    because the web server never writes files.

The browser copy of these rules was removed on 10 Nov 2026 (D031); this engine stays until the
later backend cleanup.

Used by: server/routes/content.py (it takes CONTENT_DIR from here), the tests in
plot_twist/tests and, in later packages, more server routes.
"""

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Self

# A story and an action are plain dictionaries, read straight from story.json.
Story = dict[str, Any]
Action = dict[str, Any]
Conditions = dict[str, list[str]]

# This file is backend/plot_twist/engine.py. The content folder is backend/content/.
CONTENT_DIR = Path(__file__).resolve().parent.parent / "content"
STORY_PATH = CONTENT_DIR / "story.json"


def load_story(path: str | Path = STORY_PATH) -> Story:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@dataclass
class GameState:
    """Everything that belongs to one playthrough."""

    scene: str
    inventory: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)
    ended: bool = False
    message: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "scene": self.scene,
            "inventory": list(self.inventory),
            "flags": list(self.flags),
            "ended": self.ended,
            "message": self.message,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        return cls(
            scene=data["scene"],
            inventory=list(data["inventory"]),
            flags=list(data["flags"]),
            ended=bool(data["ended"]),
            message=data.get("message", ""),
        )


@dataclass
class Result:
    """What happened when the player picked an action."""

    accepted: bool
    message: str


class Game:
    """One playthrough of a story. With a save_path it also keeps a save file; without, none."""

    def __init__(self, story: Story | None = None, save_path: str | Path | None = None) -> None:
        self.story = story if story is not None else load_story()
        self.save_path = save_path
        self.state = self.new_state()

    # ---------- Start, save and resume (PT01) ----------

    def new_state(self) -> GameState:
        return GameState(scene=self.story["start"])

    def has_save(self) -> bool:
        return self.save_path is not None and os.path.exists(self.save_path)

    def new_game(self) -> None:
        """Reset all progress. The story content itself is left unchanged (R4)."""
        self.state = self.new_state()
        self.save()

    def resume(self) -> None:
        if self.save_path is None:
            # There is no file to read, which is the same situation as a missing file.
            raise FileNotFoundError("This game has no save file (save_path is None).")
        with open(self.save_path, encoding="utf-8") as f:
            self.state = GameState.from_dict(json.load(f))

    def save(self) -> None:
        if self.save_path is None:
            return  # The server never writes files, so without a save path there is nothing to do.
        # Write to a temporary file first, so a crash never leaves a broken save.
        tmp_path = f"{self.save_path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(self.state.to_dict(), f, indent=2)
        os.replace(tmp_path, self.save_path)

    # ---------- Reading the current situation (PT02) ----------

    @property
    def scene(self) -> dict[str, Any]:
        return self.story["scenes"][self.state.scene]

    def conditions_met(self, conditions: Conditions | None) -> bool:
        conditions = conditions or {}
        inventory, flags = self.state.inventory, self.state.flags
        return (
            all(item in inventory for item in conditions.get("has", []))
            and all(item not in inventory for item in conditions.get("missing", []))
            and all(flag in flags for flag in conditions.get("flags", []))
            and all(flag not in flags for flag in conditions.get("not_flags", []))
        )

    def scene_notes(self) -> list[str]:
        """Extra lines that show remembered changes to this scene (R3)."""
        return [n["text"] for n in self.scene.get("notes", []) if self.conditions_met(n["when"])]

    def visible_actions(self) -> list[tuple[Action, bool]]:
        """Actions to show as (action, allowed) pairs. Actions marked
        hide_when_blocked are left out until their conditions are met (PT04)."""
        if self.state.ended:
            return []
        visible = []
        for action in self.scene.get("actions", []):
            allowed = self.conditions_met(action.get("requires"))
            if allowed or not action.get("hide_when_blocked"):
                visible.append((action, allowed))
        return visible

    def item_name(self, item_id: str) -> str:
        return self.story["items"][item_id]["name"]

    def inventory_details(self) -> list[tuple[str, str]]:
        """(name, description) for each item the player holds (PT03)."""
        items = self.story["items"]
        return [(items[i]["name"], items[i]["description"]) for i in self.state.inventory]

    # ---------- Taking an action (PT02-PT05, R1-R3) ----------

    def perform(self, action_id: str) -> Result:
        if self.state.ended:
            return Result(False, "This story has ended. Start a new game to play again.")

        action = next((a for a in self.scene.get("actions", []) if a["id"] == action_id), None)
        if action is None:
            return Result(False, "You can't do that here.")

        if not self.conditions_met(action.get("requires")):
            # R1: a blocked action does not move the player or change the inventory.
            return Result(False, action.get("blocked_message", "You can't do that right now."))

        item = action.get("take")
        if item and item not in self.state.inventory:  # R2: never collect duplicates
            self.state.inventory.append(item)
        for flag in action.get("set", []):
            if flag not in self.state.flags:
                self.state.flags.append(flag)
        if "goto" in action:
            self.state.scene = action["goto"]
        if self.scene.get("ending"):
            self.state.ended = True

        self.state.message = action["message"]
        self.save()  # save after every accepted action
        return Result(True, action["message"])
