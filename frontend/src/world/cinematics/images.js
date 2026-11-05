// Per-shot local bitmap ownership, bounded loading and cancellation of late callbacks.
import { pixelById } from '../../pixel/catalog.js';
export function loadShotImages(ids) {
  const images={}, cleanups=[];
  const promises=[...new Set(ids)].map(id=>new Promise((resolve,reject)=>{
    const image=new Image(); images[id]=image; let settled=false;
    function finish(error) { if (settled) return; settled=true;clearTimeout(timer);image.onload=null;image.onerror=null;if(error)reject(error);else resolve(); }
    const timer=setTimeout(()=>finish(new Error('Shot image timed out')),2500);
    image.onload=()=>finish(); image.onerror=()=>finish(new Error('Shot image unavailable'));
    cleanups.push(()=>{finish(new Error('Shot cancelled'));image.removeAttribute('src');});
    image.src=`${import.meta.env.BASE_URL}${id==='chart' || id==='chart-relit' ? `places/${id}.png` : `pixel/${pixelById[id].file}`}`;
  }));
  return {images,ready:Promise.all(promises),dispose(){cleanups.splice(0).forEach(cleanup=>cleanup());}};
}
