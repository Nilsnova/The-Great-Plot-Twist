// A quiet world hint. Explicit actions open existing UI; new snapshots never steal focus.
import './onboarding.css';
import {node,uniqueId} from '../../ui/kit/dom.js';
import {createOnboardingState} from './onboarding-state.js';

export function createOnboarding({container,preferences={},onPreferences,onAction,focus,delaySeconds=2}={}) {
  const element=node('aside','onboarding-tip'),heading=node('h3'),body=node('p'),actions=node('div','onboarding-actions');
  const open=node('button','onboarding-open'),dismiss=node('button','onboarding-dismiss','Dismiss');
  heading.id=uniqueId('onboarding');element.setAttribute('aria-labelledby',heading.id);
  body.setAttribute('role','status');body.setAttribute('aria-live','polite');body.setAttribute('aria-atomic','true');
  for(const button of [open,dismiss])button.type='button';
  actions.append(open,dismiss);element.append(heading,body,actions);element.hidden=true;
  container?.append(element);
  const state=createOnboardingState({preferences,onPreferences,delaySeconds});
  let disposed=false,shown=null,signature='';
  function render(){
    if(disposed)return;
    const next=state.read();shown=next;element.hidden=!next;
    if(!next)return;
    const key=JSON.stringify(next);
    if(key!==signature){
      signature=key;heading.textContent=next.title;body.textContent=next.body;open.textContent=next.label;
      dismiss.setAttribute('aria-label',`Dismiss tip · ${next.title}`);
    }
  }
  open.onclick=()=>{
    const selected=shown;if(disposed||!selected)return;
    state.dismiss();render();onAction?.(selected.action);
  };
  dismiss.onclick=()=>{
    if(disposed)return;const focused=element.contains(document.activeElement);
    state.dismiss();render();if(focused)focus?.();
  };
  return {element,get active(){return !disposed&&!element.hidden;},
    update(view,context){if(!disposed){state.update(view,context);render();}},
    tick(delta,context){if(!disposed){state.tick(delta,context);render();}},
    setPreferences(value){if(!disposed){state.setPreferences(value);render();}},
    dispose(){if(disposed)return;disposed=true;open.onclick=null;dismiss.onclick=null;shown=null;element.remove();},
  };
}
