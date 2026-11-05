// Standalone local adapter rehearsal; no WebGL, fetch, real account state or persisted progress.
import '../ui/kit/kit.css';
import '../ui/shell.css';
import '../screens/screens.css';
import {createFakeCaseAdapter} from './fake/index.js';
import {createCaseScreens} from '../screens/controller.js';
import {node,button} from '../screens/helpers.js';
const container=document.querySelector('#case-lab');container.className='case-lab';
if(!import.meta.env.DEV&&new URLSearchParams(location.search).get('demo')!=='1')container.append(node('p','','This local workshop requires ?demo=1.'));
else {
  const adapter=createFakeCaseAdapter(),screens=createCaseScreens({container,adapter,focus:()=>container.querySelector('button')?.focus()});
  const toolbar=node('nav','case-lab-toolbar');toolbar.setAttribute('aria-label','Local rehearsal controls');
  container.append(node('p','case-eyebrow','LOCAL FAKE · UNAPPROVED DRAFT DESIGN'),node('h1','','The case, on screen'),node('p','','A reusable adapter rehearsal. No server calls, saves or real rewards. The fake contains no reveal prose.'),toolbar,screens.arrival);
  for(const name of ['arrival','crew','board','search','partners','finale','accusation','reveal','relighting'])toolbar.append(button(name[0].toUpperCase()+name.slice(1),()=>screens.open(name)));
  toolbar.append(button('Advance 1 case minute',()=>adapter.dev.advance(60)),button('Reset local case',()=>{adapter.dev.reset();adapter.completeIntro({ending:'ending_rescue',actions:['warn_harbor','read_log']});}));
  adapter.completeIntro({ending:'ending_rescue',actions:['warn_harbor','read_log']});
  let frame,previous=performance.now();function tick(now){adapter.tick(Math.min(.1,(now-previous)/1000));previous=now;frame=requestAnimationFrame(tick);}frame=requestAnimationFrame(tick);
  if(import.meta.env.DEV)window.__caseLab={adapter,screens};
  if(import.meta.hot)import.meta.hot.dispose(()=>{cancelAnimationFrame(frame);screens.dispose();adapter.dispose();delete window.__caseLab;});
}
