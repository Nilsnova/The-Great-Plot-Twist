// Crew intents use server snapshots; the first join tap only previews normalized code shape.
import {normalizeCrewCode} from './validate.js';
import {validCrew} from './read-shapes.js';
export function createCrewHandlers(ctx) {
  async function change(route, body) {
    const result = await ctx.transport.change({route, body, kind: 'crew'});
    if (result.reply?.ok && result.mapped.accepted) {
      if (!validCrew(result.reply.data)) return ctx.refuse('invalid_request');
      ctx.store.commit({crew: result.reply.data.crew, joinPreview: null});
    }
    if (result.mapped.accepted) await ctx.transport.read('crew');
    return result.mapped;
  }
  return {
    createCrew: () => change('/api/crews'),
    muster: () => change('/api/crews/me/start'),
    async joinCrew(code, {confirm = false} = {}) {
      const normalized = normalizeCrewCode(code);
      if (confirm !== true) {
        ctx.store.commit({joinPreview: {code: normalized,
          message: 'Check this crew code, then confirm joining.'}});
        return ctx.accept('Confirm this code to ask the server to join.');
      }
      return change('/api/crews/join', {code: normalized});
    },
  };
}
