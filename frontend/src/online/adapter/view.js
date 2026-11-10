// Pure online projection: account, captain, live presence and the last notice. The case views left
// the browser on 10 Nov (D031); the shape is the disconnected adapter's, filled from server answers.
import {createUnavailableAdapter} from '../../adapter/unavailable.js';
import {mapAccount} from './account-view.js';

function emptyView(){
  const adapter=createUnavailableAdapter();
  const view=adapter.read();
  adapter.dispose();
  return view;
}

export function composeRealView(state={}){
  const view=emptyView();
  const account=mapAccount(state);
  const coins=account.state==='signed_in'&&Number.isFinite(state.me?.coins)?state.me.coins:null;
  return {...view,schema:1,mode:'online',revision:state.revision??0,now:state.now??0,account,
    captain:{name:account.captainName??'Captain pending',coins},presence:state.presence??view.presence,
    notice:state.notice?{reason:state.notice.reason??null,message:state.notice.message??''}:null};
}

export {mapAccount};
