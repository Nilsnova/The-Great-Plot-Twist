// Cloud saves carry accepted action replays. Unknown writes are reconciled before another choice.
import {validReplay} from './replay.js';
import {mapApiResult} from './reasons.js';
import {placeLabels} from '../../world/places/labels.js';

const SAVE_INTERVAL_MS=60000;
const MAX_SAVE_BYTES=100000;
const validVersion=value=>Number.isInteger(value)&&value>0&&value<=2147483647;
const same=(first,second)=>JSON.stringify(first)===JSON.stringify(second);
export function replaySaveData(source){
  if(!validReplay(source))return null;
  const place=source.kind==='intro'?'lighthouse_isle':source.place;
  if(typeof place!=='string'||!Object.hasOwn(placeLabels,place))return null;
  const data={kind:source.kind,actions:[...source.actions],place};
  return new TextEncoder().encode(JSON.stringify(data)).length<=MAX_SAVE_BYTES?data:null;
}

export function createAccountSaves(ctx){
  const {store,state,session,transport}=ctx;
  let dirty=false,generation=0,lastAttempt=ctx.now(),pending=null,closed=false;
  const current=scope=>!closed&&store.isCurrent(scope)&&session.isSignedIn();
  const expired=()=>ctx.refuse(store.isClosed()||closed?'disposed':'session_expired');

  function saved(data,reply,attempt){
    const cloudSave={version:reply.version,data:structuredClone(data),updatedAt:reply.updatedAt??null};
    if(generation===attempt)dirty=false;
    store.commit({cloudSave,saveState:dirty?'saving':'saved'});
    return ctx.accept('Your progress is saved in the cloud.');
  }
  function conflict(){
    store.commit({saveState:'conflict'});
    return ctx.refuse('save_conflict');
  }
  async function readLatest(scope){
    const result=await transport.read('save');
    if(!current(scope))return {mapped:expired()};
    return result;
  }
  async function write({readFirst=false,allowConflict=false}={}){
    if(closed||store.isClosed())return expired();
    if(!session.isSignedIn()){
      store.commit({saveState:state.deviceSave?'offline':'idle'});
      return ctx.refuse('sign_in_required');
    }
    if(state.saveState==='conflict'&&!allowConflict)return ctx.refuse('save_conflict');
    const data=replaySaveData(state.deviceSave?.data);
    if(!data)return ctx.refuse('save_unavailable');
    const scope=store.scope(),attempt=generation;
    if(readFirst||!validVersion(state.cloudSave?.version)){
      const result=await readLatest(scope);
      if(!current(scope))return expired();
      if(!result.mapped.accepted){store.commit({saveState:'offline'});return result.mapped;}
    }
    const version=state.cloudSave?.version;
    if(!validVersion(version)||version===2147483647)return ctx.refuse('save_unavailable');
    lastAttempt=ctx.now();store.commit({saveState:'saving'});
    let reply;
    try{reply=await ctx.api.put('/api/save',{version,data});}
    catch{reply={ok:false,status:0};}
    if(!current(scope))return expired();
    const mapped=mapApiResult(reply,{route:'/api/save',method:'PUT'});
    if(reply.ok&&mapped.accepted){
      if(!validVersion(reply.data?.version)||reply.data.version!==version+1){
        store.commit({saveState:'offline'});return ctx.refuse('invalid_request');
      }
      return saved(data,reply.data,attempt);
    }
    if(mapped.recovery==='unknown_outcome'||mapped.reason==='save_conflict'){
      const recovered=await readLatest(scope);
      if(!current(scope))return expired();
      if(mapped.recovery==='unknown_outcome'&&recovered.mapped.accepted
        &&same(replaySaveData(state.cloudSave?.data),data)){
        return saved(data,state.cloudSave,attempt);
      }
      return conflict();
    }
    store.commit({saveState:'offline'});
    return mapped;
  }
  function flush(options){
    if(pending)return pending;
    pending=write(options).finally(()=>{pending=null;});
    return pending;
  }
  async function stageReplay(source,{immediate=false}={}){
    const data=replaySaveData(source);
    if(!data)return ctx.refuse('save_unavailable');
    if(closed||store.isClosed())return expired();
    if(!same(data,replaySaveData(state.deviceSave?.data))){
      dirty=true;generation++;
      store.commit({deviceSave:{data,updatedAt:new Date(ctx.now()).toISOString()}});
    }
    if(!immediate||!dirty)return ctx.accept('Your progress on this device is kept.');
    const result=await flush();
    if(result.accepted&&dirty)return flush();
    return result;
  }
  async function resolve(choice){
    if(!['keep_this_device','use_cloud'].includes(choice))return ctx.refuse('unsupported_choice');
    if(choice==='keep_this_device')return flush({readFirst:true,allowConflict:true});
    const scope=store.scope(),result=await readLatest(scope);
    if(!current(scope))return expired();
    if(!result.mapped.accepted)return result.mapped;
    const data=replaySaveData(state.cloudSave?.data);
    if(!data)return ctx.refuse('save_unavailable');
    generation++;dirty=false;
    store.commit({deviceSave:{data:structuredClone(data),updatedAt:state.cloudSave.updatedAt??null},
      saveState:'saved',continuation:{source:'cloud',...data}});
    ctx.writeDeviceReplay?.(data);
    return ctx.accept('Your cloud progress is ready to continue.');
  }
  function reconcile(){
    const device=replaySaveData(state.deviceSave?.data),cloud=replaySaveData(state.cloudSave?.data);
    if(device&&cloud&&!same(device,cloud))return conflict();
    if(device&&cloud){dirty=false;store.commit({saveState:'saved'});}
    return ctx.accept('Your saved progress is ready.');
  }
  return {stageReplay,flush,resolve,reconcile,
    clearDevice(){
      generation++;dirty=false;
      store.commit({deviceSave:null,saveState:'idle'});
    },
    tick(){
      if(!closed&&dirty&&session.isSignedIn()&&state.saveState!=='conflict'
        &&ctx.now()-lastAttempt>=SAVE_INTERVAL_MS)return flush();
      return Promise.resolve(ctx.accept(''));
    },
    dispose(){closed=true;dirty=false;generation++;},
  };
}
