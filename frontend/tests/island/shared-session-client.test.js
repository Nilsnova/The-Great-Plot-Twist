// Durable attach retries and fresh controller reads before any proof leaves the owning document.
import {afterEach,it,expect,vi} from 'vitest';
import {createSharedSessionClient} from '../../src/island/shared-session-client.js';
import {actorId,economy,metadata,sessionId,controlReceipt} from './shared-session-fixture.js';
let fixtureNumber=0;
const storage=()=>{const rows=new Map();return {getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key),rows};};
function locks(){const held=new Set();return {async request(name,_options,run){if(held.has(name))return run(null);held.add(name);try{return await run({name});}finally{held.delete(name);}}};}
const clients=[];afterEach(async()=>{await Promise.all(clients.splice(0).map(client=>client.dispose()));});
function setup(extra={}){
 const fixture=++fixtureNumber;let actor=actorId,selected=economy(),uids=0;const states=[],timers=[],saved=extra.storage??storage(),provider=extra.locks??locks();
 const api={attach:vi.fn(async record=>{const data=metadata();if(record.body.expectedGeneration!=='0')data.session.connectionGeneration=String(BigInt(record.body.expectedGeneration)+1n);return {ok:true,data};}),
  read:vi.fn(async proof=>{const data=metadata(!!proof);if(proof)data.session.connectionGeneration=proof.connectionGeneration;return {ok:true,data};}),
  heartbeat:vi.fn(async proof=>{const data=metadata();data.session.connectionGeneration=proof.connectionGeneration;return {ok:true,data};}),disconnect:vi.fn(async()=>({ok:true,data:metadata(false)})),
  leave:vi.fn(async record=>({ok:true,data:controlReceipt('session_leave',record)}))};
 const client=createSharedSessionClient({api,getActorId:()=>actor,getEconomy:()=>selected,storage:saved,locks:provider,
  makeUid:()=>`session_uid_${fixture}_${++uids}`,makeSessionId:extra.makeSessionId??(()=>sessionId),setTimer:run=>{timers.push(run);return timers.length;},clearTimer(){},onState:value=>states.push(value)});
 clients.push(client);return {client,api,saved,states,timers,provider,setActor:value=>{actor=value;},setEconomy:value=>{selected=value;},allocated:()=>uids};
}
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
