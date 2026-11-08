// Cosmetic transition memory. The first accepted snapshot seeds each private case scope.
// IDs are lifetime-monotonic because the bridge retains its high-water mark across accounts.
export function createCaseEffects() {
  let owner=null,caseKey=null,previous=null,nextId=0,disposed=false;
  const effect=(name,params={})=>({id:++nextId,type:'cinematic',name,params:structuredClone(params)});
  function reset(){owner=null;caseKey=null;previous=null;}
  function update(snapshot,{scope=null,world=null}={}) {
    if (disposed) return [];
    const key=snapshot?`${snapshot.crew.id}:${snapshot.caseId}`:null;
    const current={parted:snapshot?.finale.parted??null,revealed:snapshot?.reveal.available===true,relit:world===null?null:world.lightsOn===true};
    if (!snapshot || scope===null) {reset();return [];}
    if (owner!==scope || caseKey!==key || !previous) {owner=scope;caseKey=key;previous=structuredClone(current);return [];}
    const effects=[];
    if (!previous.parted && current.parted) {
      const params={lights:current.parted.lights,target:current.parted.target};
      effects.push(effect('three_lights',params),effect('fog_lift',params),effect('schooner_reveal',params));
    }
    if (!previous.revealed && current.revealed) effects.push(effect('unmask'));
    if (previous.relit===false && current.relit===true) effects.push(effect('relighting'));
    // Completed transitions remain seen within this scope even if a later stale read regresses.
    previous={parted:previous.parted??structuredClone(current.parted),revealed:previous.revealed||current.revealed,
      relit:previous.relit===true||current.relit===true?true:current.relit??previous.relit};
    return effects;
  }
  return {update,reset,dispose(){disposed=true;reset();}};
}
