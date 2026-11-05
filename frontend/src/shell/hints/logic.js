// Local hint preferences and display-only action filtering; case availability stays in the fake.
export function normalizeHintPreferences(value={}){
  const dismissed=Array.isArray(value.dismissedHints)?[...new Set(value.dismissedHints.filter(id=>typeof id==='string'))].slice(0,100):[];
  return {hintsEnabled:value.hintsEnabled!==false,dismissedHints:dismissed};
}

export function filterHintActions(actions=[]){
  const seenIds=new Set(),seenDestinations=new Set(),result=[];
  for(const action of Array.isArray(actions)?actions:[]){
    if(action?.available!==true||typeof action.label!=='string'||typeof action.screen!=='string')continue;
    const destination=`${action.screen}:${JSON.stringify(action.params??{})}`;
    if(seenIds.has(action.id)||seenDestinations.has(destination))continue;
    if(action.id)seenIds.add(action.id);seenDestinations.add(destination);result.push(action);
  }
  return result;
}
