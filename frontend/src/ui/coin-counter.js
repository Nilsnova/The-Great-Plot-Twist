// One accessible coin counter in the captain status; animation is presentational and never creates coins.
// It reads view.captain.coins (null until a signed-in account read answers).
import {node} from './kit/dom.js';
export const counterValue=(from,to,fraction)=>Math.round(from+(to-from)*Math.max(0,Math.min(1,fraction)));
export function createCoinCounter({reducedMotion=()=>false}={}){
  const element=node('span','coin-counter');element.setAttribute('role','status');let frame=0,value=null,disposed=false;
  return {element,update(target){element.hidden=target===null;if(target===null)return;cancelAnimationFrame(frame);const from=value??target,start=performance.now();value=target;element.setAttribute('aria-label',`${target.toLocaleString('en-US')} coins`);
    function draw(){if(disposed)return;const elapsed=reducedMotion()?1:Math.min(1,(performance.now()-start)/650);element.textContent=`${counterValue(from,target,elapsed).toLocaleString('en-US')} ◇`;if(elapsed<1)frame=requestAnimationFrame(draw);}draw();
  },dispose(){disposed=true;cancelAnimationFrame(frame);element.remove();}};
}
