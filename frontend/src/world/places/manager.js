// One owner for place lifetime. Rejected travel leaves the current place untouched.
import { canTravel, places } from './registry.js';
export function createWorld(ctx) {
  let current = null, busy = false, disposed = false, relit = false;
  return {
    get current() { return current; }, get busy() { return busy; },
    get relit() { return relit; },
    canTravel(id) { return !disposed && canTravel(id, relit); },
    setRelightingComplete(value) { relit = value === true; },
    async goTo(id, options = {}) {
      if (disposed || busy || !canTravel(id, relit) || current?.id === id) return false;
      busy = true;
      const previous = current?.id;
      ctx.emit({ type: 'travel', to: id });
      current?.dispose(); current = null;
      try {
        if (previous && ctx.transition) await ctx.transition(id, options);
        if (disposed) return false;
        const next = await ctx.createPlace(id);
        if (disposed) { next.dispose(); return false; }
        current = next; ctx.attach?.(next);
        ctx.emit({ type: 'arrived', place: id }); return true;
      } catch (error) {
        // A failed asset load returns to the departure place when possible.
        if (previous && !disposed) {
          const restored = await ctx.createPlace(previous);
          if (disposed) restored.dispose();
          else { current = restored; ctx.attach?.(restored); }
        }
        throw error;
      } finally { busy = false; }
    },
    interact(id) {
      if (busy || disposed || !current?.zones.some(zone => zone.id === id)) return false;
      ctx.emit({ type: 'interact', id, place: current.id }); return true;
    },
    update(dt, state) { current?.update(dt, state); },
    dispose() { if (disposed) return; disposed = true; ctx.cancelTransition?.(); current?.dispose(); current = null; },
    get name() { return current ? places[current.id].name : 'At sea'; },
  };
}
