// Renders only supplied hints and navigation actions; preferences are delegated to settings.
import './hints.css';
import {node} from '../../ui/kit/dom.js';
import {createButton} from '../../ui/kit/button.js';
import {dismissHint,filterHintActions,normalizeHintPreferences} from './logic.js';
import {onboardingHints} from './onboarding-logic.js';

export {filterHintActions,normalizeHintPreferences};
const screens=new Set(['arrival','crew','board','search','partners','finale','accusation','reveal','relighting','rewards','log','hints','bulletin']);
function equivalentOnboarding(action){
  if(action?.screen==='crew')return 'onboarding-crew';
  if(action?.screen==='board')return 'onboarding-pin';
  if(action?.screen==='finale'&&action.id==='next-build-station')return 'onboarding-station';
  return null;
}

export function createHints({navigate,preferences={},onPreferences,onboardingAction,readIntroComplete=()=>false}={}){
  const element=node('section','case-hints');element.setAttribute('aria-label','Case guidance');
  let model={items:[],actions:[]},fullView=null,prefs=normalizeHintPreferences(preferences),buttons=[];
  function addButton(parent,label,onClick,focus,ariaLabel){
    const component=createButton({label,onClick,variant:'quiet'});if(focus)component.element.dataset.focus=focus;
    if(ariaLabel)component.element.setAttribute('aria-label',ariaLabel);
    if(focus==='hints-toggle')component.element.setAttribute('aria-pressed',String(prefs.hintsEnabled));
    buttons.push(component);parent.append(component.element);
  }
  function persist(next){prefs=normalizeHintPreferences(next);onPreferences?.({...prefs,dismissedHints:[...prefs.dismissedHints]});render();}
  function equivalent(action){return fullView?.mode==='online'?equivalentOnboarding(action):null;}
  function dismiss(id,action){
    let next=dismissHint(prefs,id);const fixed=equivalent(action);
    if(fixed)next=dismissHint(next,fixed);
    persist(next);
  }
  function addAction(parent,action,matched){
    addButton(parent,action.label,()=>{
      const fixed=matched?equivalent(action):null;
      if(fixed&&!prefs.dismissedHints.includes(fixed))persist(dismissHint(prefs,fixed));
      navigate?.(action.screen,action.params);
    },`action-${action.id??action.screen}`);
  }
  function render(){
    const focusKey=element.contains(document.activeElement)?document.activeElement.dataset.focus:null;
    const actions=filterHintActions(model.actions).filter(action=>screens.has(action.screen));
    const supplied=Array.isArray(model.items)?model.items:[],attached=new Set();
    const matching=actions.filter(action=>supplied.some(hint=>hint?.id&&hint.id===action.id));
    const covered=new Set(matching.map(equivalent).filter(Boolean));
    buttons.forEach(item=>item.dispose());buttons=[];element.replaceChildren(node('h3','','What next?'));
    const toggle=node('div','case-hint-controls');addButton(toggle,prefs.hintsEnabled?'Hints on':'Hints off',()=>persist({...prefs,hintsEnabled:!prefs.hintsEnabled}),'hints-toggle');element.append(toggle);
    if(prefs.hintsEnabled){
      const dismissed=new Set(prefs.dismissedHints);
      const first=onboardingHints(fullView,{introComplete:readIntroComplete()}).find(hint=>!dismissed.has(hint.id)&&!covered.has(hint.id));
      const rendered=new Set();
      for(const hint of [...(first?[first]:[]),...supplied]){
        if(!hint?.id||dismissed.has(hint.id)||rendered.has(hint.id))continue;rendered.add(hint.id);
        const card=node('article','case-hint'),heading=node('h4','',hint.title??'Tip');card.append(heading,node('p','',hint.body??''));
        const controls=node('div','case-hint-controls'),action=matching.find(action=>action.id===hint.id);
        if(hint===first&&typeof onboardingAction==='function')addButton(controls,hint.label,()=>{
          persist(dismissHint(prefs,hint.id));onboardingAction(hint.action);
        },`onboarding-${hint.action}`);
        else if(action){addAction(controls,action,true);attached.add(action);}
        addButton(controls,'Dismiss tip',()=>dismiss(hint.id,action),`dismiss-${hint.id}`,`Dismiss tip · ${hint.title??'Tip'}`);
        card.append(controls);element.append(card);
      }
    }else element.append(node('p','case-hint-empty','First-time hints are off for this device.'));
    const remaining=actions.filter(action=>!attached.has(action)),list=node('div','case-hint-actions');
    for(const action of remaining)addAction(list,action,matching.includes(action));
    if(remaining.length)element.append(list);else if(!actions.length)element.append(node('p','case-hint-empty','No next step is available right now.'));

    if(focusKey){const target=[...element.querySelectorAll('[data-focus]')].find(item=>item.dataset.focus===focusKey&&!item.disabled);(target??element.querySelector('button:not(:disabled)'))?.focus({preventScroll:true});}
  }
  function update(view){fullView=view?.account?view:null;model=view?.hints??view??{items:[],actions:[]};render();}
  function dispose(){buttons.forEach(item=>item.dispose());buttons=[];element.remove();}
  render();
  return {element,update,setPreferences(value){prefs=normalizeHintPreferences(value);render();},dispose};
}
