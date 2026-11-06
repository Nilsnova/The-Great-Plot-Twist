// A bounded memory-only list of semantic UI actions, used by the issue-draft link.
import {allowedUiActions} from './ui-actions.js';
export function createUiTrace(){
  let actions=[];
  return {record(action){if(allowedUiActions.has(action))actions=[...actions,action].slice(-10);},
    read(){return [...actions];},clear(){actions=[];}};
}
