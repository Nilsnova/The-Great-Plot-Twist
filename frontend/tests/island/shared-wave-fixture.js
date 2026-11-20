// Synthetic native producer contract for strict frontend transport/replay tests.
import {economy,metadata,actorId,origin} from './shared-session-fixture.js';
export const waveId='99999999-9999-4999-8999-999999999999';
export const token='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export function nativeWave(){
 const startsAt='2026-11-19T00:00:00Z',weather={kind:'calm',label:'Calm',ships:1,fog:0};
 return {status:'started',waveId,place:'island',islandOwner:actorId,wave:1,seed:77,startsAt,minimumSeconds:1,maximumSeconds:900,countdownSeconds:0,
  weather,boss:false,flagship:false,rules:['structure_recovery'],repeat:false,historical:false,recoveryVersion:1,waveProtocol:2,
  initialSnapshot:{waveId,islandEpoch:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',economy:origin(),wave:1,seed:77,startsAt,
   recoveryVersion:1,waveProtocol:2,configVersion:1,weather:{ships:weather.ships,fog:weather.fog},weatherLabel:'Calm',rules:['structure_recovery'],rosterSize:1,
   participants:[{participantToken:token,captain:{level:1,skills:[],weapon:'musket'}}],
   captainInitialState:{[token]:{x:0,z:0,hpUnits:1000000,downAtTick:null,fallId:null,reviveBasisSeq:0}},
   createWave:{wave:1,seed:77,boss:false,weatherKind:weather.kind,weather:{ships:weather.ships,fog:weather.fog},defenses:[]},structures:[]},
  participantToken:token,lastActorCounter:0,economy:economy(),session:metadata().session,serverNow:startsAt,closed:false};
}
export function nativeFinish(){return {status:'done',waveId,outcome:'won',repeat:false,origin:origin(),economy:null,session:null,
 completion:{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',playerId:actorId,waveId,playedWave:1,outcome:'won',confirmedParticipation:true,
  engineerCommitmentId:null,accountId:origin().accountId,runEpoch:origin().runEpoch,
  terminalFingerprint:{mode:'island_shared',version:1,waveId,accountId:origin().accountId,runEpoch:origin().runEpoch,playedWave:1,outcome:'won',earnedBonuses:[]}}};}
