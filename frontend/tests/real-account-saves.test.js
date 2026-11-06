// Injected account replies verify replay saves and reconciliation without real credentials or services.
import {describe, expect, it, vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createAdapterStore} from '../src/online/case-adapter/store.js';
import {createAdapterTransport} from '../src/online/case-adapter/transport.js';
import {createAccountSaves} from '../src/online/case-adapter/saves.js';

const replay = {kind:'world', actions:['to_desk','take_key'], place:'saltreach_harbor'};
const okay = data => ({ok:true,status:200,data});
const fail = (status,code) => ({ok:false,status,code});
function setup() {
  let now=0;
  const session=createSession();session.setToken(String(Math.random()));
  const store=createAdapterStore({session});
  store.commit({cloudSave:{version:1,data:{},updatedAt:null}});
  const calls=[],writes=[],reads=[];
  const api={
    async get(route){calls.push({method:'GET',route});const reply=reads.shift();return typeof reply==='function'?reply():reply??okay(store.state.cloudSave);},
    async put(route,body){calls.push({method:'PUT',route,body});const reply=writes.shift();return typeof reply==='function'?reply():reply??okay({version:body.version+1,updatedAt:null});},
  };
  const ctx={store,state:store.state,session,api,publicApi:api,now:()=>now,random:()=>0.5,
    writeDeviceReplay:vi.fn(),
    accept:message=>({accepted:true,reason:null,message}),
    refuse:reason=>({accepted:false,reason,message:'Placeholder account message.'})};
  ctx.transport=createAdapterTransport(ctx);
  const saves=createAccountSaves(ctx);
  return {ctx,saves,calls,writes,reads,store,setNow:value=>{now=value;}};
}

describe('real account replay saves',()=>{
  it('rejects an unknown world place before any request',async()=>{
    const test=setup();
    expect(await test.saves.stageReplay({...replay,place:'not_a_place'},{immediate:true}))
      .toMatchObject({accepted:false,reason:'save_unavailable'});
    expect(test.calls).toEqual([]);
  });
  it('saves accepted actions without copying snapshots or account facts',async()=>{
    const test=setup();
    expect((await test.saves.stageReplay({...replay,engine:{coins:999},kit:'invented'}, {immediate:true})).accepted).toBe(true);
    expect(test.calls).toEqual([{method:'PUT',route:'/api/save',body:{version:1,data:replay}}]);
    expect(test.store.state.cloudSave).toMatchObject({version:2,data:replay});
    expect(test.store.state.saveState).toBe('saved');
  });
  it('rejects invalid action ids before writing or replacing the local copy',async()=>{
    const test=setup();
    expect((await test.saves.stageReplay({...replay,actions:['INVALID']})).reason).toBe('save_unavailable');
    expect(test.calls).toEqual([]);expect(test.store.state.deviceSave).toBeNull();
  });
  it('reads after an unknown write and accepts the equal cloud copy without resending',async()=>{
    const test=setup();test.writes.push(fail(503,'database_unavailable'));
    test.reads.push(okay({version:2,data:replay,updatedAt:null}));
    expect((await test.saves.stageReplay(replay,{immediate:true})).accepted).toBe(true);
    expect(test.calls.map(call=>call.method)).toEqual(['PUT','GET']);
    expect(test.store.state.saveState).toBe('saved');
  });
  it('shows both copies after an unknown write with a different cloud copy',async()=>{
    const test=setup();test.writes.push(fail(0,'network_error'));
    const other={...replay,actions:['to_shore']};test.reads.push(okay({version:2,data:other}));
    expect((await test.saves.stageReplay(replay,{immediate:true})).reason).toBe('save_conflict');
    expect(test.calls.map(call=>call.method)).toEqual(['PUT','GET']);
    expect(test.store.read().account.save).toMatchObject({state:'conflict',device:{state:'saved'},cloud:{state:'saved'}});
  });
  it('reads the newest version before explicitly keeping this device',async()=>{
    const test=setup();await test.saves.stageReplay(replay);
    test.store.commit({saveState:'conflict'});
    test.reads.push(okay({version:7,data:{...replay,actions:['to_shore']}}));
    expect((await test.saves.resolve('keep_this_device')).accepted).toBe(true);
    expect(test.calls.map(call=>call.method)).toEqual(['GET','PUT']);
    expect(test.calls.at(-1).body).toEqual({version:7,data:replay});
  });
  it('loads the cloud replay after its explicit conflict choice without a write',async()=>{
    const test=setup();await test.saves.stageReplay(replay);test.store.commit({saveState:'conflict'});
    const cloud={...replay,actions:['to_shore'],place:'home_islet'};
    test.reads.push(okay({version:4,data:cloud}));
    expect((await test.saves.resolve('use_cloud')).accepted).toBe(true);
    expect(test.store.state.continuation).toEqual({source:'cloud',...cloud});
    expect(test.store.state.deviceSave.data).toEqual(cloud);
    expect(test.ctx.writeDeviceReplay).toHaveBeenCalledWith(cloud);
    expect(test.store.state.saveState).toBe('saved');expect(test.calls.map(call=>call.method)).toEqual(['GET']);
  });
  it('turns stale_save into a conflict and reads the new copy without retrying',async()=>{
    const test=setup();test.writes.push(fail(409,'stale_save'));
    test.reads.push(okay({version:3,data:{...replay,actions:['to_shore']}}));
    expect((await test.saves.stageReplay(replay,{immediate:true})).reason).toBe('save_conflict');
    expect(test.calls.map(call=>call.method)).toEqual(['PUT','GET']);
  });
  it('writes dirty progress at most once a minute and leaves unchanged progress alone',async()=>{
    const test=setup();await test.saves.stageReplay(replay,{immediate:true});
    await test.saves.stageReplay({...replay,actions:[...replay.actions,'desk_back']});
    test.setNow(59999);await test.saves.tick();expect(test.calls).toHaveLength(1);
    test.setNow(60000);await test.saves.tick();expect(test.calls).toHaveLength(2);
    test.setNow(120000);await test.saves.tick();expect(test.calls).toHaveLength(2);
  });
  it('ignores a write that completes after the account scope changes',async()=>{
    const test=setup();let finish;test.writes.push(()=>new Promise(resolve=>{finish=resolve;}));
    const saving=test.saves.stageReplay(replay,{immediate:true});
    await Promise.resolve();test.store.invalidate();test.store.commit({cloudSave:null,saveState:'offline'});
    finish(okay({version:2}));expect((await saving).accepted).toBe(false);
    expect(test.store.state.cloudSave).toBeNull();expect(test.store.state.saveState).toBe('offline');
  });
  it('keeps staged actions locally without writing while signed out',async()=>{
    const test=setup();test.ctx.session.clearToken();
    await test.saves.stageReplay(replay,{immediate:true});
    expect(test.store.state.deviceSave.data).toEqual(replay);expect(test.calls).toEqual([]);
  });
});
