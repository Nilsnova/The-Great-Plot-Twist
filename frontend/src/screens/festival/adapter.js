// Session-bound festival transport. Unknown writes retain their exact id and body for retry.
import {makeActionUid} from '../market/uid.js';
import {checkedFestival,errorText} from './logic.js';
export function createFestivalAdapter({api,session,uid=makeActionUid,now=Date.now}={}) {
  const state={mode:'live',enabled:false,signedIn:session.isSignedIn(),festival:null,receivedAt:0,loading:false,busy:false,pending:null,notice:''};
  const listeners=new Set();let pending=null,readPending=null,disposed=false,epoch=0,visible=false,timer=null;
  const read=()=>structuredClone(state);
  const publish=()=>{if(!disposed)for(const listener of [...listeners])listener(read());};
  function adopt(data){const view=checkedFestival(data);if(!view)return false;state.festival=view;state.receivedAt=now();return true;}
  function schedule(){clearTimeout(timer);if(visible&&!disposed)timer=setTimeout(async()=>{await refresh();schedule();},state.festival?.ring.queued?5000:30000);}
  async function refresh(){
    if(disposed)return;if(readPending)return readPending;
    const generation=epoch;state.loading=true;publish();
    readPending=(async()=>{
      try {
        const config=await api.get('/api/config');
        if(disposed||generation!==epoch)return;
        if(!config.ok){state.notice=errorText(config.code);return;}
        state.enabled=config.data?.flags?.festival===true;
        if(!state.enabled){state.festival=null;state.notice=errorText('feature_off');return;}
        const result=await api.get('/api/festival');
        if(disposed||generation!==epoch)return;
        if(result.ok&&adopt(result.data))state.notice='';
        else state.notice=errorText(result.code);
      } catch {if(!disposed&&generation===epoch)state.notice=errorText('network_error');}
      finally {state.loading=false;publish();readPending=null;}
    })();
    return readPending;
  }
  async function perform(intent){
    if(disposed||state.busy)return null;
    if(!state.enabled){state.notice=errorText('feature_off');publish();return null;}
    if(!session.isSignedIn()){state.notice=errorText('unauthorized');publish();return null;}
    const generation=epoch,retrying=pending===intent;state.busy=true;state.notice='Confirming with the harbor…';publish();
    let result;
    try {result=await api.post(intent.path,intent.body);}catch{result={ok:false,status:0,code:'network_error'};}
    if(disposed||generation!==epoch)return null;
    state.busy=false;
    const data=result.data;
    if(result.ok&&typeof data?.accepted==='boolean'&&adopt(data.festival)) {
      pending=null;state.pending=null;
      state.notice=data.accepted?(intent.kind==='claim'?'Lamp reservation confirmed.':intent.kind==='join'?(data.festival.ring.duelId?'Your friendly duel is ready.':'Waiting for another captain.'): 'You left the ring queue.'):errorText(data.reason);
    } else if(!result.ok&&result.status>0&&result.status<500) {
      if(!retrying){pending=null;state.pending=null;}
      state.notice=errorText(result.code)+(retrying?' Your earlier action is still unconfirmed. Retry the same action.':'');
    } else {
      pending=intent;state.pending={kind:intent.kind,target:intent.body.lampId??null};state.notice=errorText('network_error');
    }
    publish();schedule();return data?.accepted===true?{...data,kind:intent.kind}:null;
  }
  function send(kind,body){
    if(pending||state.busy)return Promise.resolve(null);
    return perform({kind,path:`/api/festival/${({claim:'claim',join:'ring/join',leave:'ring/leave'})[kind]}`,body:{...body,actionUid:uid()}});
  }
  const stopSession=session.onChange(({signedIn})=>{
    epoch++;pending=null;state.pending=null;state.signedIn=signedIn;state.busy=false;state.loading=false;
    if(state.festival){state.festival.lamps.forEach(lamp=>lamp.claimedByMe=false);Object.assign(state.festival.ring,{queued:false,duelId:null});}
    state.notice=signedIn?'Refresh to load your festival reservations.':errorText('unauthorized');publish();
  });
  return {read,refresh,claim:lampId=>send('claim',{lampId}),join:signals=>send('join',{signals:[...signals]}),leave:()=>send('leave',{}),retry:()=>pending?perform(pending):refresh(),
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    setVisible(value){visible=!!value;clearTimeout(timer);if(visible){void refresh();schedule();}},
    dispose(){disposed=true;epoch++;clearTimeout(timer);stopSession();listeners.clear();},
  };
}
