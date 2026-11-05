// Public titles and draft rehearsal configuration only. No solution or reveal prose is stored here.
export const kits={
  true_keeper:{id:'true_keeper',name:'True Keeper',item:'Keeper’s permit',startPlace:'lighthouse_isle',startLabel:'Lighthouse Isle',coins:1000,card:'C6',archetype:'navigator'},
  witness:{id:'witness',name:'Witness',item:'Words through the door',startPlace:'saltreach_harbor',startLabel:'Saltreach Harbor',coins:1000,card:'C2',archetype:'cook'},
  informant:{id:'informant',name:'Informant',item:'The fisherman’s red token',startPlace:'saltreach_harbor',startLabel:'Saltreach Harbor',coins:1000,card:'C4',archetype:'salvager'},
  stranger:{id:'stranger',name:'Stranger',item:'A face nobody knows',startPlace:'saltreach_harbor',startLabel:'Saltreach Harbor',coins:1600,card:'C5',archetype:'deckhand'},
};
export const npcKitOrder=['informant','stranger','true_keeper','witness'];
export const cardTitles={C1:'The reward notice',C2:'Fog nights only',C3:'The seal on your key',C4:'Sealed crates',C5:'Greyfathom’s manifest',C6:'The owner’s post',C7:'The coastguard night log',C8:'The torn page'};
export const suspectTitles={fisherman:'The fisherman in the yellow coat',salvage_foreman:'The salvage foreman',coastguard_commander:'The coastguard commander',harbor_master:'The harbor master'};
export const deductionData=[
  {id:'D1',title:'Where',cards:['C1','C2'],clears:[],opens:['Nightfall']},
  {id:'D2',title:'The seal',cards:['C3','C4'],clears:['fisherman'],opens:['C5','C6']},
  {id:'D3',title:'The money',cards:['C5','C6'],clears:['salvage_foreman'],opens:['C8']},
  {id:'D4',title:'The signal',cards:['C7','C8'],clears:['coastguard_commander'],opens:['Accusation with D2, D3 and the schooner']},
];
