// Only the generated loopback services may be contacted by the acceptance tools.
import {readFile} from 'node:fs/promises';
export async function loadRuntime(path='/tmp/mp505-provider/runtime.json') {
 const runtime=JSON.parse(await readFile(path,'utf8'));
 const endpoints={providerUrl:'https://localhost:54421',apiUrl:'http://127.0.0.1:58005',frontendUrl:'http://127.0.0.1:55105'};
 if(runtime.project!=='mp505')throw Error('Only the isolated mp505 provider is allowed');
 for(const [field,expected] of Object.entries(endpoints)) {
  if(runtime[field]!==expected)throw Error('Only the generated local provider endpoints are allowed');
 }
 return runtime;
}
