// Small performance calculations with no browser or renderer dependencies.
export function addFrameSample(samples, frameMs, limit=120) {
  if(!Number.isFinite(frameMs)||frameMs<=0)return samples;
  const next=[...samples,frameMs];return next.length>limit?next.slice(-limit):next;
}

export function percentile(values,percent=95) {
  if(!Array.isArray(values)||!values.length||!values.every(Number.isFinite))return null;
  const sorted=[...values].sort((a,b)=>a-b),index=Math.ceil(Math.max(0,Math.min(100,percent))/100*sorted.length)-1;
  return sorted[Math.max(0,index)];
}

export function performanceSummary({fps,frameTimes,calls,triangles,geometries,textures,heapBytes}) {
  return {fps:Number.isFinite(fps)?Math.max(0,Math.round(fps)):null,p95Ms:percentile(frameTimes),
    calls:Number.isFinite(calls)?calls:null,triangles:Number.isFinite(triangles)?triangles:null,
    geometries:Number.isFinite(geometries)?geometries:null,textures:Number.isFinite(textures)?textures:null,
    heapBytes:Number.isFinite(heapBytes)?heapBytes:null};
}

export function updateSlowFrameState(state,fps,now,{limit=45,duration=5000}={}) {
  if(!Number.isFinite(fps)||fps>=limit)return {...state,slowSince:null,offer:false};
  const slowSince=Number.isFinite(state.slowSince)?state.slowSince:now;
  return {...state,slowSince,offer:now-slowSince>=duration};
}

export function formatBytes(bytes) {
  if(!Number.isFinite(bytes)||bytes<0)return 'Unavailable';
  if(bytes<1024)return `${Math.round(bytes)} B`;
  if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}
