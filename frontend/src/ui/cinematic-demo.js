// Query-only visual rehearsal. It never supplies a reveal identity or changes world state.
import { cinematicNames } from '../world/cinematics/logic.js';
import { createPanel,createButton } from './kit/index.js';
import { node } from './kit/dom.js';
export function createCinematicDemo(container,world) {
  if(new URLSearchParams(location.search).get('demo')!=='1')return {dispose(){}};
  const body=node('div','cinematic-demo-body'),select=node('select'),label=node('label','','Visual beat');
  label.append(select);select.setAttribute('aria-label','Cinematic to rehearse');
  cinematicNames.forEach(name=>{const option=node('option','',name.replaceAll('_',' '));option.value=name;select.append(option);});
  const button=createButton({label:'Play visual',onClick:()=>world.cinematic(select.value)});body.append(label,button.element);
  const panel=createPanel({title:'Visual rehearsal',body});panel.element.classList.add('cinematic-demo');container.append(panel.element);
  return {dispose(){button.dispose();panel.dispose();}};
}
