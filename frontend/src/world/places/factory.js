// Public place factory. The caller supplies the id and optional test/integration adapters.
import { places } from './registry.js';
import { createLighthousePlace } from './lighthouse.js';
import { createSettlement } from './settlement.js';
export function createPlace(ctx) {
  if (!Object.hasOwn(places, ctx.id)) throw new Error(`Unknown place: ${ctx.id}`);
  return ctx.id === 'lighthouse_isle' ? createLighthousePlace(ctx) : createSettlement(ctx);
}
