// Host-only presentation flow. The API remains authoritative; retry UUIDs survive unknown outcomes.
export function createHostController({api,view,newUid=()=>crypto.randomUUID()}) {
  let epoch=0, authorized=false, overview=null, records=[],clockIntent=null,clockUncertain=false;
  const actions=new Map(), pending=new Set();
  function lock(message='Not a host',discardIntent=true) {
    epoch++;authorized=false;records=[];overview=null;
    if(discardIntent){clockIntent=null;clockUncertain=false;actions.clear();}
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
    const config=await api.get('/api/config');
    if(turn!==epoch)return;
    authorized=true;overview={...summary.data,caseClockAvailable:config.ok&&config.data?.capabilities?.hostCaseClock===true};
    records=crews.data.crews;
    view.show(overview,crews.data,api.headerChecks());
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
  async function setClock(seconds) {
    if(!authorized || !overview?.caseClockAvailable || pending.has('clock'))return;
    if(!Number.isInteger(seconds)||seconds<1||seconds>3600)return;
    if(clockIntent && clockIntent.seconds!==seconds) {
      view.say('Retry the unconfirmed clock move with the same seconds before another move.');return;
    }
    clockIntent??={seconds,actionUid:newUid()};
    const turn=epoch;pending.add('clock');view.clockBusy?.(true);
    try {
      const answer=await api.post('/api/host/case/clock',clockIntent);
      if(turn!==epoch)return;
      if(answer.ok) {
        // Deliberately ignore the full case view: the console must never render a solution.
        const outcome=answer.data;
        if(typeof outcome?.accepted!=='boolean'||typeof outcome.message!=='string'||
          (outcome.accepted&&(!Number.isInteger(outcome.now)||outcome.now<0))) {
          clockUncertain=true;
          view.say('Clock outcome unknown. Retry the same seconds; the action ID is retained.');return;
        }
        clockIntent=null;clockUncertain=false;
        view.say(`${outcome.accepted?'Clock moved':'Clock not moved'}: ${outcome.message??'No message.'}${
          Number.isInteger(outcome.now)?` Case second ${outcome.now}.`:''}${outcome.repeat?' (repeat)':''}`);
      }
      else if(answer.status===403 || answer.status===401)lock();
      else {
        if(answer.status===0 || answer.status>=500)clockUncertain=true;
        // A later rate limit/refusal cannot tell us whether the earlier unknown write ran.
        if(!clockUncertain)clockIntent=null;
        view.say(answer.status===404?'No open case crew, or the case feature is off.':
          answer.status===409?'Start your crew before moving its clock.':
          answer.status===429?'Clock rate limit reached. Wait before trying again.':
          'Clock outcome unknown. Retry the same seconds; the action ID is retained.');
      }
    } finally {pending.delete('clock');view.clockBusy?.(false);}
  }
  return {refresh,closeCrew,setClock,lock};
}
