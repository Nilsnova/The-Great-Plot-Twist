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
  // The adapter opts into this barrier before each identity's initial cloud reconciliation.
  let identity=0,requiresReconcile=false,reconciledScope=null;
  const current=(scope,owner=identity)=>!closed&&owner===identity&&store.isCurrent(scope)&&session.isSignedIn();
  const ready=()=>!requiresReconcile||reconciledScope===store.scope();
  const expired=()=>ctx.refuse(store.isClosed()||closed?'disposed':'session_expired');

  function saved(data,reply,attempt){
    const cloudSave={version:reply.version,data:structuredClone(data),updatedAt:reply.updatedAt??null};
    if(generation===attempt)dirty=false;
    reconciledScope=store.scope();
    store.commit({cloudSave,saveState:dirty?'saving':'saved'});
    return ctx.accept('Your progress is saved in the cloud.');
  }
  function conflict(){
    store.commit({saveState:'conflict'});
    return ctx.refuse('save_conflict');
  }
  async function readLatest(scope,owner=identity){
    const result=await transport.read('save');
    if(!current(scope,owner))return {mapped:expired()};
    return result;
  }
  async function write({readFirst=false,allowConflict=false}={}){
    if(closed||store.isClosed())return expired();
    if(!session.isSignedIn()){
      store.commit({saveState:state.deviceSave?'offline':'idle'});
      return ctx.refuse('sign_in_required');
    }
    if(state.saveState==='conflict'&&!allowConflict)return ctx.refuse('save_conflict');
    if(!ready())return allowConflict?ctx.refuse('not_ready'):ctx.accept('Your progress on this device is kept.');
    const data=replaySaveData(state.deviceSave?.data);
    if(!data)return ctx.refuse('save_unavailable');
    const scope=store.scope(),owner=identity,attempt=generation;
    if(readFirst||!validVersion(state.cloudSave?.version)){
      const result=await readLatest(scope,owner);
      if(!current(scope,owner))return expired();
      if(!result.mapped.accepted){store.commit({saveState:'offline'});return result.mapped;}
    }
    if(!ready())return allowConflict?ctx.refuse('not_ready'):ctx.accept('Your progress on this device is kept.');
    if(state.saveState==='conflict'&&!allowConflict)return ctx.refuse('save_conflict');
    const version=state.cloudSave?.version;
    if(!validVersion(version)||version===2147483647)return ctx.refuse('save_unavailable');
    lastAttempt=ctx.now();store.commit({saveState:'saving'});
    let reply;
    try{reply=await ctx.api.put('/api/save',{version,data});}
    catch{reply={ok:false,status:0};}
    if(!current(scope,owner))return expired();
    const mapped=mapApiResult(reply,{route:'/api/save',method:'PUT'});
    if(reply.ok&&mapped.accepted){
      if(!validVersion(reply.data?.version)||reply.data.version!==version+1){
        store.commit({saveState:'offline'});return ctx.refuse('invalid_request');
      }
      return saved(data,reply.data,attempt);
    }
    if(mapped.recovery==='unknown_outcome'||mapped.reason==='save_conflict'){
      const recovered=await readLatest(scope,owner);
      if(!current(scope,owner))return expired();
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
    if(pending?.scope===store.scope()&&pending.identity===identity)return pending.promise;
    const task={scope:store.scope(),identity,promise:null};
    task.promise=write(options).finally(()=>{if(pending===task)pending=null;});
    pending=task;
    return task.promise;
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
    if(result.accepted&&dirty&&ready())return flush();
    return result;
  }
  async function resolve(choice){
    if(!['keep_this_device','use_cloud'].includes(choice))return ctx.refuse('unsupported_choice');
    if(!ready())return ctx.refuse('not_ready');
    if(choice==='keep_this_device')return flush({readFirst:true,allowConflict:true});
    const scope=store.scope(),owner=identity,result=await readLatest(scope,owner);
    if(!current(scope,owner))return expired();
    if(!result.mapped.accepted)return result.mapped;
    const data=replaySaveData(state.cloudSave?.data);
    if(!data)return ctx.refuse('save_unavailable');
    generation++;dirty=false;
    reconciledScope=scope;
    store.commit({deviceSave:{data:structuredClone(data),updatedAt:state.cloudSave.updatedAt??null},
      saveState:'saved',continuation:{source:'cloud',...data}});
    ctx.writeDeviceReplay?.(data);
    return ctx.accept('Your cloud progress is ready to continue.');
  }
  function reconcile(){
    if(!current(store.scope())||!validVersion(state.cloudSave?.version))return ctx.refuse('not_ready');
    const device=replaySaveData(state.deviceSave?.data),cloud=replaySaveData(state.cloudSave?.data);
    reconciledScope=store.scope();
    if(device&&cloud&&!same(device,cloud))return conflict();
    if(device&&cloud){dirty=false;store.commit({saveState:'saved'});}
    return ctx.accept('Your saved progress is ready.');
  }
  return {stageReplay,flush,resolve,reconcile,
    pauseIdentity(){
      requiresReconcile=true;reconciledScope=null;identity++;pending=null;
    },
    clearDevice(){
      generation++;dirty=false;
      store.commit({deviceSave:null,saveState:'idle'});
    },
    tick(){
      if(!closed&&dirty&&ready()&&session.isSignedIn()&&state.saveState!=='conflict'
        &&ctx.now()-lastAttempt>=SAVE_INTERVAL_MS)return flush();
      return Promise.resolve(ctx.accept(''));
    },
    dispose(){closed=true;dirty=false;generation++;identity++;pending=null;},
  };
}
