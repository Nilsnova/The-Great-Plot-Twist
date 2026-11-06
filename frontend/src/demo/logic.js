// Tour schedule and navigation rules. This file has no DOM or game imports.
export const tourSteps=[
  {id:'intro',title:'A page from the intro',seconds:15,copy:'The original intro runs locally. Nothing from the case solution appears.'},
  {id:'arrival',title:'Arrival on Lighthouse Isle',seconds:12,copy:'Walkable pixel scenery, the keeper’s cottage and a readable HUD.'},
  {id:'islet',title:'Build the signal station',seconds:18,copy:'The crew builds a third light on the Home islet. This rehearsal changes no live progress.'},
  {id:'chart',title:'Set a coastal course',seconds:16,copy:'The sea chart connects the Home islet to Saltreach Harbor.'},
  {id:'harbor',title:'Harbor bulletin and live captains',seconds:28,copy:'The bulletin shows an almanac fog night while local captains walk through the harbor.'},
  {id:'board',title:'At the Captain’s Table',seconds:18,copy:'Two crew seats pin cards. D1 opens the Night of Three Lights. Local rehearsal only.'},
  {id:'weather',title:'Weather · almanac fog and storm',seconds:18,copy:'The harbor almanac names a fog night; the storm view is a local weather rehearsal.'},
  {id:'finale',title:'The Night of Three Lights',seconds:27,copy:'Take a post and aim three beams. This tour never accuses or reveals anyone.'},
  {id:'relighting',title:'The Relighting',seconds:18,copy:'The public lights return and Gull’s Rest opens. The tour changes no live progress.'},
];

export const tourDurationSeconds=tourSteps.reduce((total,step)=>total+step.seconds,0);

export function createTourMachine() {
  let index=-1,elapsed=0,paused=false;
  function select(next){if(!Number.isInteger(next)||next<0||next>=tourSteps.length)return false;index=next;elapsed=0;return true;}
  function stop(){index=-1;elapsed=0;paused=false;}
  return {get step(){return tourSteps[index]??null;},get index(){return index;},get elapsed(){return elapsed;},get paused(){return paused;},
    get due(){return index>=0&&!paused&&elapsed>=tourSteps[index].seconds;},get progress(){return index<0?0:Math.min(1,elapsed/tourSteps[index].seconds);},
    start(){paused=false;select(0);},advance(){if(index<0)return false;if(index+1>=tourSteps.length){stop();return false;}return select(index+1);},
    back(){return index>0&&select(index-1);},jump(next){return select(next);},restart(){paused=false;return select(0);},
    togglePause(){if(index<0)return paused;paused=!paused;return paused;},
    tick(dt){if(index>=0&&!paused&&Number.isFinite(dt))elapsed+=Math.max(0,dt);},stop};
}
