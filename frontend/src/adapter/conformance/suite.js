// Reusable Vitest contract checks for memory, fixture-backed and production adapters.
import {describe,it,expect} from 'vitest';
import {caseMethods,caseReasons,caseViewKeys} from '../contract.js';

const stableView=view=>{const copy=structuredClone(view);delete copy.revision;delete copy.notice;return copy;};
const hasKeys=(value,keys)=>expect(Object.keys(value)).toEqual(expect.arrayContaining(keys));
const stringOrNull=value=>expect(value===null||typeof value==='string').toBe(true);
const allowed=(value,values)=>expect(values).toContain(value);
function validateExtensions(view){
  const p=view.presence,a=view.account,r=view.rewards,l=view.log,h=view.hints;
  allowed(p.status,['live','reconnecting','offline','off']);stringOrNull(p.place);
  expect(Array.isArray(p.others)).toBe(true);expect(Number.isInteger(p.hiddenCount)&&p.hiddenCount>=0).toBe(true);
  expect(Array.isArray(p.crew)).toBe(true);expect(Number.isFinite(p.sampledAt)).toBe(true);
  for(const peer of p.others){
    hasKeys(peer,['id','name','kit','x','y','facing','moving','emote','isCrew','at']);
    expect(typeof peer.id).toBe('string');expect(typeof peer.name).toBe('string');
    hasKeys(peer.kit,['id','name']);expect(Number.isFinite(peer.x)&&Number.isFinite(peer.y)).toBe(true);
    allowed(peer.facing,['front','back','left','right']);expect(typeof peer.moving).toBe('boolean');
    allowed(peer.emote,[null,'wave','cheer','point','lantern','shrug']);expect(typeof peer.isCrew).toBe('boolean');expect(Number.isFinite(peer.at)).toBe(true);
  }
  for(const member of p.crew){
    hasKeys(member,['id','seat','name','kit','online','place','isPartner']);
    expect(typeof member.id).toBe('string');expect(Number.isInteger(member.seat)).toBe(true);expect(typeof member.name).toBe('string');
    if(member.kit!==null)hasKeys(member.kit,['id','name']);expect(typeof member.online).toBe('boolean');stringOrNull(member.place);expect(typeof member.isPartner).toBe('boolean');
  }
  allowed(a.state,['signed_out','signing_in','signed_in','expired','error']);stringOrNull(a.captainName);
  expect(typeof a.canReroll).toBe('boolean');expect(typeof a.hasKit).toBe('boolean');expect(typeof a.canContinue).toBe('boolean');
  allowed(a.save.state,['idle','saving','saved','offline','conflict']);expect(typeof a.save.label).toBe('string');
  expect(a.save.updatedAt===null||typeof a.save.updatedAt==='string'||Number.isFinite(a.save.updatedAt)).toBe(true);
  for(const key of ['recent','ledger','keepsakes','epilogue','contributors'])expect(Array.isArray(r[key])).toBe(true);
  expect(r.balance===null||Number.isFinite(r.balance)).toBe(true);expect(typeof r.festivalBadge).toBe('boolean');
  for(const entry of [...r.recent,...r.ledger]){hasKeys(entry,['id','amount','reason','label','at']);expect(typeof entry.id).toBe('string');expect(Number.isFinite(entry.amount)).toBe(true);expect(typeof entry.reason).toBe('string');expect(typeof entry.label).toBe('string');}
  for(const item of r.keepsakes){hasKeys(item,['id','title','description','owned']);expect(typeof item.owned).toBe('boolean');}
  for(const item of r.epilogue){hasKeys(item,['id','text']);expect(typeof item.text).toBe('string');}
  for(const key of ['cards','deductions','partnerReports','nights','reveal'])expect(Array.isArray(l[key])).toBe(true);
  expect(Array.isArray(h.items)).toBe(true);expect(Array.isArray(h.actions)).toBe(true);
  for(const item of h.items)hasKeys(item,['id','title','body']);
  for(const action of h.actions)hasKeys(action,['id','label','screen','params','available','priority']);
  if(view.continuation!==null){const c=view.continuation;hasKeys(c,['source','kind','actions','place']);allowed(c.source,['local','cloud']);allowed(c.kind,['intro','world']);expect(c.actions===null||Array.isArray(c.actions)).toBe(true);stringOrNull(c.place);}
}
const validResult=result=>{
  expect(result).toMatchObject({accepted:expect.any(Boolean),message:expect.any(String)});
  expect(Object.keys(result.view)).toEqual(expect.arrayContaining(caseViewKeys));
  if(result.accepted)expect(result.reason).toBeNull();
  else expect(caseReasons).toContain(result.reason);
};

