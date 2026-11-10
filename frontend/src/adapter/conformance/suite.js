// Reusable Vitest contract checks for memory, fixture-backed and production adapters.
import {describe,it,expect} from 'vitest';
import {adapterMethods,adapterReasons,viewKeys} from '../contract.js';

const stableView=view=>{const copy=structuredClone(view);delete copy.revision;delete copy.notice;return copy;};
const hasKeys=(value,keys)=>expect(Object.keys(value)).toEqual(expect.arrayContaining(keys));
const stringOrNull=value=>expect(value===null||typeof value==='string').toBe(true);
const allowed=(value,values)=>expect(values).toContain(value);
function validateParts(view){
  const p=view.presence,a=view.account,c=view.captain;
  hasKeys(p,['localEmote','canEmote','cooldown','emotes']);expect(typeof p.canEmote).toBe('boolean');expect(Number.isFinite(p.cooldown)&&p.cooldown>=0).toBe(true);expect(Array.isArray(p.emotes)).toBe(true);
  if(p.localEmote!==null){hasKeys(p.localEmote,['id','until']);allowed(p.localEmote.id,['wave','cheer','point','lantern','shrug']);expect(Number.isFinite(p.localEmote.until)).toBe(true);}
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
  allowed(a.state,['signed_out','signing_in','signed_in','expired','error']);stringOrNull(a.captainName);
  expect(typeof a.canReroll).toBe('boolean');expect(typeof a.guest).toBe('boolean');expect(Array.isArray(a.providers)).toBe(true);
  expect(typeof c.name).toBe('string');expect(c.coins===null||Number.isFinite(c.coins)).toBe(true);
}
const validResult=result=>{
  expect(result).toMatchObject({accepted:expect.any(Boolean),message:expect.any(String)});
  expect(Object.keys(result.view)).toEqual(expect.arrayContaining(viewKeys));
  if(result.accepted)expect(result.reason).toBeNull();
  else expect(adapterReasons).toContain(result.reason);
  if(result.retryAfterSeconds!==undefined){expect(result.accepted).toBe(false);expect(['rate_limited','too_many_tries']).toContain(result.reason);expect(typeof result.retryAfterSeconds).toBe('number');expect(Number.isFinite(result.retryAfterSeconds)&&result.retryAfterSeconds>=0&&result.retryAfterSeconds<=86400).toBe(true);}
};

/** Register reusable adapter checks. Driver: {options,probes,prepare,sequence,assertProgress,stableView}. */
export function defineAdapterConformance(name,factory,driver={}){
  const create=()=>driver.create?driver.create():factory(driver.options??{});
  describe(`${name} adapter contract`,()=>{
    it('returns every schema key and caller-owned nested read snapshots',async()=>{
      const adapter=await create();
      try{
        const before=adapter.read(),copy=adapter.read();
        expect(Object.keys(before)).toEqual(expect.arrayContaining(viewKeys));
        expect(before.schema).toBe(1);
        validateParts(before);
        copy.captain.name='mutated by caller';copy.presence.others.push({id:'caller'});copy.account.providers.push('caller');
        expect(adapter.read()).toEqual(before);
      }finally{adapter.dispose();}
    });

    for(const method of adapterMethods)it(`answers ${method} with a known reason`,async()=>{
      const adapter=await create();
      try{
        expect(typeof adapter[method]).toBe('function');
        let result;
        try{result=await adapter[method](...(driver.probes?.[method]??[]));}
        catch(error){expect(adapterReasons).toContain(error?.reason);expect(error?.message).toEqual(expect.any(String));return;}
        validResult(result);
      }finally{adapter.dispose();}
    });

    it('publishes cloned state before resolving and keeps state safe on repeats',async()=>{
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
        catch(error){expect(adapterReasons).toContain(error?.reason);expect(error.reason).toBe('disposed');}
        if(afterDispose){validResult(afterDispose);expect(afterDispose.accepted).toBe(false);expect(afterDispose.reason).toBe('disposed');}
        expect(events).toBe(afterFirst);expect(adapter.read()).toEqual(afterDisposeRead);
      }finally{adapter.dispose();}
    });
  });
}
