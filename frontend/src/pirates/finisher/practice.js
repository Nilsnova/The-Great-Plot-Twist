// T28 guidance memory, not authenticated progress. Used by the finisher scene and game wiring.
export function createPracticeMemory({player, island, storage} = {}) {
  try { storage ??= globalThis.localStorage; } catch { /* Browser storage may be blocked. */ }
  const finished = new Set();
  const key = task => `plot_twist_practice_v1:${JSON.stringify([player, island, task])}`;
  return {
    seen(task) {
      if (finished.has(task)) return true;
      try { return !!player && !!island && storage?.getItem(key(task)) === '1'; } catch { return false; }
    },
    finish(task) {
      finished.add(task);
      try { if (player && island) storage?.setItem(key(task), '1'); } catch { /* Session memory still works. */ }
    },
  };
}

// This unverified claim only scopes optional local guidance; it grants no permissions or rewards.
export function practicePlayer(token) {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub ?? null; }
  catch { return null; }
}
