// Headless production simulation over actual sealed journal pages; never creates combat facts.
import assert from 'node:assert/strict';
import {createWave} from '../src/pirates/sim.js';
import {readRules} from '../src/pirates/wave-rules.js';
import {eventFor} from '../src/pirates/wave-events.js';
import {waveGapMs} from '../src/net/live-rules.js';
import {readRecoverySnapshot,recoveryWaveDefenses} from '../src/pirates/recovery-snapshot.js';
import {createWaveReplay,createReplayDriver} from '../src/pirates/wave-replay.js';
import {simulationInputFromJournal} from '../src/pirates/recovery-transport.js';

export function createPersonalPlayout(wave){
 const snapshot=readRecoverySnapshot(wave.initialSnapshot,wave.waveId);
 assert.ok(snapshot?.economy&&snapshot.captainInitialState,'A real frozen native snapshot is required');
 const rules=readRules(snapshot.rules);
 const defenses=recoveryWaveDefenses(snapshot).filter(row=>row.kind!=='culverin'||rules.defensesV2);
 const sim=createWave({...snapshot.createWave,seed:snapshot.seed,wave:wave.wave,
  weather:snapshot.createWave.weather??snapshot.weather,flagship:snapshot.createWave.flagship??wave.flagship,
  defenses,countdown:0,...(snapshot.createWave.boss!==undefined?{}:{boss:wave.boss}),
  event:snapshot.createWave.event??eventFor(wave.wave,wave.seed,{flagship:wave.flagship}),
  finishers:true,finisherPreparation:true,gapMs:waveGapMs,...rules,
  recoveryStructures:snapshot.structures,towerHealth:true,recoveryVersion:1,waveProtocol:2,
  canonicalCaptains:snapshot.captainInitialState,
  canonicalLoadouts:Object.fromEntries(snapshot.participants.map(row=>[row.participantToken,row.captain]))});
 const replay=createWaveReplay(),driver=createReplayDriver(replay);
 return {sim,replay,driver,snapshot,
  advance(through){
   assert.ok(replay.canAdvanceThrough(through),'Cannot simulate beyond a complete sealed server prefix');
   while(driver.nextTick<=through&&!sim.done){const tick=driver.nextTick;
    assert.ok(driver.advanceThrough(tick,(_tick,journal)=>sim.step(.05,journal.map(simulationInputFromJournal).filter(Boolean))));}
  },
  checkpoint(checkpointUid){
   assert.ok(driver.nextTick>0&&driver.nextTick-1<=replay.sealedThroughTick);
   const vector=sim.recoveryHealthVector();assert.ok(vector);
   return {islandEpoch:snapshot.islandEpoch,checkpointUid,throughTick:driver.nextTick-1,
    inputHeadSeq:replay.headSeq,lastRepairSeq:0,...vector};
  }};
}
