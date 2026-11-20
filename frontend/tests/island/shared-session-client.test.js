// Durable attach retries and fresh controller reads before any proof leaves the owning document.
import {afterEach,it,expect,vi} from 'vitest';
import {createSharedSessionClient} from '../../src/island/shared-session-client.js';
import {actorId,economy,metadata,sessionId,controlReceipt} from './shared-session-fixture.js';
let fixtureNumber=0;
const storage=()=>{const rows=new Map();return {getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key),rows};};
function locks(){const held=new Set();return {async request(name,_options,run){if(held.has(name))return run(null);held.add(name);try{return await run({name});}finally{held.delete(name);}}};}
const clients=[];afterEach(async()=>{await Promise.all(clients.splice(0).map(client=>client.dispose()));});
function setup(extra={}){
 const fixture=++fixtureNumber;let actor=actorId,selected=economy(),uids=0,identity=0;const states=[],timers=[],saved=extra.storage??storage(),provider=extra.locks??locks();
 const api={attach:vi.fn(async record=>{const data=metadata();if(record.body.expectedGeneration!=='0')data.session.connectionGeneration=String(BigInt(record.body.expectedGeneration)+1n);return {ok:true,data};}),
  read:vi.fn(async proof=>{const data=metadata(!!proof);if(proof)data.session.connectionGeneration=proof.connectionGeneration;return {ok:true,data};}),
  heartbeat:vi.fn(async proof=>{const data=metadata();data.session.connectionGeneration=proof.connectionGeneration;return {ok:true,data};}),disconnect:vi.fn(async()=>({ok:true,data:metadata(false)})),
  leave:vi.fn(async record=>({ok:true,data:controlReceipt('session_leave',record)})),settings:vi.fn(async record=>({ok:true,data:controlReceipt('session_settings',record)}))};
 const client=createSharedSessionClient({api,getActorId:()=>actor,getAuthGeneration:()=>identity,getEconomy:()=>selected,storage:saved,locks:provider,
  makeUid:()=>`session_uid_${fixture}_${++uids}`,makeSessionId:extra.makeSessionId??(()=>sessionId),setTimer:run=>{timers.push(run);return timers.length;},clearTimer(){},onState:value=>states.push(value),onAttached:extra.onAttached});
 clients.push(client);return {client,api,saved,states,timers,provider,setActor:value=>{actor=value;},setIdentity:value=>{identity=value;},setEconomy:value=>{selected=value;},allocated:()=>uids};
}

