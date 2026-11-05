// Query-only presenter fixtures. Never called by a player screen or a real adapter.
import {initialCaseState} from './state.js';
import {completeIntro,createCrew,muster} from './arrival-crew.js';
import {pinCard,pairCards} from './board.js';
import {buildLight,callNightfall,takePost,aim,lightLocations,rehearsalGlow} from './night.js';
import {orderPartner} from './partners.js';
import {settleJobs} from './settle.js';
import {bearingBetween} from '../../screens/beam-math.js';
export function rehearse(state,stage){
  if(stage==='board'){
    Object.assign(state,initialCaseState());completeIntro(state,{ending:'ending_rescue',actions:['read_log']});createCrew(state);muster(state);
    state.found[1].push('C1');state.found[2].push('C2');pinCard(state,'C1',1);pinCard(state,'C2',2,1);pairCards(state,'C1','C2');
  }
  if(stage==='finale'){
    if(!state.deductions.includes('D1'))rehearse(state,'board');buildLight(state,'islet_signal_station');settleJobs(state);callNightfall(state);orderPartner(state,2,'man_light','keepers_lamp');orderPartner(state,3,'man_light','harbor_light');takePost(state,'islet_signal_station');state.now+=600;settleJobs(state);
  }
  if(stage==='lock')for(const light of lightLocations.slice(0,3))aim(state,light.id,bearingBetween(light,rehearsalGlow));
  if(stage==='relighting'){state.worldRelit=true;state.festivalUntil=(state.worldNow??state.now)+172800;state.wall=[{name:state.captainName,order:1}];}
  // The tour cannot accuse, solve, expose reveal lines or supply reveal art.
  state.revision++;
}
