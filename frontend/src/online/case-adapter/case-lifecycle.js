// Authenticated earned views and anonymous world state share one bounded refresh owner.
import {createRefreshSchedule} from './schedule.js';
import {mapApiResult} from './reasons.js';
import {validateCase,validateWorld} from './case-shapes.js';
import {createCaseIntents} from './case-intents.js';
import {createCaseEffects} from './case-effects.js';
import {createUidFactory} from './uid.js';

export function createCaseLifecycle(ctx,deps={}) {
  const {store,state,session,document}=ctx;
  const setTimer=deps.setTimer??globalThis.setTimeout,clearTimer=deps.clearTimer??globalThis.clearTimeout;
  const schedule=createRefreshSchedule({now:ctx.now,random:ctx.random});
  const effects=createCaseEffects(),uid=createUidFactory({now:ctx.now,random:ctx.random});
  const pending=new Map(),tasks=new Map(),sequences=new Map(),failures={case:0,world:0},retryAt={case:0,world:0};
  let generation=0,worldGeneration=0,owner=null,enabled=false,disposed=false,timer=null,lastTick=-1,walletHint=null;
  const demo=()=>typeof deps.isDemo==='function'?deps.isDemo():new URLSearchParams(ctx.window?.location?.search??'').get('demo')==='1';
  const permitted=()=>!disposed&&!store.isClosed()&&!demo()&&state.config?.flags?.case===true;
  const scope=()=>permitted()&&session.isSignedIn()&&state.accountState==='signed_in'&&state.me&&state.crew?.id
    ?`${store.scope()}:${state.crew.id}:${state.crew.status==='forming'?'forming':state.crew.startedAt??'started'}`:null;
  const capture=()=>({owner:scope(),generation});
  const current=token=>token?.owner!==null&&token?.owner===scope()&&token.generation===generation&&!document?.hidden;
  function publishEffects() {return effects.update(state.case,{scope:owner,world:state.worldSnapshot??null});}
  function applyCase(value) {
    // A response for another crew is never a grant to replace our own membership.
    if(value&&value.crew.id!==state.crew?.id)return false;
    if(value&&state.case?.caseId===value.caseId&&value.writeRevision<state.case.writeRevision)return false;
    if(value&&state.case?.caseId===value.caseId&&value.writeRevision===state.case.writeRevision&&value.now<state.case.now)return false;
    const changed=state.case?.caseId!==value?.caseId;
    state.case=value;
    store.commit({case:value,caseLoaded:true,caseReceivedAt:ctx.now(),caseElapsed:0,
      ...(changed?{casePresentation:{activeSpot:null,aboard:false,revealIndex:0}}:{}),effects:publishEffects()});
    // A changed balance is a read hint, never a local wallet grant.
    if(value&&value.me.coins!==state.me?.coins&&walletHint!==value.me.coins){
      walletHint=value.me.coins;void ctx.transport.read('me',{fresh:true});void ctx.refreshRewards?.();
    }
    requestBoundary(value);return true;
  }
  function requestBoundary(value) {
    if(!value)return;
    const remaining=[];
    const walk=item=>{
      if(!item||typeof item!=='object')return;
      for(const [key,child] of Object.entries(item)) {
        if(['remaining','dawnRemaining','pairWait','cooldown'].includes(key)&&Number.isFinite(child)&&child>0)remaining.push(child);
        else if(child&&typeof child==='object')walk(child);
      }
    };
    walk(value);
    if(remaining.length)schedule.requestCase({remainingSeconds:Math.min(...remaining)});
  }
  async function read(kind,{fresh=false,apply=true}={}) {
    const privateRead=kind==='case';
    if(!permitted()||document?.hidden||(privateRead&&!scope()))return {ok:false,status:404,code:'feature_off'};
    if(ctx.now()<retryAt[kind])return {ok:false,status:429,retryAfterSeconds:Math.ceil((retryAt[kind]-ctx.now())/1000)};
    const token=privateRead?capture():worldGeneration,key=`${kind}:${privateRead?`${token.owner}:${token.generation}`:token}`;
    if(!fresh&&tasks.has(key))return tasks.get(key);
    const sequence=(sequences.get(key)??0)+1;sequences.set(key,sequence);
    const valid=()=>sequences.get(key)===sequence&&permitted()&&!document?.hidden
      &&(privateRead?current(token):token===worldGeneration);
    const finish=ctx.readMonitor.begin(kind,{automatic:true,automaticRetry:false,retry:()=>{failures[kind]=0;return read(kind,{fresh:true});}});
    const task=(async()=>{
      let reply;
      try {reply=await(privateRead?ctx.api:ctx.publicApi).get(`/api/${kind}`);}catch{reply={ok:false,status:0};}
      if(!valid()){finish.cancel();return {ok:false,status:0,stale:true};}
      const parsed=reply.ok?(privateRead
        ?Object.hasOwn(reply.data??{},'case')?validateCase(reply.data.case):{ok:false}
        :validateWorld(reply.data)):{ok:false};
      if(reply.ok&&(!parsed.ok||(!privateRead&&parsed.value===null)
        ||(privateRead&&parsed.value&&parsed.value.crew.id!==state.crew?.id)))reply={ok:false,status:502,code:'database_error'};
      const mapped=mapApiResult(reply,{method:'GET',route:`/api/${kind}`,publicRead:!privateRead});
      schedule.mark(kind,{ok:mapped.accepted});
      failures[kind]=mapped.accepted?0:Math.min(4,failures[kind]+1);
      if(reply.status===429&&Number.isFinite(reply.retryAfterSeconds)&&reply.retryAfterSeconds>=0&&reply.retryAfterSeconds<=86400)
        retryAt[kind]=ctx.now()+Math.ceil(reply.retryAfterSeconds)*1000;
      if(mapped.accepted) {
        if(privateRead){if(apply)applyCase(parsed.value);}
        else {state.worldSnapshot=parsed.value;store.commit({worldSnapshot:parsed.value,effects:publishEffects()});}
      }else if(reply.status===404) {
        if(privateRead){if(apply)applyCase(null);}
        else store.commit({worldSnapshot:null,effects:[]});
      }
      if(!mapped.accepted)store.commit({notice:{reason:mapped.reason,message:mapped.message}});
      if(reply.status===404&&!privateRead)finish.cancel();else finish({status:reply.status,mapped});
      return reply;
    })().finally(()=>{if(tasks.get(key)===task)tasks.delete(key);arm();});
    tasks.set(key,task);return task;
  }
  const intents=createCaseIntents({api:ctx.api,getScope:scope,capture,isCurrent:current,
    validateCase:raw=>{const result=validateCase(raw);return result.ok&&result.value&&result.value.crew.id!==state.crew?.id?{ok:false}:result;},
    applyCase,readCase:options=>read('case',{...options,apply:false}),now:ctx.now});
  function clearTimerOwner(){if(timer!==null)clearTimer(timer);timer=null;}
  function arm() {
    clearTimerOwner();if(!permitted()||document?.hidden)return;
    schedule.configure({realtime:state.presence?.status==='live'});
    const delay=Math.min(failures.world<4?Math.max(schedule.remaining('world'),retryAt.world-ctx.now()):Infinity,
      scope()&&failures.case<4?Math.max(schedule.remaining('case'),retryAt.case-ctx.now()):Infinity);
    if(!Number.isFinite(delay))return;
    timer=setTimer(()=>{timer=null;void refresh();},Math.max(50,delay));timer?.unref?.();
  }
  function synchronize() {
    const nextEnabled=permitted(),nextOwner=scope();
    if(enabled!==nextEnabled){enabled=nextEnabled;worldGeneration+=1;schedule.reset('world');failures.world=0;retryAt.world=0;}
    if(owner!==nextOwner){owner=nextOwner;generation+=1;intents.reset();pending.clear();effects.reset();walletHint=null;schedule.reset('case');failures.case=0;retryAt.case=0;
      store.commit({case:null,caseLoaded:false,caseElapsed:0,casePresentation:{activeSpot:null,aboard:false,revealIndex:0},effects:[]});}
    if(!nextEnabled){worldGeneration+=1;store.commit({worldSnapshot:null,effects:[]});
      ctx.readMonitor.clearRead('case');ctx.readMonitor.clearRead('world');}
  }
  async function refresh({version}={}) {
    if(disposed||store.isClosed())return;
    synchronize();schedule.setHidden(Boolean(document?.hidden));
    if(!permitted()||document?.hidden){clearTimerOwner();return;}
    if(Number.isSafeInteger(version))schedule.requestCase({version,writeRevision:state.case?.writeRevision??-1});
    const reads=[];
    if(failures.world<4&&schedule.due('world'))reads.push(read('world'));
    if(scope()&&failures.case<4&&schedule.due('case'))reads.push(read('case'));
    await Promise.all(reads);arm();
  }
  async function send(name,body) {
    synchronize();if(!permitted())return ctx.refuse('feature_off');
    if(!scope())return ctx.refuse('crew_required');
    if(document?.hidden)return ctx.refuse('not_ready');
    const key=`${name}:${JSON.stringify(body)}`,previous=pending.get(key),actionUid=previous??uid();
    // Hold before yielding so rapid activation joins the same in-flight attempt.
    pending.set(key,actionUid);
    const token=capture();
    const result=previous?await intents.retry(actionUid):await intents.send(name,{...body,actionUid});
    if(!current(token))return ctx.refuse(store.isClosed()?'disposed':!session.isSignedIn()?'session_expired':'not_ready');
    if(!result.uncertain&&!result.needsRetry&&!result.stale&&result.mapped?.reason!=='rate_limited'){
      pending.delete(key);intents.release(actionUid);
    }
    if(result.mapped?.accepted||result.uncertain){
      // The server remains the wallet authority, including paid searches and solve shares.
      void ctx.transport.read('me',{fresh:true});
      void ctx.refreshRewards?.();
      if(name==='accuse'&&result.mapped?.accepted)void read('world',{fresh:true});
    }
    arm();return result.mapped??ctx.refuse('internal_error');
  }
  function local(name,value) {
    synchronize();if(!permitted())return ctx.refuse('feature_off');
    if(!scope()||!state.case)return ctx.refuse('crew_required');
    const model=state.case,presentation={...(state.casePresentation??{})};
    if(name==='inspectSpot') {
      const spots=model.search.spots,exact=spots.find(spot=>spot.hotspot===value);
      const matches=spots.filter(spot=>spot.hotspot.endsWith(`.${value}`));
      const spot=exact??(matches.length===1?matches[0]:null);
      if(!spot)return ctx.refuse('unknown_spot');
      presentation.activeSpot=spot.hotspot;
    }else if(name==='boardSchooner') {
      if(!model.accusation.schoonerFound)return ctx.refuse('schooner_required');
      presentation.aboard=true;
    }else {
      if(!model.reveal.available)return ctx.refuse('not_ready');
      presentation.revealIndex=Math.min(model.reveal.lines.length,(presentation.revealIndex??0)+1);
    }
    store.commit({casePresentation:presentation});return ctx.accept();
  }
  const previousCrewRead=ctx.onCrewRead;
  ctx.onCrewRead=async entry=>{await previousCrewRead?.(entry);if(entry?.result?.mapped?.accepted)await refresh();};
  ctx.refreshCase=refresh;
  function visibility(){
    generation+=1;worldGeneration+=1;intents.pause();clearTimerOwner();
    schedule.setHidden(Boolean(document?.hidden));
    if(!document?.hidden)void refresh();
  }
  document?.addEventListener?.('visibilitychange',visibility);
  return {refresh,handlers:{
    pin:cardId=>send('pin',{cardId}),pair:(a,b)=>send('pair',{cards:[a,b]}),
    search:(routeId,options={})=>{
      const route=state.case?.search.spots.flatMap(spot=>spot.routes??[]).find(row=>row.id===routeId);
      return send('search',{routeId,paidConfirmed:options.paidConfirmed===true,expectedPrice:route?.price??null});
    },orderPartner:(seat,order,target)=>send('orderPartner',{seat,order,target,allowPaid:false}),
    callNightfall:()=>send('callNightfall',{}),takePost:light=>send('takePost',{light}),
    aim:(light,bearing)=>send('aim',{light,bearing}),accuse:suspect=>send('accuse',{suspect}),
    inspectSpot:spot=>local('inspectSpot',spot),boardSchooner:()=>local('boardSchooner'),nextReveal:()=>local('nextReveal'),
  },reset(){generation+=1;owner=null;intents.reset();pending.clear();effects.reset();
    store.commit({case:null,caseLoaded:false,caseElapsed:0,casePresentation:null,effects:[]});},
  tick(){
    if(disposed||document?.hidden||!state.case)return;
    const elapsed=Math.max(0,Math.floor((ctx.now()-state.caseReceivedAt)/1000));
    if(elapsed!==lastTick){lastTick=elapsed;store.commit({caseElapsed:elapsed});}
  },dispose(){disposed=true;generation+=1;worldGeneration+=1;clearTimerOwner();intents.dispose();effects.dispose();
    document?.removeEventListener?.('visibilitychange',visibility);ctx.onCrewRead=previousCrewRead;ctx.refreshCase=null;}};
}
