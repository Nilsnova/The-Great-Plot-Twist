// Crew intents use server snapshots; the first join tap only previews normalized code shape.
import {normalizeCrewCode} from './validate.js';
import {validCrew} from './read-shapes.js';
export function createCrewHandlers(ctx) {
  const current=scope=>ctx.store.isCurrent(scope)&&ctx.session.isSignedIn();
  const expired=()=>ctx.refuse(ctx.store.isClosed()?'disposed':'session_expired');
  function preview(code){
    ctx.store.commit({joinPreview:{code,seat:null,replaces:null,
      message:'Check this crew code, then confirm joining.'}});
    return ctx.accept('Confirm this code to ask the server to join.');
  }
  async function change(route, body) {
    const scope=ctx.store.scope();
    const result = await ctx.transport.change({route, body, kind: 'crew'});
    if(!current(scope))return expired();
    let updated=false;
    if (result.reply?.ok && result.mapped.accepted) {
      if (!validCrew(result.reply.data)) return ctx.refuse('invalid_request');
      ctx.store.commit({crew: result.reply.data.crew, joinPreview: null});
      updated=true;
    }
    if (result.mapped.accepted||['crew_finished','crew_busy'].includes(result.reply?.code)) {
      const fresh=await ctx.transport.read('crew', {fresh:true});
      if(!current(scope))return expired();
      updated=updated||fresh.mapped.accepted;
      if(result.mapped.accepted)ctx.store.commit({joinPreview:null});
    }
    if(updated){
      try{await ctx.onCrewChanged?.();}catch{/* The authoritative crew result survives an unavailable observer. */}
      if(!current(scope))return expired();
    }
    return result.mapped;
  }
  return {
    createCrew: () => change('/api/crews'),
    muster: () => change('/api/crews/me/start'),
    async joinCrew(code, {confirm = false} = {}) {
      const normalized = normalizeCrewCode(code);
      if(!normalized||typeof confirm!=='boolean')return ctx.refuse('invalid_request');
      if(confirm!==true||ctx.state.joinPreview?.code!==normalized)return preview(normalized);
      return change('/api/crews/join', {code: normalized});
    },
  };
}
