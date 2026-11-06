// Real session transport, durable retries and the local rehearsal boundary.
import {describe,it,expect,vi} from 'vitest';
import {createSession} from '../../src/online/session.js';
import {createApi} from '../../src/online/api.js';
import {createFestivalAdapter} from '../../src/screens/festival/adapter.js';
import {isFestivalRehearsal,remainingSeconds} from '../../src/screens/festival/logic.js';
import {createLocalFestival} from '../../src/screens/festival/local.js';
const board=()=>({phase:'active',startsAt:'2026-11-06T00:00:00Z',endsAt:'2026-11-08T00:00:00Z',remainingSeconds:120,
 serverTime:'2026-11-07T23:58:00Z',lamps:[{id:'festival_lamp_01',label:'Lamp 01',lit:false,claimed:false,claimedByMe:false}],ring:{available:true,queued:false,duelId:null}});
function setup(responses=[],signedIn=true){const session=createSession();if(signedIn)session.setToken('verified.test.fixture');const fetchImpl=vi.fn(async()=>{const result=responses.shift();if(result instanceof Error)throw result;return new Response(JSON.stringify(result?.data??result),{status:result?.status??200});});const adapter=createFestivalAdapter({api:createApi({session,fetchImpl}),session,uid:()=> 'festival-uid-0001',now:()=>1000});return{adapter,session,fetchImpl};}
describe('festival transport',()=>{
 it('requires both explicit rehearsal parameters',()=>{expect(isFestivalRehearsal('?demo=1&festival=1')).toBe(true);for(const query of ['', '?festival=1','?demo=1','?demo=0&festival=1'])expect(isFestivalRehearsal(query)).toBe(false);});
 it('checks the real server flag before reads or writes',async()=>{const{adapter,fetchImpl}=setup([{flags:{festival:false}}]);await adapter.refresh();expect(adapter.read().enabled).toBe(false);await adapter.claim('festival_lamp_01');expect(fetchImpl).toHaveBeenCalledTimes(1);adapter.dispose();});
 it('reads the public view signed out and never sends a claim',async()=>{const{adapter,fetchImpl}=setup([{flags:{festival:true}},board()],false);await adapter.refresh();expect(adapter.read().festival.phase).toBe('active');expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBeUndefined();await adapter.claim('festival_lamp_01');expect(fetchImpl).toHaveBeenCalledTimes(2);adapter.dispose();});
 it('uses the existing verified token, fixed body and safe-repeat UID',async()=>{const{adapter,fetchImpl}=setup([{flags:{festival:true}},board(),{accepted:true,reason:null,festival:board()}]);await adapter.refresh();await adapter.claim('festival_lamp_01');const[path,options]=fetchImpl.mock.calls[2];expect(path).toBe('/api/festival/claim');expect(options.headers.Authorization).toBe('Bearer verified.test.fixture');expect(JSON.parse(options.body)).toEqual({lampId:'festival_lamp_01',actionUid:'festival-uid-0001'});adapter.dispose();});
 it('retries an unknown outcome with the identical body and prevents a second action',async()=>{const{adapter,fetchImpl}=setup([{flags:{festival:true}},board(),new Error('lost'),{accepted:true,reason:null,repeat:true,festival:board()}]);await adapter.refresh();await adapter.claim('festival_lamp_01');expect(adapter.read().pending.kind).toBe('claim');await adapter.join(['shade','mirror','shade']);expect(fetchImpl).toHaveBeenCalledTimes(3);await adapter.retry();expect(fetchImpl.mock.calls[2][1].body).toBe(fetchImpl.mock.calls[3][1].body);expect(adapter.read().pending).toBeNull();adapter.dispose();});
 it('clears private fields and pending intent when the session ends',async()=>{const data=board();data.lamps[0].claimedByMe=true;data.ring.queued=true;data.ring.duelId='private-duel';const{adapter,session}=setup([{flags:{festival:true}},data,new Error('lost')]);await adapter.refresh();await adapter.claim('festival_lamp_01');session.clearToken();expect(adapter.read().pending).toBeNull();expect(adapter.read().festival.ring.duelId).toBeNull();expect(adapter.read().festival.lamps[0].claimedByMe).toBe(false);adapter.dispose();});
 it('keeps the last good view on a broken read',async()=>{const{adapter}=setup([{flags:{festival:true}},board(),{flags:{festival:true}},{remainingSeconds:NaN}]);await adapter.refresh();await adapter.refresh();expect(adapter.read().festival.phase).toBe('active');expect(adapter.read().notice).toBeTruthy();adapter.dispose();});
 it('cannot mutate the stored view through read()',async()=>{const{adapter}=setup([{flags:{festival:true}},board()]);await adapter.refresh();adapter.read().festival.ring.queued=true;expect(adapter.read().festival.ring.queued).toBe(false);adapter.dispose();});
 it('does not treat a successful but malformed write answer as proof',async()=>{const{adapter}=setup([{flags:{festival:true}},board(),{}]);await adapter.refresh();await adapter.claim('festival_lamp_01');expect(adapter.read().pending.kind).toBe('claim');adapter.dispose();});
 it('decrements server-provided remaining time without trusting the device clock for dates',()=>{expect(remainingSeconds({remainingSeconds:120},1000,5100)).toBe(116);expect(remainingSeconds({remainingSeconds:3},1000,9000)).toBe(0);});
 it('runs rehearsal claims, queue and end entirely in memory',async()=>{const fetchSpy=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No network permitted'));const adapter=createLocalFestival({now:()=>1000});await adapter.refresh();await adapter.claim('festival_lamp_01');expect(adapter.read().festival.lamps[0].claimedByMe).toBe(true);await adapter.join(['shade','mirror','shade']);expect(adapter.read().festival.ring.queued).toBe(true);await adapter.rehearse('ended');expect(adapter.read().festival.phase).toBe('ended');expect(adapter.read().festival.lamps.some(lamp=>lamp.claimed)).toBe(false);expect(fetchSpy).not.toHaveBeenCalled();adapter.dispose();fetchSpy.mockRestore();});
});

describe('uncertain write retry refusals',()=>{
 it.each([429,409,404,422])('retains the original claim after a retry receives HTTP %s',async status=>{
  const{adapter,fetchImpl}=setup([{flags:{festival:true}},board(),new Error('lost'),{status,data:{error:{code:status===404?'feature_off':'too_many_requests'}}},{accepted:true,reason:null,repeat:true,festival:board()}]);
  await adapter.refresh();await adapter.claim('festival_lamp_01');await adapter.retry();
  expect(adapter.read().pending?.kind).toBe('claim');await adapter.retry();
  expect(fetchImpl.mock.calls[2][1].body).toBe(fetchImpl.mock.calls[3][1].body);
  expect(fetchImpl.mock.calls[2][1].body).toBe(fetchImpl.mock.calls[4][1].body);
  expect(adapter.read().pending).toBeNull();adapter.dispose();
 });
});
