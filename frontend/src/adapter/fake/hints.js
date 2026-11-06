// The fake supplies case-aware guidance and navigation choices; screens only display or filter it.
import {revealLines} from './reveal.js';
export function hintsView(state){
  const items=[{id:'captains-log',title:'Keep a record',body:'The Captain’s Log gathers your intro choices, crew cards and case notes.'}];
  const actions=[];
  if(!state.profile){
    actions.push({id:'finish-intro',label:'Continue your story',screen:'arrival',params:{},available:true,priority:10});
    return {items,actions};
  }
  if(!state.crew){
    actions.push({id:'form-crew',label:'Start or join a crew',screen:'crew',params:{},available:true,priority:10});
    return {items,actions};
  }
  if(state.crew.status!=='active'){
    actions.push({id:'muster-crew',label:'Muster the crew',screen:'crew',params:{},available:true,priority:10});
    return {items,actions};
  }
  if(state.solved){
    const done=state.revealIndex>=revealLines(state).length;
    actions.push({id:'read-reveal',label:done?'See the relit coast':'Read the reveal',screen:done?'relighting':'reveal',params:{},available:true,priority:10});
    return {items,actions};
  }
  if(state.schooner){
    items.push({id:'evidence-ready',title:'At the schooner',body:'The accusation screen shows the evidence your crew has recorded.'});
    actions.push({id:'open-accusation',label:'Review the evidence',screen:'accusation',params:{},available:true,priority:10});
    return {items,actions};
  }
  if(state.night?.phase==='night'){
    items.push({id:'night-posts',title:'Hold the lights',body:'The Night screen shows each post, its crew seat and any held beam.'});
    actions.push({id:'check-night',label:'Check the lights',screen:'finale',params:{},available:true,priority:10});
    return {items,actions};
  }
  items.push({id:'shared-board',title:'Share evidence',body:'The Captain’s Table records deductions supplied by the crew.'});
  actions.push({id:'review-board',label:'Review the Captain’s Table',screen:'board',params:{},available:true,priority:10});
  if(state.deductions.includes('D2'))actions.push({id:'open-c5-c6',label:'C5 and C6 are now open',screen:'search',params:{},available:true,priority:15});
  if(state.deductions.includes('D3'))actions.push({id:'open-c8',label:'C8 is now open at the watchtower',screen:'search',params:{spot:'watchtower_ruin'},available:true,priority:16});
  actions.push({id:'search-coast',label:'Search the coast',screen:'search',params:{},available:true,priority:20});
  if(state.crew.seats?.some(seat=>seat.kind==='npc'))actions.push({id:'order-partners',label:'Give partner orders',screen:'partners',params:{},available:true,priority:30});
  if(state.deductions?.includes('D1'))actions.push({id:'night-screen',label:'Open the Night screen',screen:'finale',params:{},available:true,priority:40});
  return {items,actions};
}
