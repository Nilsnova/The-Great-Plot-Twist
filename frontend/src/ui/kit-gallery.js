// Fictional component demonstrations. This page contains no case data or trading rules.
import './kit/kit.css';
import './kit-gallery.css';
import * as kit from './kit/index.js';
import { node } from './kit/dom.js';
const root = document.querySelector('#kit-gallery'), header = node('header','kit-gallery-header'), grid = node('div','kit-gallery-grid');
header.append(node('p','','THE GREAT PLOT TWIST / REUSABLE PIXEL UI'),node('h1','','A kit for every coastal story.'));
const link = node('a','','Explore the Saltreach Isles ↗'); link.href='./'; header.append(link); root.append(header,grid);
const components = [], toast = kit.createToast(); toast.element.classList.add('kit-gallery-toast'); document.body.append(toast.element); components.push(toast);
function showcase(title, component, wide = false) {
  const panel = kit.createPanel({title,body:component.element}); if (wide) panel.element.classList.add('kit-gallery-wide');
  grid.append(panel.element); components.push(component,panel); return panel.body;
}
const hud = kit.createHudBar({coins:1240,place:'Saltreach Harbor',weather:'fog',time:'19:42',seats:[{name:'Captain',kind:'player'},{name:'Navigator',kind:'npc'},{name:'Cook',kind:'npc'},{name:'Salvager',kind:'npc'}]});
showcase('01 / Captain status',hud,true);
const actions = node('div','kit-gallery-actions');
const modal = kit.createModal({title:'A quiet moment at the harbor',body:'This reusable modal restores focus to its opening button. Escape closes it.'}); components.push(modal);
for (const options of [{label:'Open a panel',onClick:()=>modal.open()}, {label:'Show a toast',variant:'quiet',onClick:()=>toast.show('Your field notes are ready.')}, {label:'Unavailable',disabled:true}]) { const button=kit.createButton(options); actions.append(button.element); components.push(button); }
const icon = kit.createIconButton({label:'Inspect field notes',icon:'✦',onClick:()=>toast.show('An icon button still has a spoken action name.')}); actions.append(icon.element); components.push(icon);
showcase('02 / Actions & modal',{element:actions,dispose(){} });
const progress = kit.createProgress({label:'Reading the coast',value:6,max:10}); showcase('03 / Progress',progress);
const tabs = kit.createTabs({items:[{id:'notes',label:'Notes',body:'The path turns toward the water. No case solution is stored in these samples.'},{id:'inventory',label:'Inventory',body:'A compass, a pencil and an empty notebook.'},{id:'crew',label:'Crew',body:'Player and NPC partner seats use the same component.'}]}); showcase('04 / Tabs',tabs);
const table = kit.createTable({caption:'Fictional sample records',columns:[{key:'name',label:'Record'},{key:'value',label:'Value'},{key:'state',label:'Status'}],rows:[{name:'Coastal basket',value:'128',state:'Sample'},{name:'Harbor basket',value:'96',state:'Sample'}]}); showcase('05 / Table',table);
let line = 0;
const lines = ['The tide has left a line of shells beside the jetty. There is time to look around before the next ferry.','You turn the notebook to a clean page. The sea carries on with its own story.'];
const dialogue = kit.createDialogue({speaker:'Field notes',text:lines[0],portrait:{src:`${import.meta.env.BASE_URL}pixel/explorer.png`,alt:'An explorer in a coastal coat'},choices:[{id:'look',label:'Look toward the jetty'},{id:'continue',label:'Turn the page'}],onChoice:()=>{line=1-line;dialogue.update({speaker:'Field notes',text:lines[line],portrait:{src:`${import.meta.env.BASE_URL}pixel/explorer.png`,alt:'An explorer'},choices:[{id:'look',label:'Look toward the jetty'},{id:'continue',label:'Turn the page'}]});dialogue.focus();}});
showcase('06 / Dialogue · Enter skips, 1 to 9 choose',dialogue,true);
const cards = node('div','kit-gallery-cards');
for (const state of ['new','pinned','used']) {
  const card = kit.createClueCard({title:'A page from the coast',body:'Sample clue text supplied by the story team. The frame shows its state without deciding any deduction.',state,onPin:()=>toast.show('Pin intent received. The board owner supplies the next state.')}); cards.append(card.element); components.push(card);
}
showcase('07 / Clue-card states',{element:cards,dispose(){}},true);
const chart = kit.createMiniChart({label:'Island Exchange · fictional sample',values:[10,12,9,15,14,18,16,20]}); showcase('08 / Mini chart',chart);
const halted = kit.createMiniChart({label:'Island Exchange · halted sample',values:[10,13,16,11,14,12],halted:true}); showcase('09 / Halted chart',halted);
for(const phase of ['loading','empty','error','offline','expired','rate_limited']){
  const state=kit.createServerCallState({label:`sample ${phase}`,onRetry:()=>state.succeed({message:'Sample retry accepted.'}),onSignIn:()=>state.showMessage('Sign-in intent goes to the adapter.')});
  if(phase==='loading')state.loading();else if(phase==='empty')state.succeed({empty:true,message:'No records yet.'});
  else state.fail({reason:({error:'internal_error',expired:'session_expired'})[phase]??phase,message:'The sample request could not be completed.',retryAfterSeconds:4});
  showcase(`Request / ${phase}`,state);
}
const note = node('p','kit-gallery-note','All components accept plain data, use textContent, keep visible focus and release their listeners or animation when disposed. Sample balances and charts are display data only.'); root.append(note);
if (import.meta.hot) import.meta.hot.dispose(()=>{components.forEach(c=>c.dispose());root.replaceChildren();});
