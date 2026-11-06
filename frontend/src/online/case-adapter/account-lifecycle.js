// Journal reads and autosaves run on scene changes or a minute timer, never inside the frame loop.
import {validReplay} from './replay.js';

function journalActions(read) {
  try {
    const value = read?.();
    const journal = typeof value === 'string' ? JSON.parse(value) : value;
    if (journal?.version !== 1 || !validReplay({kind: 'intro', actions: journal.actions})) return null;
    return [...journal.actions];
  } catch { return null; }
}
const sameActions = (first, second) => JSON.stringify(first) === JSON.stringify(second);

export function createAccountLifecycle(ctx) {
  let place = null;
  let timer = null;
  let closed = false;
  function clear() { if (timer !== null) clearTimeout(timer); timer = null; }
  function arm() {
    clear();
    if (closed || ctx.document?.hidden) return;
    timer = setTimeout(heartbeat, 60000);
    timer?.unref?.();
  }
  function replay() {
    const actions = journalActions(ctx.readLocalSave);
    if (!actions) return null;
    const previous = ctx.state.deviceSave?.data;
    const changed = previous && !sameActions(previous.actions, actions);
    const kind = changed ? 'intro' : previous?.kind ?? ctx.state.cloudSave?.data?.kind ?? 'intro';
    return {kind, actions, place: kind === 'intro' ? 'lighthouse_isle'
      : place ?? previous?.place ?? ctx.state.cloudSave?.data?.place ?? ctx.state.me?.place};
  }
  async function stage(immediate = false) {
    if (closed || ctx.document?.hidden) return;
    const data = replay();
    if (data) {
      const signedIn=ctx.session.isSignedIn();
      const result=await ctx.saves.stageReplay(data, {immediate:immediate&&signedIn});
      if (!closed&&!signedIn&&!ctx.session.isSignedIn()&&result?.accepted) ctx.store.commit({saveState:'saved'});
    }
  }
  async function heartbeat() {
    timer = null;
    if (closed || ctx.document?.hidden) return;
    try { await stage(); await ctx.saves.tick(); } finally { arm(); }
  }
  const stopPlace = ctx.on?.('arrived', event => {
    if (typeof event.place !== 'string') return;
    const previous = place;
    place = event.place;
    if (previous !== null && previous !== place) void stage(true);
  });
  const visibility = () => ctx.document.hidden ? clear() : arm();
  ctx.document?.addEventListener?.('visibilitychange', visibility);
  arm();
  return {
    reconcile() {
      const device = ctx.state.deviceSave?.data, cloud = ctx.state.cloudSave?.data;
      // The journal has no world-place field. Equal moves adopt the known cloud place after reload.
      if (validReplay(cloud) && cloud.kind === 'world' && device?.kind === 'intro'
        && sameActions(device.actions, cloud.actions)) {
        ctx.store.commit({deviceSave: {...ctx.state.deviceSave, data: structuredClone(cloud)}});
      }
      return ctx.saves.reconcile();
    },
    dispose() {
      closed = true;
      clear();
      stopPlace?.();
      ctx.document?.removeEventListener?.('visibilitychange', visibility);
    },
  };
}
