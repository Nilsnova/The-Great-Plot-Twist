// Extra pause-menu entries that a lazily loaded part of the game offers while it runs (the HUD's sea
// chart and controls, the host's projector panel, "Join the class harbor"), plus one status line
// (place · weather · time) that the HUD moved here. The pause menu reads both when it opens.
// Each provider returns [{label, onSelect}] (or a status string) and must not throw. An entry with
// travel: true leaves the Menu while travel is off ("one island", docs/GAME-V3.md §2; game.js says when).
const providers = new Set(), statuses = new Set();
let travelOpen = () => true;
export function setMenuTravel(open) { travelOpen = typeof open === 'function' ? open : () => true; }

export function addMenuExtras(provider) {
  providers.add(provider);
  return () => providers.delete(provider);
}
export function addMenuStatus(provider) {
  statuses.add(provider);
  return () => statuses.delete(provider);
}

export function menuExtras() {
  const entries = [];
  let travel = true;
  try { travel = travelOpen() !== false; } catch { travel = true; }
  for (const provider of providers) {
    try {
      for (const entry of provider() ?? []) if (entry && typeof entry.label === 'string' && typeof entry.onSelect === 'function' && (travel || entry.travel !== true)) entries.push(entry);
    } catch { /* A broken provider cannot break the pause menu. */ }
  }
  return entries;
}
export function menuStatus() {
  for (const provider of statuses) {
    try { const text = provider(); if (typeof text === 'string' && text.trim()) return text.trim(); } catch { /* ignored */ }
  }
  return '';
}
