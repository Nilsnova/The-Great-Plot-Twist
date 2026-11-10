// GET presentation and bounded retries. Only fixed read kinds and public status words are retained.
// Read kinds the adapter owns; a feature that adds a GET adds its kind here (public ones also below).
const defaultKinds=['config','me'],defaultPublicKinds=['config'];
const backoff=[5000,15000,30000];
const failures={
  offline:{state:'offline',message:'You are offline. You can keep playing on this device.',reason:'offline'},
  not_connected:{state:'error',message:'Service unavailable. Try again in a moment.',reason:'not_connected'},
  internal_error:{state:'error',message:'The service could not complete this request. Please try again.',reason:'internal_error'},
  session_expired:{state:'expired',message:'Session expired. Sign in again to keep playing online.',reason:'session_expired'},
};
const idle=()=>({state:'idle',message:'',reason:null});

export function createReadMonitor(ctx,{setTimer=globalThis.setTimeout,clearTimer=globalThis.clearTimeout,kinds:allowed=defaultKinds,publicKinds=defaultPublicKinds}={}){
  const kinds=new Set(allowed),publicReads=new Set(publicKinds);
  const now=ctx.now??Date.now,document=ctx.document,window=ctx.window;
  const reads=new Map(),jobs=new Set();
  let generation=0,sequence=0,closed=false,hidden=Boolean(document?.hidden),nativeOffline=false,recovered=false,recoveryJob=null;
  let connection=idle();
  const live=()=>!closed&&!ctx.store.isClosed();
  function cancel(job){
    if(!job)return;
    job.active=false;if(job.timer!==null)clearTimer(job.timer);job.timer=null;jobs.delete(job);
  }
  function arm(job){
    if(!job.active||hidden||!live())return;
    job.due=now()+job.remaining;
    job.timer=setTimer(()=>{
      job.timer=null;jobs.delete(job);job.active=false;
      if(live()&&job.generation===generation)job.callback();
    },job.remaining);
    job.timer?.unref?.();
  }
  function schedule(delay,callback){
    const job={remaining:delay,due:0,timer:null,active:true,generation,callback};
    jobs.add(job);arm(job);return job;
  }
  function cancelRequest(entry){
    if(!entry.request)return;
    cancel(entry.request.loading);cancel(entry.request.slow);entry.request=null;
  }
  function markRecovered(){
    recovered=true;cancel(recoveryJob);
    recoveryJob=schedule(5000,()=>{recoveryJob=null;recovered=false;publish();});
  }
  function currentConnection(){
    const failed=[...reads.values()].filter(entry=>entry.failure)
      .sort((a,b)=>b.failure.sequence-a.failure.sequence);
    const expired=failed.find(entry=>entry.failure.reason==='session_expired');
    if(expired)return failures.session_expired;
    if(nativeOffline)return failures.offline;
    if(failed.length)return failures[failed[0].failure.reason];
    const requests=[...reads.values()].map(entry=>entry.request).filter(Boolean);
    if(requests.some(request=>request.isSlow))return {state:'slow',
      message:'The server is taking longer than expected.',reason:null};
    if(requests.some(request=>request.visible))return {state:'loading',message:'Loading…',reason:null};
    return recovered?{state:'online',message:'Back online. You can try again now.',reason:null}:idle();
  }
  function publish(){
    if(!live())return;
    const next=currentConnection();
    if(next.state===connection.state&&next.message===connection.message&&next.reason===connection.reason)return;
    connection={...next};ctx.store.commit({connection:{...connection}});
  }
  function reasonFor(kind,status,mapped){
    // Public endpoints cannot expire an account; retain their real HTTP status for diagnostics.
    if(publicReads.has(kind)&&(status===401||mapped?.reason==='session_expired'))return 'internal_error';
    if(status===401||mapped?.reason==='session_expired')return 'session_expired';
    if(status===0||mapped?.reason==='offline')return 'offline';
    if(status===503||mapped?.reason==='not_connected')return 'not_connected';
    return 'internal_error';
  }
  function retryError(entry,token){
    if(!live()||token!==generation||reads.get(entry.kind)!==entry)return;
    cancelRequest(entry);cancel(entry.retryJob);entry.retryJob=null;
    entry.failure={reason:'internal_error',sequence:++sequence};publish();
  }
  function runRetry(entry){
    if(entry.retryTask)return entry.retryTask;
    const token=generation;
    let version=entry.version;
    const task=Promise.resolve().then(()=>{
      if(!live()||token!==generation||reads.get(entry.kind)!==entry||entry.request)return;
      try{return entry.retry();}finally{version=entry.version;}
    }).then(()=>undefined,()=>{if(entry.version===version)retryError(entry,token);})
      .finally(()=>{if(entry.retryTask===task)entry.retryTask=null;});
    entry.retryTask=task;return task;
  }
  function begin(kind,{automatic=false,retry,automaticRetry=true}={}){
    if(!kinds.has(kind))throw new TypeError('Unknown read kind.');
    if(!live())return Object.assign(()=>false,{cancel:()=>false});
    let entry=reads.get(kind);
    if(!entry){entry={kind,attempts:0,retry:null,failure:null,request:null,retryJob:null,retryTask:null,version:0};reads.set(kind,entry);}
    cancel(entry.retryJob);entry.retryJob=null;cancelRequest(entry);
    entry.version+=1;
    if(!automatic){entry.attempts=0;entry.retryTask=null;}
    if(typeof retry==='function')entry.retry=retry;
    entry.automaticRetry=automaticRetry!==false;
    const request={generation,visible:false,isSlow:false,done:false,loading:null,slow:null};
    entry.request=request;
    const current=()=>live()&&request.generation===generation&&entry.request===request;
    request.loading=schedule(300,()=>{if(current()){request.visible=true;publish();}});
    request.slow=schedule(5000,()=>{if(current()){request.isSlow=true;request.visible=true;publish();}});
    publish();
    const finish=({status,mapped}={})=>{
      if(request.done||!current())return false;
      request.done=true;cancelRequest(entry);
      if(mapped?.accepted===true){
        if(entry.failure)markRecovered();
        entry.failure=null;entry.attempts=0;
      }else{
        entry.failure={reason:reasonFor(kind,status,mapped),sequence:++sequence};
        if(kind!=='config'&&entry.automaticRetry&&(status===0||status===503)&&entry.retry&&entry.attempts<backoff.length){
          const delay=backoff[entry.attempts++];
          entry.retryJob=schedule(delay,()=>{entry.retryJob=null;void runRetry(entry);});
        }
      }
      publish();return true;
    };
    finish.cancel=()=>{
      if(request.done||!current())return false;
      request.done=true;clearRead(kind);return true;
    };
    return finish;
  }
  function visibility(){
    const next=Boolean(document?.hidden);if(next===hidden)return;hidden=next;
    for(const job of jobs){
      if(hidden){
        if(job.timer!==null){job.remaining=Math.max(0,job.due-now());clearTimer(job.timer);job.timer=null;}
      }else arm(job);
    }
  }
  function offline(){nativeOffline=true;publish();}
  function online(){if(nativeOffline)markRecovered();nativeOffline=false;publish();}
  async function retryFailed(){
    if(!live())return;
    const pending=[];
    for(const entry of reads.values()){
      if(!entry.failure||!entry.retry||entry.request)continue;
      cancel(entry.retryJob);entry.retryJob=null;entry.attempts=0;
      pending.push(runRetry(entry));
    }
    await Promise.all(pending);
  }
  function clearRead(kind){
    if(!live())return;
    const entry=reads.get(kind);if(!entry)return;
    cancelRequest(entry);cancel(entry.retryJob);entry.retryJob=null;reads.delete(kind);publish();
  }
  function reset(){
    if(closed)return;
    generation+=1;for(const job of [...jobs])cancel(job);reads.clear();recovered=false;recoveryJob=null;publish();
  }
  function dispose(){
    if(closed)return;
    closed=true;generation+=1;for(const job of [...jobs])cancel(job);reads.clear();recoveryJob=null;
    document?.removeEventListener?.('visibilitychange',visibility);
    window?.removeEventListener?.('offline',offline);window?.removeEventListener?.('online',online);
  }
  document?.addEventListener?.('visibilitychange',visibility);
  window?.addEventListener?.('offline',offline);window?.addEventListener?.('online',online);
  return {begin,retryFailed,clearRead,reset,dispose,read:()=>({...connection})};
}
