// Client case intents. A real adapter can implement this surface without changing a screen.
export const caseMethods=['completeIntro','createCrew','joinCrew','muster','pin','pair','search','inspectSpot','orderPartner','buildLight','callNightfall','takePost','aim','boardSchooner','accuse','nextReveal','claimLantern',
  'reportPosition','setEmote','signIn','signOut','rerollName','deleteMyData','resolveSaveConflict','continueGame'];
export function bindCaseMethods(adapter,dispatch) {
  for(const name of caseMethods)adapter[name]=(...args)=>dispatch(name,args);
  return adapter;
}
export const copyView=value=>structuredClone(value);

// Additive G7 view parts retain schema 1. Real adapters return every key, even when disconnected.
export const caseViewKeys = [
  'schema','mode','revision','now','captain','arrival','crew','permissions','board','search',
  'partners','finale','accusation','reveal','world','notice','effects',
  'presence','account','rewards','log','hints','continuation','bulletin',
];
export {caseReasons} from './reasons.js';
