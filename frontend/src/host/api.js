// Same-origin server calls and observed header checks. Never exposes headers containing credentials.
import { createApi } from '../online/api.js';
export function createHostApi({session,fetchImpl=globalThis.fetch}) {
  let checks={noStore:false,nosniff:false,noReferrer:false};
  let observed=false;
  const client=createApi({session,fetchImpl:async (path,options) => {
    const response=await fetchImpl(path,{...options,cache:'no-store',credentials:'omit',redirect:'error'});
    if(path.startsWith('/api/host/')) {
      const current={
      noStore:response.headers.get('Cache-Control')?.split(',').some(v=>v.trim()==='no-store') ?? false,
      nosniff:response.headers.get('X-Content-Type-Options')==='nosniff',
      noReferrer:response.headers.get('Referrer-Policy')==='no-referrer',
      };
      checks=Object.fromEntries(Object.entries(current).map(([key,value])=>[key,value&&(!observed||checks[key])]));
      observed=true;
    }
    return response;
  }});
  return {...client,headerChecks:()=>({...checks}),resetHeaders:()=>{
    checks={noStore:false,nosniff:false,noReferrer:false};
    observed=false;
  }};
}
