// Public place factory. The caller supplies the id and optional test/integration adapters.
import { on, emit } from '../../core/events.js';
import { places } from './registry.js';
import { createLighthousePlace } from './lighthouse.js';
export async function createPlace(ctx) {
  if (!Object.hasOwn(places, ctx.id)) throw new Error(`Unknown place: ${ctx.id}`);
  const adapters = { on, emit, ...ctx };
  if(ctx.id==='lighthouse_isle')return createLighthousePlace(adapters);
  if(ctx.id==='gulls_rest'){const {createGullsRest}=await import('./gulls-rest.js');return createGullsRest(adapters);}
  const {createSettlement}=await import('./settlement.js');
  if (ctx.id === 'home_islet') {const {decorateHome}=await import('./home.js');adapters.decorate = (place, art, cleanups) => decorateHome(place, art, cleanups, adapters);}
  return createSettlement(adapters);
}
