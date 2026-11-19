// Real local GoTrue registrations and production API verification without browser rendering.
import {randomBytes} from 'node:crypto';
import {loadRuntime} from './runtime.mjs';
import {servedSourceEvidence} from './source.mjs';

export async function requestApi(client,path,{method='GET',body,headers={},capability='1'}={}) {
 if(!path.startsWith('/api/')||path.startsWith('//'))throw Error('Only local production API paths are allowed');
 const requestHeaders={...headers,Authorization:'Bearer '+client.session.access_token};
 if(body!==undefined)requestHeaders['Content-Type']='application/json';
 if(capability!==null)requestHeaders['X-Island-Economy-Version']=capability;
 const response=await fetch(client.runtime.apiUrl+path,{method,headers:requestHeaders,
  redirect:'error',...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:response.status,data:await response.json().catch(()=>null)};
}

export async function createApiClients({labels=['owner','member'],runtimePath,expectedCommit}={}) {
 const runtime=await loadRuntime(runtimePath);
 if(expectedCommit!==undefined&&expectedCommit!==runtime.expectedCommit)
  throw Error('The requested candidate differs from the configured provider candidate');
 const sources=servedSourceEvidence(runtime);
 const clients=[];
 for(const label of labels){
  const email=label+'-'+randomBytes(6).toString('hex')+'@example.test';
  const password=randomBytes(24).toString('base64url');
  const response=await fetch(runtime.providerUrl+'/auth/v1/signup',{method:'POST',redirect:'error',
   headers:{apikey:runtime.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  const session=await response.json();
  if(!response.ok||typeof session.access_token!=='string'||!session.user?.id)
   throw Error('Actual local provider registration failed with status '+response.status);
  const client={kind:'api-only',label,runtime,actorId:session.user.id,session,email,password};
  client.request=(path,options)=>requestApi(client,path,options);
  const verified=await client.request('/api/me');
  if(verified.status!==200||verified.data.id!==client.actorId)
   throw Error('The production verifier refused the actual provider identity: '+verified.status);
  clients.push(client);
 }
 return {runtime,clients,servedSources:sources,close:async()=>{}};
}
