// Bounded presentation reports. The transport still owns rooms, connection retries and its own throttle.
const REPORT_INTERVAL_MS=500;
export function createPositionReporter(send){
  let baseline=null,lastSent=null,lastAt=-Infinity,pendingPlace=false;
  function update(sample,now,{enabled=true}={}){
    if(!Number.isFinite(sample.x)||!Number.isFinite(sample.y)||!Number.isFinite(now))return;
    const next={...sample};
    if(!enabled){baseline=next;lastSent=null;pendingPlace=false;return;}
    if(baseline&&baseline.place!==next.place)pendingPlace=true;
    baseline=next;
    const moved=next.moving&&(!lastSent||next.x!==lastSent.x||next.y!==lastSent.y||next.facing!==lastSent.facing);
    const stopped=!next.moving&&lastSent?.moving;
    const initial=!lastSent;
    if(!(initial||moved||stopped||pendingPlace)||now-lastAt<REPORT_INTERVAL_MS)return;
    lastAt=now;lastSent=next;pendingPlace=false;
    try{const pending=send({...next});pending?.catch?.(()=>{});}catch{/* Adapter connection state is shown by its view. */}
  }
  return {update,reset(){baseline=null;lastSent=null;pendingPlace=false;lastAt=-Infinity;}};
}
