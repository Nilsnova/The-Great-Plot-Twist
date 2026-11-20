// One frame loop: update simulation first, then draw. Hiding the tab pauses time.
//
// A frame that throws must not end the game: the next frame is always asked for first, so one bad
// frame is skipped instead of freezing the screen for good. The error is written to the console once
// per run of bad frames (not 60 times a second). If frames keep failing for TROUBLE_FRAMES in a row,
// onTrouble(error) is called once so the game can tell the player; onRecover() when frames work again.
export const TROUBLE_FRAMES = 30;
export function startLoop(update, render, {onTrouble = null, onRecover = null, report = error => console.error(error)} = {}) {
  let previous = performance.now(), elapsed = 0, frame, failed = 0, told = false;
  const safely = run => { try { run(); } catch { /* a failing handler must not stop the loop either */ } };
  function tick(now) {
    frame = requestAnimationFrame(tick);
    const delta = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    if (document.hidden) return;
    elapsed += delta;
    // Update and draw are guarded apart: a failed update still lets the picture be drawn.
    let trouble = null;
    try { update(delta, elapsed); } catch (error) { trouble = error; }
    try { render(); } catch (error) { trouble ??= error; }
    if (!trouble) {
      if (told) { told = false; if (onRecover) safely(onRecover); }
      failed = 0;
      return;
    }
    failed++;
    if (failed === 1) safely(() => report(trouble));
    if (failed === TROUBLE_FRAMES && !told) { told = true; if (onTrouble) safely(() => onTrouble(trouble)); }
  }
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
