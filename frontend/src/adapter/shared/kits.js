// Public kit display names and portrait rules, shared by real and rehearsal projections.
export const kits=Object.freeze({
  true_keeper:Object.freeze({id:'true_keeper',name:'True Keeper',archetype:'navigator'}),
  witness:Object.freeze({id:'witness',name:'Witness',archetype:'cook'}),
  informant:Object.freeze({id:'informant',name:'Informant',archetype:'salvager'}),
  stranger:Object.freeze({id:'stranger',name:'Stranger',archetype:'deckhand'}),
});

export function kitDisplay(value){
  const id=typeof value==='string'?value:value?.id;
  const known=Object.hasOwn(kits,id)?kits[id]:null;
  const name=typeof value?.name==='string'?value.name:known?.name;
  return typeof id==='string'&&name?{id,name}:null;
}

export function kitArchetype(value){
  const id=typeof value==='string'?value:value?.id;
  return Object.hasOwn(kits,id)?kits[id].archetype:null;
}
