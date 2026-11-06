// Public titles and draft rehearsal configuration only. No solution or reveal prose is stored here.
import {kits as displayKits} from '../shared/kits.js';
const rehearsalKits={
  true_keeper:{item:'Keeper’s permit',startPlace:'lighthouse_isle',startLabel:'Lighthouse Isle',coins:1000,card:'C6'},
  witness:{item:'Words through the door',startPlace:'saltreach_harbor',startLabel:'Saltreach Harbor',coins:1000,card:'C2'},
  informant:{item:'The fisherman’s red token',startPlace:'saltreach_harbor',startLabel:'Saltreach Harbor',coins:1000,card:'C4'},
  stranger:{item:'A face nobody knows',startPlace:'saltreach_harbor',startLabel:'Saltreach Harbor',coins:1600,card:'C5'},
};
export const kits=Object.fromEntries(Object.entries(rehearsalKits).map(([id,kit])=>[id,{...kit,...displayKits[id]}]));
export const npcKitOrder=['informant','stranger','true_keeper','witness'];
export const cardTitles={C1:'The reward notice',C2:'Fog nights only',C3:'The seal on your key',C4:'Sealed crates',C5:'Greyfathom’s manifest',C6:'The owner’s post',C7:'The coastguard night log',C8:'The torn page'};
export const suspectTitles={fisherman:'The fisherman in the yellow coat',salvage_foreman:'The salvage foreman',coastguard_commander:'The coastguard commander',harbor_master:'The harbor master'};
export const deductionData=[
  {id:'D1',title:'Where',cards:['C1','C2'],clears:[],opens:['Nightfall']},
  {id:'D2',title:'The seal',cards:['C3','C4'],clears:import.meta.env.DEV?['fisherman']:[],opens:['C5','C6']},
  {id:'D3',title:'The money',cards:['C5','C6'],clears:import.meta.env.DEV?['salvage_foreman']:[],opens:['C8']},
  {id:'D4',title:'The signal',cards:['C7','C8'],clears:import.meta.env.DEV?['coastguard_commander']:[],opens:['Accusation with D2, D3 and the schooner']},
];
