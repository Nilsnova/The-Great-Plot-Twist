// Client intents. A real adapter can implement this surface without changing a screen.
// The case intents and views left the browser on 10 Nov 2026 (D031); new features add theirs here.
export const adapterMethods=['reportPosition','setEmote','signIn','signOut','rerollName','deleteMyData'];
export function bindAdapterMethods(adapter,dispatch) {
  for(const name of adapterMethods)adapter[name]=(...args)=>dispatch(name,args);
  return adapter;
}
export const copyView=value=>structuredClone(value);

// Schema 1 view. Real adapters return every key, even when disconnected; a status or empty value tells
// the screen what to show. captain.coins is null until a signed-in account read answers.
export const viewKeys = ['schema','mode','revision','now','captain','account','presence','notice'];
export {adapterReasons} from './reasons.js';
