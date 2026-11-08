// Displays renderer and frame-time measurements supplied by the running game.
import './perf.css';
import {performanceCopy} from '../../build/format.js';
import {notePerformanceSummary} from '../../diagnostics/runtime.js';
import {createButton} from '../../ui/kit/button.js';
import {node} from '../../ui/kit/dom.js';
import {addFrameSample,formatBytes,performanceSummary,updateSlowFrameState} from './logic.js';

const labels=[['fps','Frames per second'],['p95Ms','95th percentile frame'],['calls','Draw calls'],['triangles','Triangles'],['geometries','Geometries'],['textures','Textures'],['heapBytes','JavaScript heap']];
const display=value=>value===null?'Unavailable':typeof value==='number'?Math.round(value).toLocaleString('en-GB'):String(value);

export function createPerformancePanel(container,{readStats,setQuality}) {
  const element=node('aside','performance-panel'),title=node('h2','','Performance'),list=node('dl'),status=node('p','performance-status');
  status.setAttribute('role','status');
  const fields=new Map(labels.map(([id,label])=>{const term=node('dt','',label),value=node('dd','', 'Unavailable');list.append(term,value);return[id,value];}));
  const copy=createButton({label:'Copy numbers',variant:'quiet',onClick:copyNumbers});
  const lowQuality=createButton({label:'Switch to low quality',onClick:()=>{setQuality?.('low');lowQuality.element.hidden=true;status.textContent='Low quality is on.';}});
  lowQuality.element.hidden=true;element.append(title,list,status,copy.element,lowQuality.element);container.append(element);
  let samples=[],lastAt=null,lastPaint=0,slow={slowSince:null,offer:false},latest=null,disposed=false,lastLowHidden=true,lastStatus='',shown=new Map();

  async function copyNumbers(){
    if(!latest)return;
    const text=labels.map(([id,label])=>`${label}: ${id==='heapBytes'?formatBytes(latest[id]):display(id==='heapBytes'?latest[id]:latest[id])}`).join('\n');
    try{await navigator.clipboard.writeText(performanceCopy(__BUILD_STAMP__,text));status.textContent='Performance numbers copied.';lastStatus='Performance numbers copied.';}
    catch{status.textContent='Copy is unavailable in this browser.';lastStatus='Copy is unavailable in this browser.';}
  }
  function update(){
    if(disposed)return;
    const now=performance.now(),frameMs=lastAt===null?null:now-lastAt;lastAt=now;
    if(frameMs!==null)samples=addFrameSample(samples,frameMs);
    const source=readStats?.()??{},heap=performance.memory?.usedJSHeapSize;
    slow=updateSlowFrameState(slow,source.fps,now);
    if(now-lastPaint>=300){
      lastPaint=now;
      latest=performanceSummary({...source,frameTimes:samples,heapBytes:heap});notePerformanceSummary(latest);
      for(const [id,value] of fields){const text=id==='p95Ms'?(latest.p95Ms===null?'Unavailable':`${latest.p95Ms.toFixed(1)} ms`):id==='heapBytes'?formatBytes(latest.heapBytes):display(latest[id]);if(shown.get(id)!==text){value.textContent=text;shown.set(id,text);}}
      const wantsLow=slow.offer&&source.quality!=='low';if(lastLowHidden===wantsLow){lowQuality.element.hidden=!wantsLow;lastLowHidden=!wantsLow;}
      if(!wantsLow&&source.quality==='low'&&lastStatus!=='Low quality is on.'){status.textContent='Low quality is on.';lastStatus='Low quality is on.';}
    }
  }
  return {element,update,dispose(){if(disposed)return;disposed=true;copy.dispose();lowQuality.dispose();element.remove();}};
}
