// A 161-second highlights script. Only this pure state machine decides tour step timing.
export const tourSteps=[
  {id:'intro',title:'A page from the intro',seconds:20,copy:'Search the writing desk. The original story runs locally for this rehearsal.'},
  {id:'arrival',title:'Arrival on Lighthouse Isle',seconds:14,copy:'Walkable pixel scenery, a readable HUD and the keeper’s cottage.'},
  {id:'chart',title:'Set a coastal course',seconds:20,copy:'The sea chart connects the islands. Sailing follows the wind.'},
  {id:'harbor',title:'Saltreach Harbor',seconds:20,copy:'A working harbor with named hotspots, ready for the feature teams.'},
  {id:'board',title:'At the Captain’s Table',seconds:18,copy:'Two crew seats pin cards. D1 opens the Night of Three Lights. Local rehearsal only.'},
  {id:'fog',title:'Recorded weather · fog override',seconds:12,copy:'A local fog override changes the coast and the procedural wind and sea.'},
  {id:'storm',title:'Recorded weather · storm override',seconds:12,copy:'A local storm override brings rain and wind. No provider is needed.'},
  {id:'finale',title:'The Night of Three Lights',seconds:27,copy:'Take a post, aim three beams, and watch the fog part. No accusation or reveal is shown.'},
  {id:'relighting',title:'The Relighting',seconds:18,copy:'The public lights return. Gull’s Rest opens for a lantern festival. This tour changes no live progress.'},
];
export function createTourMachine() {
  let index=-1,elapsed=0;
  return {get step(){return tourSteps[index]??null;},get index(){return index;},get elapsed(){return elapsed;},
    get due(){return index>=0&&elapsed>=tourSteps[index].seconds;},get progress(){return index<0?0:Math.min(1,elapsed/tourSteps[index].seconds);},
    start(){index=0;elapsed=0;},advance(){if(index<0)return false;index++;elapsed=0;if(index>=tourSteps.length){index=-1;return false;}return true;},
    tick(dt){if(index>=0&&Number.isFinite(dt))elapsed+=Math.max(0,dt);},stop(){index=-1;elapsed=0;}};
}
