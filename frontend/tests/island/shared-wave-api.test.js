// Native requests retain immutable actor/source and strict server proof across failures and epochs.
import {it,expect,vi} from 'vitest';
import {createSharedWaveApi} from '../../src/island/shared-wave-api.js';
import {actorId,economy,proof} from './shared-session-fixture.js';
import {nativeWave,nativeFinish,waveId} from './shared-wave-fixture.js';
function fixture(saved=new Map()){
 let selected=economy(),actor=actorId;const setter=vi.fn(),transport={get:vi.fn(async()=>({ok:true,data:nativeWave()})),post:vi.fn(async()=>({ok:true,data:nativeWave()}))};
 const api=createSharedWaveApi({transport,getEconomy:()=>selected,getActorId:()=>actor,getProof:()=>proof(),onEconomy:setter,
  storage:{getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key),key:index=>[...saved.keys()][index]??null,get length(){return saved.size;}},makeUid:()=> 'native_bell_uid_001'});
 return {api,transport,setter,saved,setEconomy:value=>{selected=value;},setActor:value=>{actor=value;}};
}
it('preserves an unknown bell body across401/reload/new epoch and does not activate historical control',async()=>{
 const f=fixture();f.transport.post.mockResolvedValue({ok:false,status:0});await f.api.startWave({where:'own'});const body=structuredClone(f.transport.post.mock.calls[0][1]);
 const next=fixture(f.saved);next.setEconomy({...economy(),runEpoch:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'});next.transport.post.mockResolvedValueOnce({ok:false,status:401});
 await next.api.startWave({where:'own'});expect(next.transport.post.mock.calls[0][1]).toEqual(body);
 const historical={...nativeWave(),repeat:true,historical:true,economy:null,session:null,participantToken:null,lastActorCounter:null};
 next.transport.post.mockResolvedValue({ok:true,data:historical});expect((await next.api.startWave({where:'own'})).data.historical).toBe(true);
 expect(next.transport.post.mock.calls[1][1]).toEqual(body);expect(next.setter).not.toHaveBeenCalled();expect(next.saved.size).toBe(0);
});
it.each(['origin','initialCaptains','liveGeneration','spectatorToken'])('retains the original bell on malformed successful %s',async kind=>{
 const f=fixture(),data=nativeWave();if(kind==='origin')data.initialSnapshot.economy.accountId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 if(kind==='initialCaptains')data.initialSnapshot.captainInitialState={};if(kind==='liveGeneration')data.session.connectionGeneration='2';
 if(kind==='spectatorToken')data.session={...data.session,isController:false,isSpectator:true,sessionId:null,connectionGeneration:null};
 f.transport.post.mockResolvedValue({ok:true,data});expect((await f.api.startWave({where:'own'})).ok).toBe(false);expect(f.saved.size).toBe(1);expect(f.setter).not.toHaveBeenCalled();
});
it('reads the native current wave with paired proof and no supplied account authority',async()=>{
 const f=fixture();await f.api.currentWave({where:'own'});const [path,options]=f.transport.get.mock.calls[0];
 expect(path).toContain('waveProtocol=2');expect(path).toContain('sessionId=');expect(path).toContain('connectionGeneration=9007199254740993');expect(path).not.toContain('accountId');
 expect(options.headers['X-Island-Economy-Version']).toBe('1');
});
it('retains exact finish report/proof through unknown401 and a new epoch, without exposing another player receipt',async()=>{
 const f=fixture();await f.api.currentWave({where:'own'});f.transport.post.mockResolvedValue({ok:false,status:0});
 const body={waveId,waveProtocol:2,survived:true,shipsSunk:1,checkpoint:{islandEpoch:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',checkpointUid:'checkpoint_original_001',throughTick:10,inputHeadSeq:0,lastRepairSeq:0,basisRepairSeq:{},hpUnits:{}}};
 await f.api.finishWave(body);const original=structuredClone(f.transport.post.mock.calls[0][1]);
 const next=fixture(f.saved);next.setEconomy({...economy(),runEpoch:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'});next.transport.post.mockResolvedValueOnce({ok:false,status:401});await next.api.finishWave({...body,shipsSunk:2});
 expect(next.transport.post.mock.calls[0][1]).toEqual(original);
 const wrong=nativeFinish();wrong.completion.playerId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';next.transport.post.mockResolvedValueOnce({ok:true,data:wrong});
 expect((await next.api.finishWave(body)).ok).toBe(false);expect(next.saved.size).toBe(1);
 next.transport.post.mockResolvedValueOnce({ok:true,data:nativeFinish()});expect((await next.api.retryFinishes())[0].ok).toBe(true);expect(next.saved.size).toBe(0);expect(next.setter).not.toHaveBeenCalled();
});
it('fences actor changes while a native response is in flight without clearing the original intent',async()=>{
 const f=fixture();let release;f.transport.post.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const pending=f.api.startWave({where:'own'});
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'));f.setActor('dddddddd-dddd-4ddd-8ddd-dddddddddddd');release({ok:true,data:nativeWave()});
 expect((await pending).ok).toBe(false);expect(f.saved.size).toBe(1);expect(f.setter).not.toHaveBeenCalled();
});
it('binds recovery reads and commands to the immutable wave and forbids raw revival or client away',async()=>{
 const f=fixture();await f.api.currentWave({where:'own'});const recovery=f.api.recoveryTransport();f.transport.get.mockResolvedValue({ok:true,data:{headSeq:0,sealedThroughTick:10,events:[]}});
 await recovery.get(`/api/waves/${waveId}/events?after=0`);expect(f.transport.get.mock.calls.at(-1)[0]).toContain(`islandOwner=${actorId}`);
 const raw={waveProtocol:2,inputs:[{command:{type:'captain_move',x:0,z:0,away:true}}]};expect((await recovery.post(`/api/waves/${waveId}/inputs`,raw)).ok).toBe(false);
 raw.inputs[0].command={type:'captain_revive',targetId:actorId,x:0,z:0};expect((await recovery.post(`/api/waves/${waveId}/inputs`,raw)).ok).toBe(false);
 expect(f.transport.post).not.toHaveBeenCalled();f.setEconomy({...economy(),runEpoch:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'});
 expect((await recovery.get(`/api/waves/${waveId}/events?after=0`)).ok).toBe(false);expect(f.transport.get).toHaveBeenCalledTimes(2);
});
