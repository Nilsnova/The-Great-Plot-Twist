// Renders only supplied hints and navigation actions; preferences are delegated to settings.
import './hints.css';
import {node} from '../../ui/kit/dom.js';
import {createButton} from '../../ui/kit/button.js';
import {filterHintActions,normalizeHintPreferences} from './logic.js';

export {filterHintActions,normalizeHintPreferences};

export function createHints({navigate,preferences={},onPreferences}={}){
  const element=node('section','case-hints');element.setAttribute('aria-label','Case guidance');
  let model={items:[],actions:[]},prefs=normalizeHintPreferences(preferences),buttons=[];
  function addButton(parent,label,onClick,focus){
    const component=createButton({label,onClick,variant:'quiet'});if(focus)component.element.dataset.focus=focus;
    if(focus?.startsWith('dismiss-'))component.element.setAttribute('aria-label',`Dismiss tip · ${parent.querySelector('h4')?.textContent??focus}`);
    if(focus==='hints-toggle')component.element.setAttribute('aria-pressed',String(prefs.hintsEnabled));
    buttons.push(component);parent.append(component.element);
  }
  function persist(next){prefs=normalizeHintPreferences(next);onPreferences?.({...prefs,dismissedHints:[...prefs.dismissedHints]});render();}
  function render(){
    const focusKey=element.contains(document.activeElement)?document.activeElement.dataset.focus:null;
    buttons.forEach(item=>item.dispose());buttons=[];element.replaceChildren(node('h3','','What next?'));
    const toggle=node('div','case-hint-controls');addButton(toggle,prefs.hintsEnabled?'Hints on':'Hints off',()=>persist({...prefs,hintsEnabled:!prefs.hintsEnabled}),'hints-toggle');element.append(toggle);
    if(prefs.hintsEnabled){
      const dismissed=new Set(prefs.dismissedHints);
      for(const hint of model.items??[]){
        if(!hint?.id||dismissed.has(hint.id))continue;
        const card=node('article','case-hint'),heading=node('h4','',hint.title??'Tip');card.append(heading,node('p','',hint.body??''));
        addButton(card,'Dismiss tip',()=>persist({...prefs,dismissedHints:[...prefs.dismissedHints,hint.id]}),`dismiss-${hint.id}`);element.append(card);
      }
    }else element.append(node('p','case-hint-empty','First-time hints are off for this device.'));
      const actions=filterHintActions(model.actions),list=node('div','case-hint-actions');
      for(const action of actions)addButton(list,action.label,()=>navigate?.(action.screen,action.params),`action-${action.id??action.screen}`);
      if(actions.length)element.append(list);else element.append(node('p','case-hint-empty','No next step is available right now.'));

    if(focusKey){const target=[...element.querySelectorAll('[data-focus]')].find(item=>item.dataset.focus===focusKey&&!item.disabled);(target??element.querySelector('button:not(:disabled)'))?.focus({preventScroll:true});}
  }
  function update(view){model=view?.hints??view??{items:[],actions:[]};render();}
  function dispose(){buttons.forEach(item=>item.dispose());buttons=[];element.remove();}
  render();
  return {element,update,setPreferences(value){prefs=normalizeHintPreferences(value);render();},dispose};
}
