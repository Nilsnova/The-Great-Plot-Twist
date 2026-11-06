// One accessible counter; animation is presentational and never creates coins.
import {node} from '../helpers.js';
export const counterValue=(from,to,fraction)=>Math.round(from+(to-from)*Math.max(0,Math.min(1,fraction)));
export function createCoinCounter({reducedMotion=()=>false}={}){
  const element=node('span','coin-counter');element.setAttribute('role','status');let frame=0,value=null,disposed=false;
  return {element,update(model){const target=model.balance;element.hidden=target===null;if(target===null)return;cancelAnimationFrame(frame);const from=value??target,start=performance.now();value=target;element.setAttribute('aria-label',`${target.toLocaleString('en-US')} coins`);
    function draw(){if(disposed)return;const elapsed=reducedMotion()?1:Math.min(1,(performance.now()-start)/650);element.textContent=`${counterValue(from,target,elapsed).toLocaleString('en-US')} ◇`;if(elapsed<1)frame=requestAnimationFrame(draw);}draw();
  },dispose(){disposed=true;cancelAnimationFrame(frame);element.remove();}};
}