const replacementOrigin=()=>({...economy(),accountId:'77777777-7777-4777-8777-777777777777',runEpoch:'88888888-8888-4888-8888-888888888888'});
function scopedMetadata(origin){const data=metadata();data.economy={...economy(),...origin};data.session.place='isle_k7q2m_'+(origin.runEpoch===economy().runEpoch?'0':'1').repeat(24);return data;}
function useScopedProvider(f){
 f.api.attach.mockImplementation(async record=>({ok:true,data:scopedMetadata(record.origin)}));
 f.api.read.mockImplementation(async record=>({ok:true,data:scopedMetadata(record.origin)}));
}
it.each(['attach','read','hydration'])('rearms the current source after an obsolete %s flight settles',async stage=>{
 let release;let firstHydration=true;
 const f=setup({onAttached:async()=>{if(stage==='hydration'&&firstHydration){firstHydration=false;await new Promise(resolve=>{release=resolve;});}}});
 useScopedProvider(f);
 if(stage==='attach')f.api.attach.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve({ok:true,data:metadata()});}));
 if(stage==='read')f.api.read.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve({ok:true,data:metadata()});}));
 const opening=f.client.open();await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
 const next=replacementOrigin();f.setEconomy(next);const replacing=f.client.open();release();
 await Promise.all([opening,replacing]);
 expect(f.api.attach).toHaveBeenCalledTimes(2);expect(f.client.proof()?.origin.runEpoch).toBe(next.runEpoch);
 expect(f.client.roomPlace()).toBe('isle_k7q2m_'+'1'.repeat(24));
});
it.each(['actor','origin','auth'])('does not attach a queued intermediate source after %s changes again',async boundary=>{
 const f=setup();useScopedProvider(f);let release;
 f.api.attach.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve({ok:true,data:metadata()});}));
 const opening=f.client.open();await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
 f.setEconomy(replacementOrigin());const replacing=f.client.open();
 if(boundary==='actor')f.setActor('99999999-9999-4999-8999-999999999999');
 else if(boundary==='origin')f.setEconomy({...replacementOrigin(),runEpoch:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
 else f.setIdentity(1);
 release();await Promise.all([opening,replacing]);expect(f.api.attach).toHaveBeenCalledOnce();expect(f.client.proof()).toBeNull();
});
it.each([0,401])('parks the exact obsolete unknown attachment after status %s while admitting the new source',async status=>{
 const f=setup();useScopedProvider(f);let release;
 f.api.attach.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve({ok:false,status});}));
 const opening=f.client.open();await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
 const old=[...f.saved.rows.values()][0];f.setEconomy(replacementOrigin());const replacing=f.client.open();
 release();await Promise.all([opening,replacing]);
 const inert=[...f.saved.rows].find(([key])=>key.includes(':inert:'));
 expect(inert?.[1]).toBe(old);expect(f.api.attach).toHaveBeenCalledTimes(2);
 expect(f.api.attach.mock.calls[0][0].body.actionUid).toBe(JSON.parse(old).actionUid);
 expect(f.client.proof()?.origin.runEpoch).toBe(replacementOrigin().runEpoch);
});
it('withholds controller proof until a fresh GET follows the attach response',async()=>{
 const f=setup();let release;f.api.read.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const opening=f.client.open();await vi.waitFor(()=>expect(f.api.read).toHaveBeenCalledOnce());
 expect(f.client.proof()).toBeNull();expect(f.client.roomPlace()).toBeNull();release({ok:true,data:metadata()});await opening;
 expect(f.client.proof().connectionGeneration).toBe('9007199254740993');expect(f.client.roomPlace()).toBe(metadata().session.place);
});
it('does not grant control from a historical attach when current GET says spectator',async()=>{
 const f=setup();f.api.read.mockResolvedValue({ok:true,data:metadata(false)});await f.client.open();
 expect(f.client.proof()).toBeNull();expect(f.api.heartbeat).not.toHaveBeenCalled();expect(f.client.state.phase).toBe('spectator');
});
it('retains the exact attach body through unknown outcome,401 and reload',async()=>{
 const first=setup();first.api.attach.mockResolvedValueOnce({ok:false,status:503});await first.client.open();
 const original=structuredClone(first.api.attach.mock.calls[0][0]);await first.client.dispose();
 const next=setup({storage:first.saved,locks:first.provider});next.api.attach.mockResolvedValueOnce({ok:false,status:401});await next.client.open();
 expect(next.api.attach.mock.calls[0][0]).toEqual(original);await next.client.open();
 expect(next.api.attach.mock.calls[1][0]).toEqual(original);expect(next.allocated()).toBe(0);
});
it('reattaches a known session with its exact last generation before a fresh read',async()=>{
 const first=setup();await first.client.open();await first.client.dispose();
 const next=setup({storage:first.saved,locks:first.provider});await next.client.open();
 expect(next.api.attach.mock.calls[0][0].body).toMatchObject({sessionId,expectedGeneration:'9007199254740993'});
 expect(next.api.read).toHaveBeenCalledOnce();
});
it('blocks malformed retry storage instead of replacing an uncertain attach',async()=>{
 const f=setup({storage:{getItem:()=>'{broken',setItem(){}}});await f.client.open();
 expect(f.api.attach).not.toHaveBeenCalled();expect(f.allocated()).toBe(0);expect(f.client.proof()).toBeNull();
});
it('keeps cloned saved identities to one controlling document',async()=>{
 const first=setup(),second=setup({storage:first.saved,locks:first.provider});await Promise.all([first.client.open(),second.client.open()]);
 expect([first.client.proof(),second.client.proof()].filter(Boolean)).toHaveLength(1);
 expect(first.api.attach.mock.calls.length+second.api.attach.mock.calls.length).toBe(1);
 expect(second.api.read).toHaveBeenCalledWith(null);
});
it('keeps unsupported Web Lock environments read-only despite saved session identifiers',async()=>{
 const f=setup({locks:{}});await f.client.open();expect(f.api.read).toHaveBeenCalledWith(null);
 expect(f.api.attach).not.toHaveBeenCalled();expect(f.client.proof()).toBeNull();
});
it('ignores a late attach after close and never follows it with a fresh control GET',async()=>{
 const f=setup();let release;f.api.attach.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const opening=f.client.open();await vi.waitFor(()=>expect(f.api.attach).toHaveBeenCalledOnce());
 await f.client.disconnect();release({ok:true,data:metadata()});await opening;
 expect(f.api.read).not.toHaveBeenCalled();expect(f.client.proof()).toBeNull();
});
it.each(['actor','origin'])('fences a %s change during fresh control read',async field=>{
 const f=setup();let release;f.api.read.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const opening=f.client.open();await vi.waitFor(()=>expect(f.api.read).toHaveBeenCalledOnce());
 if(field==='actor')f.setActor('66666666-6666-4666-8666-666666666666');else f.setEconomy({...economy(),runEpoch:'66666666-6666-4666-8666-666666666666'});
 release({ok:true,data:metadata()});await opening;expect(f.client.proof()).toBeNull();expect(f.client.roomPlace()).toBeNull();
});
it('revokes local control on heartbeat failure while retaining the known server generation',async()=>{
 const f=setup();await f.client.open();f.api.heartbeat.mockResolvedValue({ok:false,status:503});await f.client.heartbeat();
 expect(f.client.proof()).toBeNull();expect([...f.saved.rows.values()][0]).toContain('9007199254740993');
});

