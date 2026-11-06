// Config refresh and read backoff run off the render loop, and stop while the page is hidden.
import {createRefreshSchedule} from './schedule.js';

export function createAdapterPolling(ctx) {
  const schedule = createRefreshSchedule({now: ctx.now, random: ctx.random});
  const document = ctx.document;
  const window = ctx.window;
  let timer = null;
  let reading = false;
  let failed = false;
  function clear() { if (timer !== null) clearTimeout(timer); timer = null; }
  function arm() {
    clear();
    if (ctx.store.isClosed() || document?.hidden) return;
    const delay = Math.max(50, schedule.remaining('config'));
    if (!Number.isFinite(delay)) return;
    timer = setTimeout(refresh, delay);
    timer?.unref?.();
  }
  async function refresh({manual = false} = {}) {
    if (reading || ctx.store.isClosed() || document?.hidden) return;
    if (!manual && !Number.isFinite(schedule.remaining('config'))) return;
    if (!manual && failed && schedule.remaining('config') > 0) return;
    if (manual) schedule.reset('config');
    reading = true;
    try {
      const result = await ctx.transport.read('config', {automatic: !manual});
      failed = !result.mapped.accepted;
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
    refresh,
    async start() { await refresh(); },
    dispose() {
      clear();
      document?.removeEventListener?.('visibilitychange', visibility);
      window?.removeEventListener?.('focus', refresh);
    },
  };
}
