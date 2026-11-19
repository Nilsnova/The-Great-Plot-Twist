// Canonical grace uses trusted journal lifecycle; legacy presence still expires by its original rule.
import {it,expect} from 'vitest';
import {createWave} from '../../src/pirates/sim.js';
import {simulationInputFromJournal,commandForJournal} from '../../src/pirates/recovery-transport.js';
import {nativeWave,token} from '../island/shared-wave-fixture.js';
it('seeds the entire frozen party and keeps an idle native Captain present beyond the old eight-second window',()=>{
 const snapshot=nativeWave().initialSnapshot,sim=createWave({...snapshot.createWave,recoveryVersion:1,waveProtocol:2,canonicalCaptains:snapshot.captainInitialState});
 expect(sim.state().party).toMatchObject([{id:token,hp:100,present:true}]);
 for(let tick=0;tick<190;tick++)sim.step(.05);expect(sim.state().party[0].present).toBe(true);
});
it('withdraws only at the trusted event tick and never resurrects from a future accepted old move',()=>{
 const snapshot=nativeWave().initialSnapshot,sim=createWave({...snapshot.createWave,recoveryVersion:1,waveProtocol:2,canonicalCaptains:snapshot.captainInitialState});
 const event={serverSeq:1,effectiveTick:2,type:'captain_withdrawn',participantToken:token,payload:{participantToken:token,reason:'disconnect_expired'}};
 expect(commandForJournal({type:'captain_withdrawn',by:token})).toBeNull();
 sim.step(.05);sim.step(.05);expect(sim.state().party[0].present).toBe(true);sim.step(.05,[simulationInputFromJournal(event)]);
 sim.step(.05,[{type:'captain_move',by:token,x:3,z:4}]);expect(sim.state().party[0]).toMatchObject({present:false,x:0,z:0,withdrawn:true});
});
it('rejects forged lifecycle payload identity and retains legacy idle expiry',()=>{
 const event={serverSeq:1,effectiveTick:2,type:'captain_withdrawn',participantToken:token,payload:{participantToken:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',reason:'leave'}};
 expect(simulationInputFromJournal(event)).toBeNull();
 const legacy=createWave({seed:1,wave:1});legacy.step(.05,[{type:'captain_move',by:'legacy',x:0,z:0}]);for(let tick=0;tick<190;tick++)legacy.step(.05);
 expect(legacy.state().party[0].present).toBe(false);
});
