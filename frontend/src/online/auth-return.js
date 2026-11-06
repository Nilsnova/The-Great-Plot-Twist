// Consume an ephemeral PKCE return only after its sensitive address fields have been removed.
const failed=()=>({code:null,error:true,flowId:null});
const hasReturn=params=>params.has('code')||params.has('error');

function malformedReturn(href){
  if(typeof href!=='string'||!href.includes('?'))return null;
  const query=href.slice(href.indexOf('?')+1).split('#')[0];
  return hasReturn(new URLSearchParams(query))?failed():null;
}

export function takeAuthReturn({href=globalThis.location?.href,history=globalThis.history}={}){
  let url;
  try {url=new URL(href);} catch {return malformedReturn(href);}
  if(!hasReturn(url.searchParams))return null;
  if(!['http:','https:'].includes(url.protocol))return failed();
  const codes=url.searchParams.getAll('code');
  const flows=url.searchParams.getAll('sb_flow_id');
  const error=url.searchParams.has('error');
  try {
    for(const key of ['code','error','error_description','sb_flow_id'])url.searchParams.delete(key);
    history.replaceState(history.state??null,'',url.href);
  } catch {return failed();}
  const code=codes.length===1&&codes[0].length>0&&codes[0].length<=4096&&!/[\s\x00-\x1f\x7f]/.test(codes[0])
    ?codes[0]:null;
  const flowId=flows.length===1&&/^[A-Za-z0-9_-]{1,80}$/.test(flows[0])?flows[0]:null;
  return {code:error?null:code,error:error||code===null,flowId};
}
