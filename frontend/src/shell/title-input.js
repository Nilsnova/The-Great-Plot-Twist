// Poll title gamepads after its first paint; the world owns input once it loads.
export function startTitleInput({adapter, isLoading, hasRuntime}) {
  let gamepad = null;
  let loading = false;
  let disposed = false;
  let frame = null;
  let previous = performance.now();

  function prepare() {
    if (gamepad || loading) return;
    let connected = false;
    try { connected = [...(navigator.getGamepads?.() ?? [])].some(pad => pad?.connected); } catch {}
    if (!connected) return;
    loading = true;
    import('../controls/gamepad.js').then(({createGamepad}) => {
      if (!disposed) gamepad = createGamepad({setVirtual() {}, press() {}}, {isPlaying: () => false});
    }).finally(() => { loading = false; });
  }

  function poll(now) {
    if (disposed || hasRuntime()) return;
    if (!isLoading()) {
      prepare();
      gamepad?.update();
      adapter.tick?.(Math.min(.1, (now - previous) / 1000));
    }
    previous = now;
    frame = requestAnimationFrame(poll);
  }
  frame = requestAnimationFrame(poll);
  return {dispose() { disposed = true; cancelAnimationFrame(frame); gamepad?.dispose(); }};
}
