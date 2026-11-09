// Extra pause-menu entries that a lazily loaded part of the game offers while it runs (G29: "Full
// mystery", "Class demo", the host's projector panel and "Join the class harbor"). The pause menu reads
// them when it opens. Each provider returns [{label, onSelect, prologue?}] and must not throw.
const providers = new Set();

export function addMenuExtras(provider) {
  providers.add(provider);
  return () => providers.delete(provider);
}

export function menuExtras() {
  const entries = [];
  for (const provider of providers) {
    try {
      for (const entry of provider() ?? []) if (entry && typeof entry.label === 'string' && typeof entry.onSelect === 'function') entries.push(entry);
    } catch { /* A broken provider cannot break the pause menu. */ }
  }
  return entries;
}

// The Lighthouse prologue is the full mystery (G29): whoever starts it (pause menu or Settings > Story)
// tells the running class demo, which leaves the demo path. A demo loaded later reads the saved path.
const prologueListeners = new Set();
export function onPrologue(listener) {
  prologueListeners.add(listener);
  return () => prologueListeners.delete(listener);
}
export function notePrologue() {
  for (const listener of prologueListeners) { try { listener(); } catch { /* Never blocks the prologue. */ } }
}
