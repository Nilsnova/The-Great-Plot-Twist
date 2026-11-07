// Actual L2 engine and injected published fake replies: no browser, account or service is used.
import {randomUUID} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createIsletAdapter} from '../src/screens/islet/adapter.js';
import {createFakeIsletTransport} from '../src/screens/islet/fake-transport.js';
const STATION='islet_signal_station',ISLET='/api/islet',BUILD='/api/islet/build';
const failure=(status,code)=>({ok:false,status,code,...(status===429?{retryAfterSeconds:3}:{})});
const fixtures=[];
function setup(){
  let now=0;const server=createFakeIsletTransport({now:()=>new Date(0)}),gets=[],posts=[],requests=[];
  const transport={get:vi.fn(async path=>{requests.push({method:'GET',path});const next=gets.shift();return next?next():server.get(path);}),
    post:vi.fn(async(path,body)=>{requests.push({method:'POST',path,body:structuredClone(body)});const next=posts.shift();return next?next(path,body):server.post(path,body);})};
  const makeUid=vi.fn(()=>`fixture_${randomUUID()}`),adapter=createIsletAdapter({transport,mode:'live',makeUid,now:()=>now});
  const f={server,transport,adapter,makeUid,gets,posts,requests,setTime:value=>{now=value;},
    writes:()=>requests.filter(entry=>entry.method==='POST'),spot:()=>adapter.read().spots.find(spot=>spot.plot===STATION)};
  fixtures.push(f);return f;
}
afterEach(()=>{for(const f of fixtures.splice(0))f.adapter.dispose();});
describe('an uncertain islet click survives refused resends',()=>{
  it.each([[401,'unauthorized'],[403,'forbidden'],[404,'no_such_plot'],[409,'insufficient_funds'],[422,'validation_error'],
    [429,'too_many_requests'],[500,'server_error'],[502,'database_error'],[503,'database_unavailable'],[504,'server_error']])('keeps original body/UID after resend%s until a later accepted build',async(status,code)=>{
    const f=setup();await f.adapter.refresh();f.posts.push(()=>failure(0,'network_error'));
    expect((await f.adapter.build(STATION)).accepted).toBe(false);expect(f.spot().retry).toBe(true);
    const original=f.writes()[0].body;await f.adapter.refresh();f.posts.push(()=>failure(status,code));
    expect((await f.adapter.build(STATION)).accepted).toBe(false);
    expect(f.writes()[1]).toEqual({method:'POST',path:BUILD,body:original});expect(f.spot().retry).toBe(true);expect(f.makeUid).toHaveBeenCalledOnce();
    const before=f.requests.length;
    if(status===429){
      f.setTime(2999);expect((await f.adapter.refresh()).accepted).toBe(false);expect((await f.adapter.build(STATION)).accepted).toBe(false);
      expect(f.requests).toHaveLength(before);f.setTime(3000);
    }
    await f.adapter.refresh();const previous=f.requests.at(-1);expect(previous).toEqual({method:'GET',path:ISLET});
    expect((await f.adapter.build(STATION)).accepted).toBe(true);
    expect(f.writes()).toHaveLength(3);expect(f.writes()[2].body).toEqual(original);expect(f.makeUid).toHaveBeenCalledOnce();
    expect(f.spot()).toMatchObject({state:'built',retry:false});expect(f.adapter.read()).toMatchObject({coins:700,timber:10,signalStationBuilt:true});
  });
  it('uses a fresh UID after a known first refusal because no earlier outcome is uncertain',async()=>{
    const f=setup();await f.adapter.refresh();f.posts.push(()=>failure(409,'insufficient_funds'));
    expect((await f.adapter.build(STATION)).accepted).toBe(false);expect(f.spot().retry).toBe(false);
    await f.adapter.refresh();expect((await f.adapter.build(STATION)).accepted).toBe(true);
    expect(f.writes()[1].body.actionUid).not.toBe(f.writes()[0].body.actionUid);expect(f.makeUid).toHaveBeenCalledTimes(2);
  });
  it('clears the held UID only after an authoritative built GET confirms an applied unknown outcome',async()=>{
    const f=setup();await f.adapter.refresh();f.posts.push(async(path,body)=>{
      await f.server.post(path,body);f.gets.push(()=>failure(503,'database_unavailable'));return failure(503,'database_unavailable');
    });
    expect((await f.adapter.build(STATION)).accepted).toBe(false);expect(f.spot().retry).toBe(true);const original=f.writes()[0].body.actionUid;
    await f.adapter.refresh();expect(f.spot()).toMatchObject({state:'built',retry:false});expect(f.writes()).toHaveLength(1);
    f.server.dev.reset();await f.adapter.refresh();expect((await f.adapter.build(STATION)).accepted).toBe(true);
    expect(f.writes()[1].body.actionUid).not.toBe(original);
  });
  it('does not restore a refused old resend after account reset and starts the next account with a new click',async()=>{
    const f=setup();await f.adapter.refresh();f.posts.push(()=>failure(0,'network_error'));
    await f.adapter.build(STATION);const original=f.writes()[0].body.actionUid;await f.adapter.refresh();
    let release;const held=new Promise(done=>{release=done;});f.posts.push(()=>held);
    const pending=f.adapter.build(STATION);f.adapter.resetPrivate();release(failure(429,'too_many_requests'));
    expect(await pending).toMatchObject({accepted:false,code:'session_expired'});expect(f.adapter.read().spots).toEqual([]);
    await f.adapter.refresh();expect((await f.adapter.build(STATION)).accepted).toBe(true);
    expect(f.writes().at(-1).body.actionUid).not.toBe(original);expect(f.makeUid).toHaveBeenCalledTimes(2);
  });
});