/** Register reusable adapter checks. Driver: {options,probes,prepare,sequence,assertProgress,stableView}. */
export function defineAdapterConformance(name,factory,driver={}){
  const create=()=>driver.create?driver.create():factory(driver.options??{});
  describe(`${name} case adapter contract`,()=>{
    it('returns every schema key and caller-owned nested read snapshots',async()=>{
      const adapter=await create();
      try{
        const before=adapter.read(),copy=adapter.read();
        expect(Object.keys(before)).toEqual(expect.arrayContaining(caseViewKeys));
        expect(before.schema).toBe(1);
        validateExtensions(before);
        copy.captain.name='mutated by caller';copy.rewards.ledger.push({id:'caller'});
        copy.presence.others.push({id:'caller'});
        expect(adapter.read()).toEqual(before);
      }finally{adapter.dispose();}
    });

    for(const method of caseMethods)it(`answers ${method} with a known reason`,async()=>{
      const adapter=await create();
      try{
        expect(typeof adapter[method]).toBe('function');
        let result;
        try{result=await adapter[method](...(driver.probes?.[method]??[]));}
        catch(error){expect(caseReasons).toContain(error?.reason);expect(error?.message).toEqual(expect.any(String));return;}
        validResult(result);
      }finally{adapter.dispose();}
    });

    it('publishes cloned state before resolving and keeps pin-pair progress safe on repeats',async()=>{
      const flow=driver.sequence;
      if(!flow?.length){expect(typeof driver.sequence).toBe('object');return;}
      const adapter=await create();let off=()=>{},resolved=false,publishedBeforeResolve=false,initialName;
      try{
        await driver.prepare?.(adapter);
        initialName=adapter.read().captain.name;
        off=adapter.subscribe(event=>{if(!resolved)publishedBeforeResolve=true;event.view.captain.name='listener mutation';});
        for(const [index,step] of flow.entries()){
          const promise=adapter[step.method](...(step.args??[])).then(value=>{resolved=true;return value;});
          const result=await promise;validResult(result);expect(result.accepted).toBe(true);
          if(index===0){expect(publishedBeforeResolve).toBe(true);expect(adapter.read().captain.name).toBe(initialName);}
          if(step.repeat){const before=(driver.stableView??stableView)(adapter.read());const again=await adapter[step.method](...(step.args??[]));validResult(again);expect((driver.stableView??stableView)(adapter.read())).toEqual(before);}
          resolved=false;
        }
        driver.assertProgress?.(adapter.read());
      }finally{off();adapter.dispose();}
    });

    it('stops subscriber delivery and state-changing intents after unsubscribe and dispose',async()=>{
      const adapter=await create();let events=0;
      try{
        await driver.prepare?.(adapter);
        const off=adapter.subscribe(()=>events++),step=driver.sequence?.[0],next=driver.sequence?.[1]??driver.sequence?.[0];
        if(!step){off();expect(typeof driver.sequence).toBe('object');return;}
        await adapter[step.method](...(step.args??[]));const afterFirst=events;expect(afterFirst).toBeGreaterThan(0);
        off();await adapter[next.method](...(next.args??[]));expect(events).toBe(afterFirst);
        const before=(driver.stableView??stableView)(adapter.read());adapter.dispose();
        const afterDisposeRead=adapter.read();adapter.tick?.(1);
        expect((driver.stableView??stableView)(adapter.read())).toEqual(before);
        let afterDispose;
        try{afterDispose=await adapter[step.method](...(step.args??[]));}
        catch(error){expect(caseReasons).toContain(error?.reason);expect(error.reason).toBe('disposed');}
        if(afterDispose){validResult(afterDispose);expect(afterDispose.accepted).toBe(false);expect(afterDispose.reason).toBe('disposed');}
        expect(events).toBe(afterFirst);expect(adapter.read()).toEqual(afterDisposeRead);
      }finally{adapter.dispose();}
    });
  });
}
