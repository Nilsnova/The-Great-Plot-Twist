// Synthetic pure tests; accelerated ticks here are not provider or natural-clock evidence.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeWave,token} from '../tests/island/shared-wave-fixture.js';
import {createPersonalPlayout} from './economy-personal-playout.mjs';
test('headless product simulation refuses unsealed advancement and preserves natural results',()=>{
 const play=createPersonalPlayout(nativeWave());
 assert.throws(()=>play.advance(0),/sealed server prefix/);
 assert.ok(play.replay.addPage({headSeq:0,sealedThroughTick:10,events:[]}));
 assert.throws(()=>play.advance(11),/sealed server prefix/);
 assert.equal(play.driver.nextTick,0);play.advance(10);assert.equal(play.driver.nextTick,11);
 assert.ok(play.replay.addPage({headSeq:0,sealedThroughTick:18000,events:[]}));play.advance(18000);
 assert.equal(play.sim.done,true);assert.equal(typeof play.sim.result().survived,'boolean');
 assert.deepEqual(play.checkpoint('synthetic_checkpoint').hpUnits,{});
});
test('actual journal withdrawal is replayed into the frozen Captain without invented inputs',()=>{
 const play=createPersonalPlayout(nativeWave());
 assert.ok(play.replay.addPage({headSeq:1,sealedThroughTick:0,events:[{serverSeq:1,effectiveTick:0,
  type:'captain_withdrawn',participantToken:token,payload:{participantToken:token,reason:'leave'}}]}));
 play.advance(0);assert.equal(play.sim.state().party[0].withdrawn,true);
});
test('invalid or non-native snapshots fail before any playout',()=>{
 const wave=nativeWave();delete wave.initialSnapshot.captainInitialState;
 assert.throws(()=>createPersonalPlayout(wave),/real frozen native snapshot/);
});
