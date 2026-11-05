// One owner for place lifetime. Rejected travel leaves the current place untouched.
import { routeTo, places } from './registry.js';
export function createWorld(ctx) {
  let current = null, busy = false, disposed = false, relit = false;
  return {
    get current() { return current; }, get busy() { return busy || !!ctx.isBlocked?.(); },
    get relit() { return relit; },
    canTravel(id) { return !disposed && !!routeTo(current?.id, id, relit); },
    setRelightingComplete(value) { relit = value === true; },
    async goTo(id, options = {}) {
      if (disposed || busy || ctx.isBlocked?.() || !routeTo(current?.id, id, relit) || current?.id === id) return false;
      busy = true;
      const previous = current?.id;
      ctx.emit({ type: 'travel', to: id });
      current?.dispose(); current = null;
      try {
        if (previous && ctx.transition) await ctx.transition(id, options);
        if (disposed) return false;
        const next = await ctx.createPlace(id);
        if (disposed) { next.dispose(); return false; }
        try { ctx.attach?.(next); current = next; }
        catch (error) { next.dispose(); throw error; }
        ctx.emit({ type: 'arrived', place: id }); return true;
      } catch (error) {
        // A failed asset load returns to the departure place when possible.
        if (previous && !disposed) {
          const restored = await ctx.createPlace(previous);
          if (disposed) restored.dispose();
          else {
            try { ctx.attach?.(restored); current = restored; }
            catch (restoreError) { restored.dispose(); throw restoreError; }
          }
        }
        throw error;
      } finally { busy = false; ctx.finishTransition?.(); }
    },
    interact(id) {
      if (busy || disposed || ctx.isBlocked?.() || !current?.zones.some(zone => zone.id === id)) return false;
      ctx.emit({ type: 'interact', id, place: current.id }); return true;
    },
    update(dt, state) { current?.update(dt, state); },
    dispose() { if (disposed) return; disposed = true; ctx.cancelTransition?.(); current?.dispose(); current = null; ctx.disposeVisuals?.(); },
    get name() { return current ? places[current.id].name : 'At sea'; },
  };
}
