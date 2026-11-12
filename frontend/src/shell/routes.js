// What Play and Replay the intro start. Loaded on the first click, so the cold title keeps its
// JavaScript budget. flow is main.js's small handle on the shared runtime.
import {HARBOR_START} from '../front-door/logic.js';

// Title Play: the front door (lore once, goal card, then the harbor). Replay shows the lore again.
export async function start(flow,replay=false){
  const current=flow.claim();
  try{flow.door??=(await import('../front-door/index.js')).createFrontDoor({container:flow.container,focus:flow.focus,openAccount:flow.openAccount});}catch{/* Fall back to the harbor. */}
  if(!current())return;
  if(!flow.door){const game=await flow.loadGame();if(current())await game?.begin(false,HARBOR_START);return;}
  await flow.door.run({loadGame:flow.loadGame,adapter:flow.adapter,replay,isCurrent:current});
}
