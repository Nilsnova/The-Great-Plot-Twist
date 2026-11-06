// Reads a saved game back from its text. A save is only used when it fits the story being
// played, so a leftover save from an older version of the story is ignored instead of crashing.
// Pure code: no browser and no storage, so it is easy to test.
//
// Used by: engine.js (Game.loadSaved). frontend/tests/story-engine.test.js checks it through Game.

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// A save is usable when this story has its scene and its items and every field has the right type.
function isUsableSave(story, data) {
  return Boolean(
    data &&
      typeof data.scene === 'string' &&
      has(story.scenes, data.scene) &&
      Array.isArray(data.inventory) &&
      data.inventory.every((id) => has(story.items, id)) &&
      Array.isArray(data.flags) &&
      data.flags.every(flag => typeof flag === 'string') &&
      typeof data.ended === 'boolean',
  );
}

// Returns the saved state, or null if there is no text, it is not JSON or it is unusable.
export function parseSavedState(text, story) {
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    if (!isUsableSave(story, data)) return null;
    return {
      scene: data.scene,
      inventory: data.inventory.slice(),
      flags: data.flags.slice(),
      ended: data.ended,
      message: typeof data.message === 'string' ? data.message : '',
    };
  } catch {
    return null;
  }
}