it('shares a heartbeat in progress instead of racing current metadata responses',async()=>{
 const f=setup();await f.client.open();let release;f.api.heartbeat.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const first=f.client.heartbeat(),second=f.client.heartbeat();expect(f.api.heartbeat).toHaveBeenCalledOnce();
 release({ok:true,data:metadata()});await Promise.all([first,second]);expect(f.client.proof()).not.toBeNull();
});

it.each(['attach','read','heartbeat'])('releases the captured obsolete document lock after late %s',async boundary=>{
 const first=setup();if(boundary==='heartbeat')await first.client.open();let release;
 first.api[boundary].mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const pending=boundary==='heartbeat'?first.client.heartbeat():first.client.open();
 await vi.waitFor(()=>expect(first.api[boundary]).toHaveBeenCalledOnce());first.setActor('66666666-6666-4666-8666-666666666666');
 release({ok:true,data:metadata()});await pending;
 const next=setup({storage:first.saved,locks:first.provider});await next.client.open();
 expect(next.api.attach).toHaveBeenCalledOnce();expect(next.client.proof()).not.toBeNull();
});
it('never releases a newer actor lock when the obsolete read finally completes',async()=>{
 const f=setup();let release;f.api.read.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 const old=f.client.open();await vi.waitFor(()=>expect(f.api.read).toHaveBeenCalledOnce());await f.client.disconnect();
 const otherActor='66666666-6666-4666-8666-666666666666';f.setActor(otherActor);await f.client.open();
 release({ok:true,data:metadata()});await old;
 expect(f.client.proof()?.actorId).toBe(otherActor);
});

it('releases obsolete ownership when the next scheduled heartbeat observes an identity loss',async()=>{
 const first=setup();await first.client.open();first.setActor(null);first.timers.at(-1)();
 // Releasing a held Web Lock completes asynchronously before another document can acquire it.
 await Promise.resolve();
 const next=setup({storage:first.saved,locks:first.provider});await next.client.open();
 expect(next.client.proof()).not.toBeNull();expect(next.api.attach).toHaveBeenCalledOnce();
});

