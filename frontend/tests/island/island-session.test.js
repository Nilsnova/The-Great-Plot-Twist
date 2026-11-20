// Actual island binding: physical location, canonical availability and authoritative nonce rooms.
import {it,expect,vi} from 'vitest';
import {createIslandSession} from '../../src/island/island-session.js';
import {economy,metadata,actorId} from './shared-session-fixture.js';
function fixture(){
 const controller={open:vi.fn(async()=>({ok:true})),leave:vi.fn(async()=>({ok:true})),disconnect:vi.fn(async()=>({ok:true})),dispose:vi.fn(),proof:vi.fn(()=>({actorId})),roomPlace:()=>metadata().session.place};
 const listeners=new Map();let visible=true,selected=economy(),available=true,actor=actorId,identity=0;
 const isl={mode:'live',disposed:false,getActorId:()=>actor,authGeneration:()=>identity,getEconomy:()=>selected,domainAvailable:()=>available,isOnIsland:()=>visible};
 const target={addEventListener:(key,run)=>listeners.set(key,run),removeEventListener:(key,run)=>{if(listeners.get(key)===run)listeners.delete(key);}};
 const session=createIslandSession(isl,{client:controller,windowTarget:target,documentTarget:null});
 return {session,controller,isl,listeners,setSelected:value=>{selected=value;},setActor:value=>{actor=value;},setIdentity:value=>{identity=value;},setVisible:value=>{visible=value;},setAvailable:value=>{available=value;}};
}
it('coalesces accepted scopes and ignores revision-only reads',async()=>{
 const f=fixture();f.session.reconcile();f.session.reconcile();await Promise.resolve();expect(f.controller.open).toHaveBeenCalledOnce();
 f.setSelected({...economy(),revision:'2'});f.session.reconcile();await Promise.resolve();expect(f.controller.open).toHaveBeenCalledOnce();
 f.setSelected({...economy(),accountId:'77777777-7777-4777-8777-777777777777',runEpoch:'88888888-8888-4888-8888-888888888888'});
 f.session.reconcile();f.session.reconcile();await Promise.resolve();expect(f.controller.open).toHaveBeenCalledTimes(2);f.session.dispose();
});
it.each(['actor','auth','scope','visible','available'])('fences a queued reconciliation across %s and rearms an accepted eligible read',async boundary=>{
 const f=fixture();f.session.reconcile();
 if(boundary==='actor')f.setActor('99999999-9999-4999-8999-999999999999');
 if(boundary==='auth')f.setIdentity(1);
 if(boundary==='scope')f.setSelected({...economy(),runEpoch:'88888888-8888-4888-8888-888888888888'});
 if(boundary==='visible')f.setVisible(false);
 if(boundary==='available')f.setAvailable(false);
 await Promise.resolve();expect(f.controller.open).not.toHaveBeenCalled();
 f.setVisible(true);f.setAvailable(true);f.session.reconcile();await Promise.resolve();expect(f.controller.open).toHaveBeenCalledOnce();f.session.dispose();
});
it('opens only a verified supported shared island on screen and uses its exact fresh nonce',async()=>{
 const f=fixture();f.setVisible(false);await f.session.ensure();expect(f.controller.open).not.toHaveBeenCalled();expect(f.session.roomPlace()).toBeNull();
 f.setVisible(true);await f.session.ensure();expect(f.controller.open).toHaveBeenCalledOnce();expect(f.session.roomPlace()).toBe(metadata().session.place);
 f.setAvailable(false);expect(f.session.proof()).toBeNull();expect(f.session.roomPlace()).toBeNull();await f.session.ensure();expect(f.controller.leave).toHaveBeenCalledTimes(2);
});
it('never treats an unresolved selected island as a personal room or session',async()=>{
 const f=fixture();f.setSelected(null);await f.session.ensure();expect(f.controller.open).not.toHaveBeenCalled();expect(f.session.roomPlace()).toBeNull();
});
it('disconnects on blur and resumes through fresh control admission only while visible and selected',async()=>{
 const f=fixture();f.listeners.get('blur')();expect(f.controller.disconnect).toHaveBeenCalledOnce();f.listeners.get('focus')();expect(f.controller.open).toHaveBeenCalledOnce();
 f.setVisible(false);f.listeners.get('focus')();expect(f.controller.open).toHaveBeenCalledOnce();f.session.dispose();expect(f.listeners.size).toBe(0);expect(f.controller.dispose).toHaveBeenCalledOnce();
});
