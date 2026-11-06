// One composition point for Claude's real adapter. Local rehearsal stays explicit and network-free.
import {createUnavailableCaseAdapter} from './unavailable.js';
import {introJournal} from '../story/intro-journal.js';
export async function createClientAdapter(){
  const query=new URLSearchParams(location.search);
  const local=query.get('case')==='local'&&(import.meta.env.DEV||query.get('demo')==='1');
  if(!local)return createUnavailableCaseAdapter();
  let localActions=null;
  try{
    const saved=JSON.parse(introJournal().read());
    if(saved?.version===1&&Array.isArray(saved.actions)&&saved.actions.every(id=>typeof id==='string'))localActions=saved.actions;
  }catch{/* An invalid convenience save never blocks the title. */}
  const {createFakeCaseAdapter}=await import('./fake/index.js');
  return createFakeCaseAdapter({localActions});
}