it('keeps an unknown late attachment inert after navigation and retries only the captured destination',async()=>{
 let count=0;const f=setup({makeSessionId:()=>++count===1?sessionId:'99999999-9999-4999-8999-999999999999'});let release;
 f.api.attach.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 f.api.attach.mockImplementation(async()=>({ok:false,status:409,code:'controller_held'}));
 const old=f.client.open();await vi.waitFor(()=>expect(f.api.attach).toHaveBeenCalledOnce());
 const original=structuredClone(f.api.attach.mock.calls[0][0]);
 const destination={...economy(),islandOwner:'66666666-6666-4666-8666-666666666666',accountId:'77777777-7777-4777-8777-777777777777',runEpoch:'88888888-8888-4888-8888-888888888888'};
 f.setEconomy(destination);release({ok:true,data:metadata()});await old;
 expect(f.api.read).not.toHaveBeenCalled();expect(f.client.proof()).toBeNull();await f.client.open();
 const next=structuredClone(f.api.attach.mock.calls[1][0]);expect(next.origin.islandOwner).toBe(destination.islandOwner);
 f.timers.at(-1)();await vi.waitFor(()=>expect(f.api.attach).toHaveBeenCalledTimes(3));
 expect(f.api.attach.mock.calls[2][0]).toEqual(next);expect(f.api.attach.mock.calls.filter(call=>call[0].origin.islandOwner===actorId)).toHaveLength(1);
 expect([...f.saved.rows.values()].some(value=>value.includes(original.body.actionUid))).toBe(true);
 expect(f.client.state.phase).toBe('waiting');expect(f.api.heartbeat).not.toHaveBeenCalled();
});
it('withdraws known control before a destination attachment and retains the exact leave through unknown and401',async()=>{
 const f=setup();await f.client.open();f.api.leave.mockResolvedValueOnce({ok:false,status:0}).mockResolvedValueOnce({ok:false,status:401});
 f.setEconomy({...economy(),runEpoch:'88888888-8888-4888-8888-888888888888'});
 await f.client.leave();expect(f.client.proof()).toBeNull();const original=structuredClone(f.api.leave.mock.calls[0][0]);
 await f.client.open();expect(f.api.leave.mock.calls[1][0]).toEqual(original);expect(f.api.attach).toHaveBeenCalledOnce();
 f.api.attach.mockResolvedValue({ok:false,status:409,code:'controller_held'});await f.client.open();
 expect(f.api.leave.mock.calls[2][0]).toEqual(original);expect(f.api.attach).toHaveBeenCalledTimes(2);
 expect(f.api.attach.mock.calls[1][0].origin.runEpoch).toBe('88888888-8888-4888-8888-888888888888');
});
it('resolves saved known departure under the exclusive tab lock before attaching a new origin after reload',async()=>{
 const first=setup();await first.client.open();await first.client.dispose();
 const second=setup({storage:first.saved,locks:first.provider});second.setEconomy({...economy(),runEpoch:'88888888-8888-4888-8888-888888888888'});
 second.api.attach.mockResolvedValue({ok:false,status:409,code:'controller_held'});await second.client.open();
 expect(second.api.leave).toHaveBeenCalledOnce();expect(second.api.attach).toHaveBeenCalledOnce();
 expect(second.api.leave.mock.invocationCallOrder[0]).toBeLessThan(second.api.attach.mock.invocationCallOrder[0]);
});
it('retires only a definitively stale departure after another document rotated that generation',async()=>{
 const f=setup();await f.client.open();f.api.leave.mockResolvedValue({ok:false,status:409,code:'stale_controller'});
 await f.client.leave();f.api.attach.mockResolvedValue({ok:false,status:409,code:'controller_held'});await f.client.open();
 expect(f.api.leave).toHaveBeenCalledOnce();expect(f.api.attach).toHaveBeenCalledTimes(2);
 expect(f.api.attach.mock.calls[1][0].body.expectedGeneration).toBe('0');expect(f.client.proof()).toBeNull();
});
it('retires an exact saved departure after authoritative membership removal before attaching home',async()=>{
 const first=setup();useScopedProvider(first);
 const visited={...economy(),islandOwner:'66666666-6666-4666-8666-666666666666'};
 first.setEconomy(visited);await first.client.open();
 first.api.leave.mockResolvedValue({ok:false,status:0,code:'network_error'});
 await first.client.leave();const original=structuredClone(first.api.leave.mock.calls[0][0]);await first.client.dispose();
 const next=setup({storage:first.saved,locks:first.provider});useScopedProvider(next);
 next.api.leave.mockResolvedValue({ok:false,status:403,code:'not_member'});
 expect((await next.client.open()).ok).toBe(true);
 expect(next.api.leave).toHaveBeenCalledExactlyOnceWith(original);
 expect(next.api.attach).toHaveBeenCalledOnce();
 expect(next.api.attach.mock.calls[0][0].body.expectedGeneration).toBe('0');
 expect(next.client.proof()?.origin.islandOwner).toBe(actorId);
 expect([...next.saved.rows.keys()].some(key=>key.includes(':leave:'))).toBe(false);
});
it.each([[403,'forbidden'],[403,'not_controller'],[401,'not_member'],[0,'network_error'],[503,'not_member']])(
 'retains an uncertain departure after status%s/code%s instead of admitting another source',async(status,code)=>{
 const f=setup();await f.client.open();f.api.leave.mockResolvedValue({ok:false,status,code});
 await f.client.leave();const original=structuredClone(f.api.leave.mock.calls[0][0]);
 f.setEconomy({...economy(),islandOwner:'66666666-6666-4666-8666-666666666666'});
 await f.client.open();
 expect(f.api.leave.mock.calls[1][0]).toEqual(original);expect(f.api.attach).toHaveBeenCalledOnce();
 expect(f.client.proof()).toBeNull();expect(f.client.state.phase).toBe('waiting');
});
it('retains unknown settings through401 and reads fresh metadata after the exact original operation resolves',async()=>{
 const f=setup();await f.client.open();f.api.settings.mockResolvedValueOnce({ok:false,status:0}).mockResolvedValueOnce({ok:false,status:401});
 await f.client.settings({autoNext:false});const old=structuredClone(f.api.settings.mock.calls[0][0]);
 await f.client.settings({autoNext:true});expect(f.api.settings.mock.calls[1][0]).toEqual(old);expect(f.api.read).toHaveBeenCalledOnce();expect(f.client.proof()).toBeNull();
 await f.client.open();await f.client.settings({autoNext:true});expect(f.api.settings.mock.calls[2][0]).toEqual(old);expect(f.api.read).toHaveBeenCalledTimes(3);
 expect(f.client.metadata.session.autoNext).toBe(true); // The current read can differ from the old false receipt.
});
it('retires confirmed old source locally without issuing a leave or cancelling newer control',async()=>{
 const f=setup();await f.client.open();const old=f.client.proof().origin;f.client.retireOrigin(old);expect(f.client.proof()).toBeNull();expect(f.api.leave).not.toHaveBeenCalled();
 await Promise.resolve();await Promise.resolve(); // A released Web Lock finishes asynchronously.
 const next={...economy(),runEpoch:'88888888-8888-4888-8888-888888888888'};f.setEconomy(next);
 f.api.attach.mockImplementation(async record=>{const data=metadata();data.economy=next;data.session.sessionId=record.body.sessionId;return {ok:true,data};});
 f.api.read.mockImplementation(async()=>({ok:true,data:{...metadata(),economy:next}}));await f.client.open();expect(f.client.proof()?.origin.runEpoch).toBe(next.runEpoch);
 f.client.retireOrigin(old);expect(f.client.proof()?.origin.runEpoch).toBe(next.runEpoch);
});
it('retires known old-run departure only on definite epoch mismatch against a fresh same-owner replacement',async()=>{
 const first=setup();await first.client.open();await first.client.dispose();const f=setup({storage:first.saved,locks:first.provider});
 const next={...economy(),accountId:'77777777-7777-4777-8777-777777777777',runEpoch:'88888888-8888-4888-8888-888888888888'};f.setEconomy(next);
 f.api.leave.mockResolvedValue({ok:false,status:409,code:'economy_epoch_mismatch'});
 f.api.attach.mockImplementation(async record=>({ok:true,data:{...metadata(),economy:next,session:{...metadata().session,sessionId:record.body.sessionId}}}));
 f.api.read.mockImplementation(async record=>({ok:true,data:{...metadata(!!record),economy:next}}));await f.client.open();
 expect(f.api.leave).toHaveBeenCalledOnce();expect(f.api.attach).toHaveBeenCalledOnce();expect(f.client.proof()?.origin.accountId).toBe(next.accountId);
});

