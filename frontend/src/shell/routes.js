// What Play, the Lighthouse prologue and Replay the intro start. Loaded on the first click, so the
// cold title keeps its JavaScript budget. flow is main.js's small handle on the shared runtime.
import {hasLocalIntro} from './logic.js';
import {introJournal} from '../story/intro-journal.js';
import {playChoice,HARBOR_START} from '../front-door/logic.js';

// Title Play: continue a saved story, otherwise the front door (lore, goal card, harbor).
export async function start(flow,replay=false){
  const choice=replay?'front_door':playChoice({localIntro:hasLocalIntro(introJournal().read()),account:flow.adapter.read().account});
  if(choice==='continue')return flow.play(true);
  const current=flow.claim();
  try{flow.door??=(await import('../front-door/index.js')).createFrontDoor({container:flow.container,focus:flow.focus});}catch{/* Fall back to the harbor. */}
  if(!current())return;
  if(!flow.door){const game=await flow.loadGame();if(current())await game?.begin(false,HARBOR_START);return;}
  await flow.door.run({loadGame:flow.loadGame,adapter:flow.adapter,replay,isCurrent:current});
}
// The original Act 1, now the optional Lighthouse prologue: resume a local intro or start one.
export async function prologue(flow){
  const current=flow.claim();const game=await flow.loadGame();
  if(current())await game?.begin(hasLocalIntro(introJournal().read()));
}
