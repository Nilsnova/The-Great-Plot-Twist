// While a boss finisher or a last-chance rescue runs, its minigame owns the keyboard (arrows, A/D and
// Space aim and fire in it). The captain must stand still meanwhile, or one key press both aims the
// minigame and walks the island (QA finding 04). game.js asks this every frame.
//   waves: {island: wave controller, point?: {controller}} as built by pirates/game-wiring.js, or null.
const active = controller => controller?.state?.finisher?.active === true;
export const finisherOwnsKeys = waves => active(waves?.island) || active(waves?.point?.controller);

/** Tells when the answer flips, so held keys can be let go once at the start and once at the end. */
export function createFinisherWatch() {
  let was = false;
  return now => { const changed = now !== was; was = now; return changed; };
}