it('hydrates only after independent fresh control confirmation, never on heartbeat or spectator read',async()=>{
 const hydrated=vi.fn(),f=setup({onAttached:hydrated});let release;f.api.read.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 const opening=f.client.open();await vi.waitFor(()=>expect(release).toBeTypeOf('function'));expect(hydrated).not.toHaveBeenCalled();
 release({ok:true,data:metadata()});await opening;expect(hydrated).toHaveBeenCalledOnce();expect(hydrated.mock.calls[0][0]).toEqual(f.client.proof());
 await f.client.open();await f.client.heartbeat();expect(hydrated).toHaveBeenCalledOnce();
 const other=setup({onAttached:hydrated});other.api.read.mockResolvedValue({ok:true,data:metadata(false)});await other.client.open();expect(hydrated).toHaveBeenCalledOnce();
});
it('releases only the old lock when identity changes during post-attach hydration',async()=>{
 let release;const first=setup({onAttached:()=>new Promise(resolve=>{release=resolve;})});const opening=first.client.open();
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'));first.setActor(null);release();
 expect((await opening).code).toBe('session_context_changed');expect(first.client.proof()).toBeNull();
 const next=setup({storage:first.saved,locks:first.provider});await next.client.open();expect(next.client.proof()).not.toBeNull();
});

it('does not replace a confirmed session with invented defaults when domain hydration fails',async()=>{
 const f=setup({onAttached:async()=>{throw new Error('domain unavailable');}});expect((await f.client.open()).ok).toBe(true);expect(f.client.proof()).not.toBeNull();
});
