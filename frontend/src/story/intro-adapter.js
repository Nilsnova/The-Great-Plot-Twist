// Atomic hotspot navigation and a replayable move journal around the unchanged S1 engine.
import { Game,memoryStorage } from './engine.js';
export const introHotspots=['cottage','desk','shore','tower_door'];
function replay(story,actions) {
  const game=new Game(story,memoryStorage());
  for(const id of actions)if(!game.perform(id).accepted)return null;
  return game;
}
function navigation(game,target) {
  const queue=[{scene:game.state.scene,actions:[]}],seen=new Set();
  while(queue.length) {
    const next=queue.shift();if(next.scene===target)return next.actions;if(seen.has(next.scene))continue;seen.add(next.scene);
    for(const action of game.story.scenes[next.scene].actions??[]) {
      if(!action.goto||action.take||action.set?.length||game.story.scenes[action.goto].ending||!game.conditionsMet(action.requires))continue;
      queue.push({scene:action.goto,actions:[...next.actions,action.id]});
    }
  }
  return null;
}
export function createIntroAdapter(story,journal={read:()=>null,write(){}}) {
  let game=new Game(story,memoryStorage()),actions=[],restored=false;
  const labels=Object.fromEntries(Object.values(story.scenes).flatMap(scene=>(scene.actions??[]).map(action=>[action.id,action.label])));
  try {
    const saved=JSON.parse(journal.read());
    if(saved?.version===1&&Array.isArray(saved.actions)&&saved.actions.length<=1000&&saved.actions.every(id=>typeof id==='string')) {
      const candidate=replay(story,saved.actions);if(candidate){game=candidate;actions=[...saved.actions];restored=true;}
    }
  } catch { /* A malformed or old journal starts a fresh local intro. */ }
  function save() { try{journal.write(JSON.stringify({version:1,actions}));}catch{/* Private storage may be unavailable. */} }
  return {
    get restored(){return restored;},get state(){return structuredClone(game.state);},get actions(){return [...actions];},
    get view(){return {scene:game.state.scene,title:game.scene.title,text:game.scene.text,ended:game.state.ended,message:game.state.message,
      history:actions.map(id=>({id,label:labels[id]??id})),notes:[...game.sceneNotes()],inventory:game.inventoryDetails().map(item=>({...item})),
      choices:game.visibleActions().map(({action,allowed})=>({id:action.id,label:action.label,disabled:!allowed,hint:allowed?'':action.blocked_message??'This action is not available yet.'}))};},
    visit(id) {
      if(!introHotspots.includes(id)||game.state.ended)return {accepted:false,message:'Continue the current intro.'};
      const path=navigation(game,id);if(!path)return {accepted:false,message:'Return through the current scene first.'};
      if(!path.length)return {accepted:true,message:game.state.message};
      const candidate=replay(story,actions);if(!candidate)return {accepted:false,message:'The intro could not be resumed.'};
      for(const action of path) {const result=candidate.perform(action);if(!result.accepted)return result;}
      game=candidate;actions.push(...path);save();return {accepted:true,message:game.state.message};
    },
    perform(id) {const result=game.perform(id);if(result.accepted){actions.push(id);save();}return result;},
    reset(){game=new Game(story,memoryStorage());actions=[];save();},
  };
}
