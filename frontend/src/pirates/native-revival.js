// Ordered native hold lifecycle; only the canonical journal can restore HP.
import {TICK_SECONDS} from './sync.js';
import {isParticipantToken} from './recovery-policy.js';
const backoff=400;
export function createNativeRevival(ctl,{sync,send,complete}={}){
 const active=(current,state)=>ctl.wave===current && current.revive===state && ctl.controls(current);
 const mark=(state,code)=>{state.note=code==='health_sync_required'?'Syncing Captain health…':'Confirming the hold…';state.retryAt=ctl.now()+backoff;};
 function cancel(current,state){
  state.cancelled=true;
  if(state.busy)return;
  if(!state.holdId && !state.startPending || state.stage==='waiting_journal'){if(current.revive===state)current.revive=null;return;}
  state.stage='cancelling';state.busy=true;state.paying=false;
  void send({type:'captain_revive_hold_cancel'},state.cancelPending).then(answer=>{
   if(!active(current,state))return;
   if(answer.ok || answer.code!=='input_sync_required'){current.revive=null;return;}
   state.cancelPending=answer.pending;mark(state,answer.code);
  }).catch(()=>mark(state,'network_error')).finally(()=>{state.busy=false;});
 }
 function begin(current,state){
  state.busy=true;state.stage='starting';state.note='Syncing Captain health…';
  void (async()=>{
   const result=await sync();if(!active(current,state) || state.cancelled)return;
   const fact=result.captains?.[state.targetId];
   if(!result.ok || !fact || fact.downAtTick!==state.downAtTick || !isParticipantToken(fact.fallId)){mark(state,result.code);return;}
   state.fallId=fact.fallId;
   const answer=await send({type:'captain_revive_hold_start',targetId:state.targetId,fallId:state.fallId},state.startPending);
   if(!active(current,state))return;
   if(!answer.ok){state.startPending=answer.pending??null;mark(state,answer.code);return;}
   const hold=answer.event?.payload?.hold;
   if(!isParticipantToken(hold?.holdId) || ![1200,2000].includes(hold.requiredMs) || typeof hold.startedAt!=='string'
     || !Number.isFinite(Date.parse(hold.startedAt)) || typeof hold.repeat!=='boolean'){mark(state,'unreadable');return;}
   state.startPending=null;state.holdId=hold.holdId;state.startedAt=Date.parse(hold.startedAt);state.requiredMs=hold.requiredMs;
   state.stage='holding';state.note=null;
  })().catch(()=>mark(state,'network_error')).finally(()=>{
   state.busy=false;if(active(current,state) && state.cancelled)cancel(current,state);
  });
 }
 function finish(current,state){
  state.busy=true;state.paying=true;state.stage='completing';state.note='Syncing Captain health…';
  void (async()=>{
   const result=await sync();if(!active(current,state) || state.cancelled)return;
   const fact=result.captains?.[state.targetId];
   if(!result.ok || fact?.fallId!==state.fallId || fact.downAtTick!==state.downAtTick){state.stage='holding';mark(state,result.code);return;}
   const answer=await complete({origin:current.info.initialSnapshot.economy,waveId:current.info.waveId,targetToken:state.targetId,fallId:state.fallId,holdId:state.holdId});
   if(!active(current,state))return;
   if(answer.ok){state.stage='waiting_journal';state.note='Waiting for confirmed revival…';return;}
   state.stage=['hold_incomplete','hold_invalidated','hold_missing'].includes(answer.code)?'starting':'holding';
   if(state.stage==='starting'){state.holdId=null;state.share=0;}
   mark(state,answer.code);
  })().catch(()=>{state.stage='holding';mark(state,'network_error');}).finally(()=>{
   state.busy=false;state.paying=state.stage==='waiting_journal';if(active(current,state) && state.cancelled)cancel(current,state);
  });
 }
 return {
  update(current,target,holding){
   if(!ctl.controls(current)){current.revive=null;return;}
   let state=current.revive;
   if(state && (state.targetId!==target?.id || state.downAtTick!==Math.round((target?.downAt??-1)/TICK_SECONDS) || !holding)){
    state.cancelled=true;if(ctl.now()>=(state.retryAt??0))cancel(current,state);return;
   }
   if(!target || !holding)return;
   if(!state){state=current.revive={targetId:target.id,downAtTick:Math.round(target.downAt/TICK_SECONDS),stage:'starting',share:0,paying:false,busy:false,retryAt:0};}
   if(state.cancelled){if(!state.busy && ctl.now()>=state.retryAt)cancel(current,state);return;}
   if(state.busy || ctl.now()<state.retryAt || state.stage==='waiting_journal')return;
   if(state.stage==='starting'){begin(current,state);return;}
   if(state.stage==='holding'){
    state.share=Math.max(0,Math.min(1,(ctl.now()+current.offset-state.startedAt)/state.requiredMs));
    if(state.share>=1)finish(current,state);
   }
  },
 };
}
