// One owner for place lifetime. Rejected travel leaves the current place untouched.
import { routeTo, places } from './registry.js';
export function createWorld(ctx) {
  let current = null, busy = false, disposed = false, relit = false;
  const idleWaiters=new Set(),wakeIdle=()=>{for(const resolve of idleWaiters)resolve();idleWaiters.clear();};
  return {
    get current() { return current; }, get busy() { return busy || !!ctx.isBlocked?.(); },
    whenIdle(){return busy&&!disposed?new Promise(resolve=>idleWaiters.add(resolve)):Promise.resolve();},
    get relit() { return relit; },
    canTravel(id) { return !disposed && !!routeTo(current?.id, id, relit); },
    setRelightingComplete(value) { relit = value === true; },
    // Keep a single active place and restore the departure scene if loading the destination fails.
    async goTo(id, options = {}) {
      if (disposed || busy || ctx.isBlocked?.()) return false;
      const routeExists = routeTo(current?.id, id, relit);
      if (!routeExists || current?.id === id) return false;
      busy = true;
      const previousPlaceId = current?.id;
      ctx.emit({ type: 'travel', to: id });
      current?.dispose();
      current = null;
      try {
        if (previousPlaceId && ctx.transition) await ctx.transition(id, options);
        if (disposed) return false;
        const next = await ctx.createPlace(id);
        if (disposed) { next.dispose(); return false; }
        try {
          ctx.attach?.(next);
          current = next;
        } catch (error) {
          next.dispose();
          throw error;
        }
        ctx.emit({ type: 'arrived', place: id });
        return true;
      } catch (error) {
        // A failed asset load returns to the departure place when possible.
        if (previousPlaceId && !disposed) {
          const restored = await ctx.createPlace(previousPlaceId);
          if (disposed) restored.dispose();
          else {
            try {
              ctx.attach?.(restored);
              current = restored;
            } catch (restoreError) {
              restored.dispose();
              throw restoreError;
            }
          }
        }
        throw error;
      } finally {
        busy = false;
        try {
          ctx.finishTransition?.();
        } finally {
          wakeIdle();
        }
      }
    },
    // Reject stale hotspot hits so interactions never target a place left during travel.
    interact(id) {
      if (busy || disposed || ctx.isBlocked?.() || !current?.zones.some(zone => zone.id === id)) return false;
      ctx.emit({ type: 'interact', id, place: current.id });
      return true;
    },
    update(dt, state) { current?.update(dt, state); },
    dispose() { if (disposed) return; disposed = true; wakeIdle();ctx.cancelTransition?.(); current?.dispose(); current = null; ctx.disposeVisuals?.(); },
    get name() { return current ? places[current.id].name : 'At sea'; },
  };
}
