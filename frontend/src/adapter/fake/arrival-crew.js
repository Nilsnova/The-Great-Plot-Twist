// Fake-only referee and crew rules. Screens send intents and never infer these results.
import {kits,npcKitOrder} from './data.js';
import {accept,refuse} from './state.js';
export function completeIntro(state,receipt={}) {
  if(state.profile)return accept('Your local rehearsal profile is already recorded.');
  if(!['ending_rescue','ending_trapped'].includes(receipt.ending)||!Array.isArray(receipt.actions))return refuse('intro_incomplete','Finish the original intro before requesting a kit.');
  const actions=receipt.actions;
  const kitId=receipt.ending==='ending_rescue'?'true_keeper':actions.includes('warn_harbor')?'witness':actions.includes('trust_fisherman')?'informant':'stranger';
  state.profile={ending:receipt.ending,kitId,readLog:actions.includes('read_log')};state.coins=kits[kitId].coins;
  if(kitId==='witness')state.found[1].push('C2');return accept('Your kit is ready in the local rehearsal.');
}
const emptySeat=seat=>({seat,kind:'open',name:'Open seat',kitId:null});
export function createCrew(state) {
  if(!state.profile)return refuse('kit_required','The referee must confirm a kit first.');
  if(state.crew)return refuse('already_in_crew','You already have a crew.');
  state.crew={id:'local-crew',code:'TIDE7K',status:'forming',seats:[{seat:1,kind:'player',name:state.captainName,kitId:state.profile.kitId,isYou:true},...Array.from({length:3},(_,i)=>emptySeat(i+2))]};
  return accept('Crew created. Share the code or muster with NPC partners.');
}
export function muster(state) {
  if(!state.crew)return refuse('crew_required','Start or join a crew first.');
  const covered=new Set(state.crew.seats.filter(seat=>seat.kitId).map(seat=>seat.kitId));
  state.crew.seats=state.crew.seats.map(seat=>{if(seat.kind!=='open')return seat;const kitId=npcKitOrder.find(id=>!covered.has(id));covered.add(kitId);if(kitId==='witness')state.found[seat.seat]=['C2'];return {...seat,kind:'npc',kitId,name:`${kits[kitId].archetype[0].toUpperCase()+kits[kitId].archetype.slice(1)} partner`,archetype:kits[kitId].archetype};});
  state.crew.status='active';return accept('Four seats mustered. The case clock is running.');
}
export function joinCrew(state,code,{confirm=false}={}) {
  if(state.joinWaitUntil&&state.lobbyNow>=state.joinWaitUntil){state.joinAttempts=0;state.joinWaitUntil=0;}
  if(state.lobbyNow<state.joinWaitUntil)return refuse('too_many_tries','Too many tries. Please wait one minute before trying another code.');
  if(!state.profile)return refuse('kit_required','The referee must confirm a kit first.');
  if(state.crew)return refuse('already_in_crew','You already have a crew.');
  if(String(code).trim().toUpperCase()!=='LANTERN') {state.joinAttempts++;if(state.joinAttempts>=3)state.joinWaitUntil=state.lobbyNow+60;return refuse(state.joinAttempts>=3?'too_many_tries':'wrong_code',state.joinAttempts>=3?'Too many tries. Please wait one minute.':'That crew code was not found. Check it and try again.');}
  if(!confirm){state.joinPreview={code:'LANTERN',seat:2,replaces:'Open seat',message:'You will join seat 2 with your own kit.'};return accept('Check your seat before joining.');}
  state.crew={id:'local-joined',code:'LANTERN',status:'forming',seats:[{seat:1,kind:'player',name:'Captain Shoal',kitId:'true_keeper'},{seat:2,kind:'player',name:state.captainName,kitId:state.profile.kitId,isYou:true},emptySeat(3),emptySeat(4)]};
  state.found[2]=state.found[1];state.found[1]=[];state.joinPreview=null;return accept('You joined the crew.');
}
