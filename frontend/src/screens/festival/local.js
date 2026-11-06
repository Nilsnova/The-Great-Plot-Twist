// A strictly in-memory rehearsal. It cannot receive a real API, session token or fetch function.
import {createFestivalAdapter} from './adapter.js';
export function createLocalFestival({now=Date.now}={}) {
  let phase='active',started=now()-90000,paired=false,queued=false;
  const claims=new Set(),receipts=new Map();
  const session={isSignedIn:()=>true,onChange:()=>()=>{}};
  function board(){const ended=phase==='ended'||(phase==='active'&&now()>=started+172800000);const current=ended?'ended':phase;return {
    phase:current,startsAt:current==='waiting'?null:new Date(started).toISOString(),endsAt:current==='waiting'?null:new Date(started+172800000).toISOString(),remainingSeconds:current==='active'?Math.max(0,Math.ceil((started+172800000-now())/1000)):0,serverTime:new Date(now()).toISOString(),
    lamps:Array.from({length:12},(_,index)=>({id:`festival_lamp_${String(index+1).padStart(2,'0')}`,label:`Coastal lamp ${String(index+1).padStart(2,'0')}`,lit:index<4,claimed:current==='active'&&claims.has(index+1),claimedByMe:current==='active'&&claims.has(index+1)})),
    ring:{available:current==='active',queued:current==='active'&&queued,duelId:paired?'local-practice-pairing':null},
  };}
  const api={async get(path){return {ok:true,status:200,data:path==='/api/config'?{flags:{festival:true}}:board()};},async post(path,body){
    if(receipts.has(body.actionUid))return{ok:true,status:200,data:{...receipts.get(body.actionUid),repeat:true,festival:board()}};
    if(board().phase!=='active')return{ok:true,status:200,data:{accepted:false,reason:'festival_closed',festival:board()}};
    if(path.endsWith('/claim'))claims.add(Number(body.lampId.slice(-2)));
    if(path.endsWith('/join'))queued=true;
    if(path.endsWith('/leave')){queued=false;paired=false;}
    const result={accepted:true,reason:null,repeat:false,festival:board()};receipts.set(body.actionUid,result);return{ok:true,status:200,data:result};
  }};
  const adapter=createFestivalAdapter({api,session,now});
  return {...adapter,subscribe(listener){return adapter.subscribe(value=>listener({...value,mode:'local'}));},read(){return {...adapter.read(),mode:'local'};},async rehearse(next){if(next==='paired'){queued=false;paired=true;}else{phase=next;paired=false;queued=false;claims.clear();started=now()-90000;}await adapter.refresh();}};
}
