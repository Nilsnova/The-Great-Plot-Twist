// Client case intents. A real adapter can implement this surface without changing a screen.
export const caseMethods=['completeIntro','createCrew','joinCrew','muster','pin','pair','search','orderPartner','buildLight','callNightfall','takePost','aim','boardSchooner','accuse','nextReveal','claimLantern'];
export function bindCaseMethods(adapter,dispatch) {
  for(const name of caseMethods)adapter[name]=(...args)=>dispatch(name,args);
  return adapter;
}
export const copyView=value=>structuredClone(value);
