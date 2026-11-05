// Local rehearsal accepts the sole uncleared suspect. No designated identity or reveal prose.
import {accept,refuse,effect} from './state.js';
import {deductionData,suspectTitles,cardTitles} from './data.js';
export const revealPlaceholder='[revealed by the server]';
export function accusationView(state){
  const evidence=deductionData.filter(d=>['D2','D3','D4'].includes(d.id)&&state.deductions.includes(d.id)).map(d=>({id:d.id,title:d.title,cards:d.cards.map(id=>({id,title:cardTitles[id]}))}));
  const cleared=new Set(deductionData.filter(d=>state.deductions.includes(d.id)).flatMap(d=>d.clears));
  return {aboard:state.aboard,schoonerFound:state.schooner,canBoard:state.schooner&&!state.aboard,allowed:state.aboard&&evidence.length===3&&!state.solved&&state.accuseWaitUntil<=state.now,
    status:state.solved?'The reveal is ready.':!state.schooner?'Find the schooner during the Night of Three Lights.':!state.aboard?'Board the schooner to speak to the masked captain.':evidence.length<3?'Bring D2, D3 and D4 from the Captain’s Table.':'Lay out your evidence and choose a suspect.',
    cooldown:Math.max(0,state.accuseWaitUntil-state.now),suspects:Object.entries(suspectTitles).map(([id,title])=>({id,title,cleared:cleared.has(id)})),evidence};
}
export function boardSchooner(state){if(!state.schooner)return refuse('schooner_required','The schooner is still beyond the fog.');if(state.aboard)return refuse('already_aboard','You are already aboard.');state.aboard=true;return accept('Aboard the schooner. The masked captain is at the wheel.');}
export function accuse(state,id){
  if(state.solved)return refuse('already_solved','The reveal is already available.');
  if(!state.aboard||!state.schooner)return refuse('schooner_required','Board the revealed schooner first.');
  if(!['D2','D3','D4'].every(id=>state.deductions.includes(id)))return refuse('evidence_required','The crew needs D2, D3 and D4.');
  if(state.accuseWaitUntil>state.now)return refuse('accusation_cooldown','Wait one minute before another accusation.');
  if(!Object.hasOwn(suspectTitles,id))return refuse('unknown_suspect','Choose one of the four suspects.');
  const cleared=new Set(deductionData.filter(d=>state.deductions.includes(d.id)).flatMap(d=>d.clears)),remaining=Object.keys(suspectTitles).filter(id=>!cleared.has(id));
  if(remaining.length!==1||id!==remaining[0]){state.accuseWaitUntil=state.now+60;return refuse('accusation_refused','The evidence does not support that accusation. Try again in one minute.');}
  state.solved=true;state.revealIndex=0;state.worldRelit=true;state.festivalUntil=state.now+172800;state.wall=[{name:state.captainName,order:1}];return accept('The reveal is ready.');
}
export function revealLines(state){
  const kitCites={true_keeper:['C7','C8'],witness:['C8'],informant:['C3','C4'],stranger:['C5','C6']};
  return [
    {id:'unmask',kind:'unmasking',title:'The mask falls',cites:['C1','C7']},
    {id:'twist',kind:'twist',title:'The turn',cites:['C1','C7','C8']},
    ...[['C1'],['C3','C4','C6'],['C7'],['C8']].map((cites,i)=>({id:`how_${i+1}`,kind:'evidence',title:'The evidence',cites})),
    {id:'kit',kind:'closing',title:'Your closing line',cites:kitCites[state.profile?.kitId]??[]},
    ...(state.profile?.readLog?[{id:'log',kind:'log',title:'The log reader',cites:['C8']}]:[]),
    {id:'last',kind:'last',title:'The last beat',cites:['C5']},
  ].map(line=>({...line,text:revealPlaceholder}));
}
export function revealView(state){const lines=state.solved?revealLines(state):[];return {available:state.solved,index:state.revealIndex,total:lines.length,line:lines[state.revealIndex]??null,done:state.solved&&state.revealIndex>=lines.length,canAdvance:state.solved&&state.revealIndex<lines.length,cards:Object.entries(cardTitles).map(([id,title])=>({id,title})),lines};}
export function nextReveal(state){
  if(!state.solved)return refuse('reveal_unavailable','Only an accepted accusation opens the reveal.');
  const lines=revealLines(state);if(state.revealIndex>=lines.length)return refuse('reveal_complete','The reveal has ended.');
  if(state.revealIndex===0)effect(state,'unmask'); // Anonymous unless a future authorised adapter supplies art.
  state.revealIndex++;
  if(state.revealIndex===lines.length){effect(state,'relighting');}
  return accept(state.revealIndex<lines.length?'Next line.':'The coast is relit.');
}
