// Bounded device hint preferences and display-only action filtering; the adapter supplies availability.
export function normalizeHintPreferences(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))value={};
  const dismissed=Array.isArray(value.dismissedHints)?[...new Set(value.dismissedHints.filter(id=>typeof id==='string'&&/^[a-z0-9_-]{1,64}$/.test(id)))].slice(0,100):[];
  return {hintsEnabled:value.hintsEnabled!==false,dismissedHints:dismissed};
}

export function dismissHint(value,id){
  const prefs=normalizeHintPreferences(value);
  if(typeof id!=='string'||!/^[a-z0-9_-]{1,64}$/.test(id))return prefs;
  return {...prefs,dismissedHints:[...prefs.dismissedHints.filter(item=>item!==id),id].slice(-100)};
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
