// Native wave and own completion facts; frozen provenance never supplies fresh controller authority.
import {sameEconomyScope} from './economy-view.js';
import {uuid} from './shared-quotes.js';
import {sessionOrigin,readSessionMetadata} from './shared-session-shapes.js';
import {readRecoverySnapshot} from '../pirates/recovery-snapshot.js';
const count=value=>Number.isSafeInteger(value) && value>=0;
const date=value=>typeof value==='string' && Number.isFinite(Date.parse(value));
const exact=(value,keys)=>value && typeof value==='object' && !Array.isArray(value)
 && Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));
const originKeys=['mode','version','islandOwner','accountId','runEpoch'];
export const nativeOrigin=value=>exact(value,originKeys)?sessionOrigin(value):null;
const canonical=value=>Array.isArray(value)?value.map(canonical):value && typeof value==='object'
 ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export function sameFrozenNativeWave(previous,next){
 const before=nativeOrigin(previous?.initialSnapshot?.economy),after=nativeOrigin(next?.initialSnapshot?.economy);
 return !!before && !!after && previous.waveId===next.waveId && sameEconomyScope(before,after)
  && JSON.stringify(canonical(previous.initialSnapshot))===JSON.stringify(canonical(next.initialSnapshot));
}
export function validInitialCaptains(snapshot){
 const tokens=snapshot?.participants?.map(row=>row.participantToken),initial=snapshot?.captainInitialState;
 return !!tokens && exact(initial,tokens) && tokens.every(token=>{
  const row=initial[token];return exact(row,['x','z','hpUnits','downAtTick','fallId','reviveBasisSeq'])
   && row.x===0 && row.z===0 && row.hpUnits===1000000 && row.downAtTick===null && row.fallId===null && row.reviveBasisSeq===0;
 });
}
function projection(value,record){
 if(value.economy===null || value.session===null)return value.economy===null && value.session===null;
 const current=readSessionMetadata({status:'done',economy:value.economy,session:value.session});
 return !!current && sameEconomyScope(current.economy,record.origin) && (!current.session.isController
  || current.session.sessionId===record.sessionId && current.session.connectionGeneration===record.connectionGeneration);
}
export function readNativeWave(value,record){
 const snapshot=readRecoverySnapshot(value?.initialSnapshot,value?.waveId),origin=nativeOrigin(snapshot?.economy);
 if(value?.status!=='started' || !uuid(value.waveId) || value.place!=='island' || !origin || !sameEconomyScope(origin,record.origin)
  || value.islandOwner!==origin.islandOwner || value.recoveryVersion!==1 || value.waveProtocol!==2 || value.flagship!==false
  || typeof value.boss!=='boolean' || typeof value.repeat!=='boolean' || typeof value.historical!=='boolean' || typeof value.closed!=='boolean'
  || !count(value.wave) || value.wave<1 || !count(value.seed) || !date(value.startsAt) || !date(value.serverNow)
  || !count(value.minimumSeconds) || !count(value.maximumSeconds) || value.maximumSeconds<1
  || !count(value.countdownSeconds) || value.countdownSeconds>60 || !snapshot || snapshot.wave!==value.wave
  || snapshot.seed!==value.seed || Date.parse(snapshot.startsAt)!==Date.parse(value.startsAt) || snapshot.createWave.wave!==value.wave || snapshot.createWave.seed!==value.seed
  || snapshot.createWave.boss!==value.boss || snapshot.rosterSize!==snapshot.participants.length || !validInitialCaptains(snapshot)
  || !Array.isArray(value.rules) || value.rules.some(rule=>typeof rule!=='string') || JSON.stringify(value.rules)!==JSON.stringify(snapshot.rules)
  || !value.weather || typeof value.weather.kind!=='string' || !value.weather.kind || typeof value.weather.label!=='string'
  || !Number.isFinite(value.weather.ships) || value.weather.ships<0 || !Number.isFinite(value.weather.fog) || value.weather.fog<0 || value.weather.fog>1
  || snapshot.weatherLabel!==value.weather.label || snapshot.createWave.weatherKind!==value.weather.kind
  || Object.hasOwn(snapshot.weather,'kind') && snapshot.weather.kind!==value.weather.kind
  || !['ships','fog'].every(key=>snapshot.weather[key]===value.weather[key])
  || !projection(value,record))return null;
 if(value.historical && (!value.repeat || value.economy!==null || value.session!==null || value.participantToken!==null || value.lastActorCounter!==null))return null;
 const controller=value.session?.isController===true;
 if(controller ? value.closed || !snapshot.participants.some(row=>row.participantToken===value.participantToken) || !count(value.lastActorCounter)
  : value.participantToken!==null || value.lastActorCounter!==null)return null;
 return {...value,initialSnapshot:snapshot};
}
const outcomes=['won','lost','abandoned','expired'];
export function readNativeFinish(value,record,waveId){
 const receipt=value?.completion,terminal=receipt?.terminalFingerprint,origin=nativeOrigin(value?.origin);
 if(value?.status!=='done' || value.waveId!==waveId || !outcomes.includes(value.outcome) || typeof value.repeat!=='boolean'
  || !origin || !sameEconomyScope(origin,record.origin) || !uuid(receipt?.id) || receipt.playerId!==record.actorId
  || receipt.waveId!==waveId || !count(receipt.playedWave) || receipt.playedWave<1 || receipt.outcome!==value.outcome
  || typeof receipt.confirmedParticipation!=='boolean' || receipt.engineerCommitmentId!==null && !uuid(receipt.engineerCommitmentId)
  || receipt.accountId!==origin.accountId || receipt.runEpoch!==origin.runEpoch
  || terminal?.mode!=='island_shared' || terminal.version!==1 || !['waveId','accountId','runEpoch','playedWave','outcome'].every(key=>terminal[key]===receipt[key])
  || !Array.isArray(terminal.earnedBonuses) || new Set(terminal.earnedBonuses).size!==terminal.earnedBonuses.length
  || terminal.earnedBonuses.some(kind=>!['galleon','finisher'].includes(kind)) || !projection(value,record))return null;
 return value;
}
