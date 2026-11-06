// Config refresh and read backoff run off the render loop, and stop while the page is hidden.
import {createRefreshSchedule} from './schedule.js';

export function createAdapterPolling(ctx) {
  const schedule = createRefreshSchedule({now: ctx.now, random: ctx.random});
  const document = ctx.document;
  const window = ctx.window;
  let timer = null;
  let reading = false;
  function clear() { if (timer !== null) clearTimeout(timer); timer = null; }
  function arm() {
    clear();
    if (ctx.store.isClosed() || document?.hidden) return;
    const delay = Math.max(50, schedule.remaining('config'));
    timer = setTimeout(refresh, delay);
    timer?.unref?.();
  }
  async function refresh() {
    if (reading || ctx.store.isClosed() || document?.hidden) return;
    reading = true;
    try {
      const result = await ctx.transport.read('config');
      schedule.mark('config', {ok: result.mapped.accepted});
      if (result.mapped.accepted) await ctx.onConfigReady?.();
    } finally { reading = false; arm(); }
  }
  function visibility() {
    schedule.setHidden(Boolean(document?.hidden));
    if (document?.hidden) clear(); else arm();
  }
  document?.addEventListener?.('visibilitychange', visibility);
  window?.addEventListener?.('focus', refresh);
  return {
    async start() { await refresh(); },
    dispose() {
      clear();
      document?.removeEventListener?.('visibilitychange', visibility);
      window?.removeEventListener?.('focus', refresh);
    },
  };
}
