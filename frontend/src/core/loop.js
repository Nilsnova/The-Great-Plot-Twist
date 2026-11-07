// One frame loop: update simulation first, then draw. Hiding the tab pauses time.
export function startLoop(update, render) {
  let previous = performance.now(), elapsed = 0, frame;
  function tick(now) {
    const delta = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    if (!document.hidden) { elapsed += delta; update(delta, elapsed); render(); }
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
