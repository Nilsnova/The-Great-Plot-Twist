// Game rules for the browser version of Plot Twist: which actions are allowed, what they change
// and how progress is saved. No DOM code and no Three.js, so Vitest and Node.js can run it.
//
// This mirrors backend/plot_twist/engine.py rule for rule. The story is data
// (backend/content/story.json, served by GET /api/content/intro-story); this file only knows the
// rules. When you change a rule here, change it in engine.py in the same pull request:
// backend/plot_twist/tests/test_web_parity.py plays the same moves through both and fails when
// they disagree.
//
// Progress is kept by a storage object (see storage.js). The default is memoryStorage().
// Reading a save back is the job of saves.js.
//
// Used by: the story screens in the browser (added later), the story tests in frontend/tests
// and the parity runner in backend/plot_twist/tests.
import { parseSavedState } from './saves.js';
import { memoryStorage } from './storage.js';

export { SAVE_KEY, browserStorage, memoryStorage } from './storage.js';

export class Game {
  constructor(story, storage) {
    this.story = story;
    this.storage = storage || memoryStorage();
    this.state = this.newState();
  }

  // ---------- Start, save and resume (PT01) ----------

  newState() {
    return { scene: this.story.start, inventory: [], flags: [], ended: false, message: '' };
  }

  hasSave() {
    return this.loadSaved() !== null;
  }

  // Returns the saved state, or null if there is none or it is unusable
  // (for example a save from an older version of the story). See saves.js.
  loadSaved() {
    return parseSavedState(this.storage.read(), this.story);
  }

  // Reset all progress. The story content itself is left unchanged (R4).
  newGame() {
    this.state = this.newState();
    this.save();
  }

  resume() {
    const saved = this.loadSaved();
    if (saved === null) return false;
    this.state = saved;
    return true;
  }

  save() {
    return this.storage.write(JSON.stringify(this.state));
  }

  // ---------- Reading the current situation (PT02) ----------

  get scene() {
    return this.story.scenes[this.state.scene];
  }

  conditionsMet(conditions) {
    const c = conditions || {};
    const { inventory, flags } = this.state;
    return (
      (c.has || []).every((item) => inventory.includes(item)) &&
      (c.missing || []).every((item) => !inventory.includes(item)) &&
      (c.flags || []).every((flag) => flags.includes(flag)) &&
      (c.not_flags || []).every((flag) => !flags.includes(flag))
    );
  }

  // Extra lines that show remembered changes to this scene (R3).
  sceneNotes() {
    return (this.scene.notes || []).filter((n) => this.conditionsMet(n.when)).map((n) => n.text);
  }

  // Actions to show as {action, allowed}. Actions marked hide_when_blocked
  // are left out until their conditions are met (PT04).
  visibleActions() {
    if (this.state.ended) return [];
    const visible = [];
    for (const action of this.scene.actions || []) {
      const allowed = this.conditionsMet(action.requires);
      if (allowed || !action.hide_when_blocked) visible.push({ action, allowed });
    }
    return visible;
  }

  // {name, description} for each item the player holds (PT03).
  inventoryDetails() {
    return this.state.inventory.map((id) => ({
      name: this.story.items[id].name,
      description: this.story.items[id].description,
    }));
  }

  // ---------- Taking an action (PT02-PT05, R1-R3) ----------

  perform(actionId) {
    if (this.state.ended) {
      return { accepted: false, message: 'This story has ended. Start a new game to play again.' };
    }

    const action = (this.scene.actions || []).find((a) => a.id === actionId);
    if (!action) return { accepted: false, message: "You can't do that here." };

    if (!this.conditionsMet(action.requires)) {
      // R1: a blocked action does not move the player or change the inventory.
      return { accepted: false, message: action.blocked_message || "You can't do that right now." };
    }

    const item = action.take;
    if (item && !this.state.inventory.includes(item)) {
      this.state.inventory.push(item); // R2: never collect duplicates
    }
    for (const flag of action.set || []) {
      if (!this.state.flags.includes(flag)) this.state.flags.push(flag);
    }
    if (action.goto) this.state.scene = action.goto;
    if (this.scene.ending) this.state.ended = true;

    this.state.message = action.message;
    this.save(); // save after every accepted action
    return { accepted: true, message: action.message };
  }
}
