// Host-only presentation flow. The API remains authoritative; retry UUIDs survive unknown outcomes.
// The class demo status: {flagOn, code, codeSetAt, guests} from GET /api/host/demo (D030).
const validDemo=data=>typeof data?.flagOn==='boolean'&&(data.code===null||typeof data.code==='string')&&Number.isInteger(data.guests)&&data.guests>=0;
export function createHostController({api,view,newUid=()=>crypto.randomUUID()}) {
  let epoch=0, authorized=false, overview=null, records=[],demo=null,demoIntent=null,cleanupIntent=null;
  const actions=new Map(), pending=new Set();
  function lock(message='Not a host',discardIntent=true) {
    epoch++;authorized=false;records=[];overview=null;
    if(discardIntent){demoIntent=null;cleanupIntent=null;actions.clear();}
    demo=null;
    view.hide();view.say(message);
  }
  function failure(answer) {
    return answer.status===401 || answer.status===403 ? 'Not a host' :
      'Console unavailable. Check the API and migration, then refresh.';
  }
  async function refresh() {
    if(pending.size){view.say('Wait for the current action before refreshing.');return;}
    const turn=++epoch;authorized=false;view.hide();view.say('Checking host access…');
    api.resetHeaders?.();
    const summary=await api.get('/api/host/overview');
    if(turn!==epoch)return;
    if(!summary.ok){lock(failure(summary),summary.status===401||summary.status===403);return;}
    const crews=await api.get('/api/host/crews');
    if(turn!==epoch)return;
    if(!crews.ok){lock(failure(crews),crews.status===401||crews.status===403);return;}
    // The class demo status is a separate read: if it fails the panel says Unknown, the rest still works.
    const demoRead=await api.get('/api/host/demo');
    if(turn!==epoch)return;
    demo=demoRead.ok&&validDemo(demoRead.data)?demoRead.data:null;
    authorized=true;overview={...summary.data};
    records=crews.data.crews;
    view.show(overview,crews.data,api.headerChecks(),demo);
    view.say(`Host access confirmed · checked ${new Date().toLocaleTimeString()}`);
  }
  async function closeCrew(id,confirmed) {
    if(!authorized || !confirmed || pending.has(id) || !records.some(c=>c.id===id&&c.canClose))return;
    if(!actions.has(id))actions.set(id,newUid());
    const turn=epoch;pending.add(id);view.busy(id,true);
    try {
      const answer=await api.post(`/api/host/crews/${encodeURIComponent(id)}/close`,{actionUid:actions.get(id)});
      if(turn!==epoch)return;
      if(answer.ok){pending.delete(id);await refresh();return;}
      if(answer.status===401 || answer.status===403){lock();return;}
      view.say(answer.status===0 ? 'Outcome unknown. Retry this crew with the same action.' :
        'Crew not closed. It may have changed; refresh before trying again.');
    } finally {pending.delete(id);if(turn===epoch)view.busy(id,false);}
  }
  const uncertain=answer=>answer.status===0||answer.status>=500;
  // "New class code" (D030): one action id per attempt, kept after an unknown outcome so a retry is
  // the same request. The old code stops working for new joins at once; admitted guests stay.
  async function newCode(confirmed) {
    if(!authorized||!confirmed||pending.has('demo'))return;
    demoIntent??={actionUid:newUid()};
    const turn=epoch;pending.add('demo');view.demoBusy?.(true);
    try {
      const answer=await api.post('/api/host/demo/code',demoIntent);
      if(turn!==epoch)return;
      if(answer.ok) {
        const data=answer.data;
        if(!validDemo(data)||typeof data.code!=='string'){view.say('New code outcome unknown. Press the same button again; the action ID is retained.');return;}
        demoIntent=null;demo={flagOn:data.flagOn,code:data.code,codeSetAt:data.codeSetAt??null,guests:data.guests};
        view.demoUpdate?.(demo,true);
        view.say(data.flagOn?'New class code made. The old code no longer lets anyone new in.':
          'New class code made, but the demo flag is off, so guests are still refused.');
      } else if(answer.status===401||answer.status===403)lock();
      else if(uncertain(answer))view.say('New code outcome unknown. Press the same button again; the action ID is retained.');
      else {demoIntent=null;view.say(answer.message||'No new class code was made.');}
    } finally {pending.delete('demo');if(turn===epoch)view.demoBusy?.(false);}
  }
  async function cleanupGuests(confirmed) {
    if(!authorized||!confirmed||pending.has('cleanup'))return;
    cleanupIntent??={actionUid:newUid()};
    const turn=epoch;pending.add('cleanup');view.demoBusy?.(true);
    try {
      const answer=await api.post('/api/host/demo/cleanup',cleanupIntent);
      if(turn!==epoch)return;
      if(answer.ok) {
        const {checked,deleted,more}=answer.data??{};
        if(!Number.isInteger(checked)||!Number.isInteger(deleted)||typeof more!=='boolean'){view.say('Clean-up outcome unknown. Press it again; the action ID is retained.');return;}
        cleanupIntent=null;view.demoUpdate?.(demo?{...demo,guests:Math.max(0,demo.guests-deleted)}:demo,true);
        view.say(`Removed ${deleted} guest ${deleted===1?'account':'accounts'} (checked ${checked}).${more?' More old guests remain. Run it again.':''}`);
      } else if(answer.status===401||answer.status===403)lock();
      else if(uncertain(answer))view.say('Clean-up outcome unknown. Press it again; the action ID is retained.');
      else {cleanupIntent=null;view.say(answer.message||'Clean-up failed.');}
    } finally {pending.delete('cleanup');if(turn===epoch)view.demoBusy?.(false);}
  }
  return {refresh,closeCrew,newCode,cleanupGuests,lock};
}
