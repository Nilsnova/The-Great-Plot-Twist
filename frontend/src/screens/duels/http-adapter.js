// Duel HTTP ownership: authoritative reads, guarded intents and safe same-account waits across ordinary hiding.
import { createClient, duelPath } from './http-client.js';
import { createDuelCooldown, createIntents } from './http-intents.js';
import { createPoller } from './poll.js';
import { createViewStore } from './view-store.js';
import { decidedMessage, messageFor } from './messages.js';
import { otherCaptainName } from './logic.js';
import {validDuelList,validDuelDetail} from './http-shapes.js';

const PASSING_NOTICES = ['retrying', 'too_many_requests']; // failures that a good list read clears

export function createHttpAdapter({ fetchImpl = globalThis.fetch, getToken = () => null, now = Date.now,
  request, getFlags, getIdentity, onIdentityChange } = {}) {
  const dataStore = createViewStore({ mode: 'loading' });
  const cooldown = createDuelCooldown(dataStore, now), {store, waiting} = cooldown;
  const identity=()=>{try{return getIdentity?getIdentity():getToken();}catch{return null;}};
  const enabled=()=>{try{return !getFlags||getFlags()?.arena===true;}catch{return false;}};
  let owner=identity(),epoch=0,disposed=false,visible=false;
  const client = createClient({ fetchImpl, getToken, request, getIdentity:identity, canUse:enabled });
  const poller = createPoller({ ask, now, onMode: polling => store.set({ polling }) });
  const intents = createIntents({ client, store, poller, loadDetail, begin, current, blocked });
  let flagChecked = false;
  function syncIdentity(){
    const next=identity();if(next===owner)return;
    owner=next;epoch++;flagChecked=false;cooldown.clear();client.invalidate();intents.reset();store.reset(owner===null?'signed_out':'loading');
  }
  function begin(){syncIdentity();return epoch;}
  function current(ticket){syncIdentity();return !disposed&&visible&&ticket===epoch;}
  const stale=()=>({ok:false,code:'unauthorized',message:messageFor('unauthorized'),view:store.read()});
  const blockedReply=code=>({ok:false,code,message:messageFor(code),view:store.read()});
  const stopIdentity=onIdentityChange?.(()=>{if(disposed)return;syncIdentity();if(owner!==null&&visible)void poller.kick();});

  const closed = () => {
    cooldown.clear();intents.reset();store.reset('closed');
    store.notify('feature_off');
    return { halt: true };
  };
  const signedOut = () => {
    cooldown.clear();intents.reset();store.reset('signed_out');
    store.notify('unauthorized');
    return { halt: true };
  };
  function blocked() {
    if(!enabled()){closed();return 'feature_off';}
    return waiting()?'too_many_requests':null;
  }

  // A poll failed: keep the last view, say so, and let the poller wait longer.
  function pollFailed(answer) {
    if (answer.status === 429) {
      store.notify('too_many_requests',{status:429,retryAfterSeconds:answer.retryAfterMs/1000});
      return { retryAfterMs: answer.retryAfterMs };
    }
    if (store.read().mode === 'loading') store.set({ mode: 'unavailable' });
    store.notify('retrying',{status:answer.status});
    return { failed: true };
  }

  async function loadDetail(duelId,ticket=begin()) {
    if(!current(ticket))return {ok:false,stale:true};
    const answer = await client.send('GET', duelPath(duelId));
    if(!current(ticket)||answer.stale)return {...answer,ok:false,stale:true};
    if(!enabled()){closed();return {ok:false,status:404,code:'feature_off'};}
    if(answer.ok&&!validDuelDetail(answer.data))return {ok:false,status:200,code:'bad_answer'};
    if (answer.ok) store.showDetail(answer.data.duel);
    return answer;
  }

  // A challenge this player waited on is decided: fetch its reveal and tell them.
  async function loadDecided(summary,ticket) {
    const answer = await loadDetail(summary.id,ticket);
    if (!answer.ok||disposed) return;
    const name = otherCaptainName(summary) ?? 'the other captain';
    store.notify('decided', { message: decidedMessage(name), duelId: summary.id });
  }

  async function takeList(data,ticket) {
    store.clearNotice(PASSING_NOTICES);
    const { changed, decided } = store.applyList(data, { nowMs: now(), mode: 'ready' });
    store.set({canRetry:intents.hasPending()});
    for (const summary of decided){if(!current(ticket))break;await loadDecided(summary,ticket);}
    return { changed };
  }

  // One poll: the flag once per opening, then the list. The poller reads the result.
  async function ask() {
    const ticket=begin();if(disposed)return {halt:true};
    if(!enabled())return closed();
    if (!flagChecked) {
      const config = await client.send('GET', '/api/config', { auth: false });
      if(!current(ticket))return {halt:true};
      if (!config.ok) return pollFailed(config);
      flagChecked = true;
      if (config.data?.flags?.arena!==true) return closed();
    }
    const answer = await client.send('GET', '/api/duels');
    if(!current(ticket)||answer.stale)return {halt:true};
    if(!enabled())return closed();
    if(answer.ok&&!validDuelList(answer.data))return pollFailed({status:200,code:'bad_answer'});
    if (answer.ok) return takeList(answer.data,ticket);
    if (answer.status === 401) return signedOut();
    if (answer.code === 'feature_off') return closed();
    return pollFailed(answer);
  }

  async function select(duelId) {
    const ticket=begin();if(disposed)return stale();
    const denial=blocked();if(denial)return blockedReply(denial);
    store.clearNotice();
    const answer = await loadDetail(duelId);
    if(!current(ticket)||answer.stale)return stale();
    if (answer.ok) return { ok: true, view: store.read() };
    store.notify(answer.code,{status:answer.status,retryAfterSeconds:answer.retryAfterMs/1000});
    return { ok: false, code: answer.code, message: messageFor(answer.code), view: store.read() };
  }

  async function refresh() {
    const ticket=begin();if(disposed)return stale();
    const denial=blocked();if(denial)return blockedReply(denial);
    await poller.kick();
    return current(ticket)?{ ok: true, view: store.read() }:stale();
  }

  return {
    read(){syncIdentity();return store.read();},
    subscribe: store.subscribe,
    refresh,
    challenge: args => intents.perform('challenge', args),
    answer: (duelId, signals) => intents.perform('answer', { duelId, signals }),
    cancel: duelId => intents.perform('cancel', { duelId }),
    select,
    retry: () => {syncIdentity();return intents.retry() ?? refresh();},
    setVisible(isVisible) {
      if(disposed)return Promise.resolve();syncIdentity();
      if(visible&&!isVisible){
        epoch++;client.invalidate();intents.pause();store.reset('loading');
        cooldown.restore();
      }
      visible=Boolean(isVisible);
      if (isVisible) flagChecked = false; // /api/config is read once per opening
      return poller.setVisible(isVisible);
    },
    dispose() {
      if(disposed)return;disposed=true;epoch++;visible=false;cooldown.clear();stopIdentity?.();intents.reset();client.dispose();
      poller.dispose();
      store.dispose();
    },
  };
}
