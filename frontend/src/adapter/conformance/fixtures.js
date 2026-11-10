// Recorded route replies for adapter work. This request function never opens a socket.
export function routeFixtures(){return [
  {method:'GET',path:'/api/me',status:200,body:{id:'player-1',displayName:'Captain Shoal',
    captainName:'Captain Shoal',kit:null,place:null,coins:0,crews:[]}},
  {method:'POST',path:'/api/me/name/reroll',status:200,body:{captainName:'Captain Reed',rerollsLeft:0}},
  {method:'GET',path:'/api/islet',status:200,body:{coins:100,timber:20,buildings:[]}},
];}

/** Fetch-like injected request with ordered fixtures and inspectable, non-secret call records. */
export function createFixtureRequest(fixtures){
  const queue=fixtures.map(item=>structuredClone(item)),calls=[];
  const sensitive=/authorization|cookie|(?:api|supabase)[-_]?key|^key$|token|secret|password|verifier|auth.?code|^code$|session|credential/i;
  const scrub=value=>{
    if(Array.isArray(value))return value.map(scrub);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sensitive.test(key)?'[redacted]':scrub(item)]));
    return value;
  };
  const request=async(input,init={})=>{
    const source=input instanceof URL?input.href:typeof input==='string'?input:input.url;
    const url=new URL(source,'http://fixture.local');
    const method=String(init.method??input.method??'GET').toUpperCase(),next=queue[0];
    if(!next||next.method!==method||next.path!==url.pathname)throw new Error(`fixture mismatch: ${method} ${url.pathname}`);
    const headers=new Headers(init.headers??input.headers),safeHeaders={};
    for(const [key,value] of headers)safeHeaders[key]=sensitive.test(key)?'[redacted]':value;
    let body=init.body??null;if(typeof body==='string'){try{body=JSON.parse(body);}catch{body='[redacted non-JSON body]';}}
    calls.push({method,path:url.pathname,headers:safeHeaders,body:scrub(body)});queue.shift();
    return new Response(JSON.stringify(next.body),{status:next.status,headers:{'content-type':'application/json',...(next.headers??{})}});
  };
  request.calls=calls;request.remaining=()=>queue.length;return request;
}
