// Safe disconnected adapter. No account, coin or progress is invented.
import {emptyExtensions} from './extensions.js';
import {bindAdapterMethods,copyView} from './contract.js';
export function createUnavailableAdapter({message='The online service is offline.'}={}){
  let disposed=false;
  const view={...emptyExtensions(),schema:1,mode:'unavailable',revision:0,now:0,
    captain:{name:'Captain pending',coins:null},notice:{reason:'not_connected',message}};
  const listeners=new Set();
  const read=()=>copyView(view);
  async function dispatch(){
    if(disposed)return {accepted:false,reason:'disposed',message:'This client has closed.',view:read()};
    return {accepted:false,reason:'not_connected',message:view.notice.message,view:read()};
  }
  return bindAdapterMethods({read,tick(){},
    subscribe(listener){if(!disposed)listeners.add(listener);return()=>listeners.delete(listener);},
    dispose(){disposed=true;listeners.clear();},
  },dispatch);
}
