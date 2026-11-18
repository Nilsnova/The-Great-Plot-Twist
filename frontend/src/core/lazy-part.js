// A part of the game that loads in its own chunk after the first frame (game.js: the narrator and the
// tutorials). Until it is built, every bus event is kept (the newest KEEP, in order); once built, the kept
// events of the types it subscribed to are replayed to it, so it hears what it would have heard from the
// start. A failed load is tried again on the next start().
const KEEP = 400;

export function createLazyPart({load, build, dispose: disposePart = () => {}, on}) {
  let part = null, loading = null, disposed = false;
  const kept = [];
  let stopKeeping = on('*', event => { kept.push(event); if (kept.length > KEEP) kept.shift(); });

  function make(module) {
    if (disposed) return null;
    const heard = new Map(); // type -> the listeners subscribed while building
    const keepingOn = (type, listener) => {
      if (!heard.has(type)) heard.set(type, []);
      heard.get(type).push(listener);
      return on(type, listener);
    };
    // Events sent while it builds reach it live, so only the ones kept before are replayed.
    const before = kept.length;
    part = build(module, keepingOn);
    stopKeeping(); stopKeeping = () => {};
    for (const event of kept.splice(0).slice(0, before)) for (const listener of heard.get(event.type) ?? []) listener(event);
    return part;
  }
  return {
    get part() { return part; },
    start() {
      if (part || disposed) return Promise.resolve(part);
      return loading ??= load().then(make).catch(error => {
        console.error(error); loading = null; return null;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true; stopKeeping(); kept.length = 0;
      if (part) disposePart(part);
    },
  };
}
