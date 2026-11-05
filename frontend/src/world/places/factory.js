// Public place factory. The caller supplies the id and optional test/integration adapters.
import { on, emit } from '../../core/events.js';
import { decorateHome } from './home.js';
import { places } from './registry.js';
import { createLighthousePlace } from './lighthouse.js';
import { createSettlement } from './settlement.js';
export function createPlace(ctx) {
  if (!Object.hasOwn(places, ctx.id)) throw new Error(`Unknown place: ${ctx.id}`);
  const adapters = { on, emit, ...ctx };
  if (ctx.id === 'home_islet') adapters.decorate = (place, art, cleanups) => decorateHome(place, art, cleanups, adapters);
  return ctx.id === 'lighthouse_isle' ? createLighthousePlace(adapters) : createSettlement(adapters);
}
