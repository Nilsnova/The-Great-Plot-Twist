// Offline fail-closed endpoint checks, not authenticated-provider acceptance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadRuntime} from './runtime.mjs';
test('edited runtime cannot make the harness contact another provider',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'mp-economy-runtime-'));
 const path=join(directory,'runtime.json');
 const valid={project:'mp505',providerUrl:'https://localhost:54421',apiUrl:'http://127.0.0.1:58005',frontendUrl:'http://127.0.0.1:55105'};
 try{
  await writeFile(path,JSON.stringify(valid));assert.deepEqual(await loadRuntime(path),valid);
  for(const changed of [{providerUrl:'https://example.supabase.co'},{providerUrl:'https://localhost:54421@evil.example'},
   {apiUrl:'http://127.0.0.1:8000'},{frontendUrl:'http://127.0.0.1:55105/other'},{project:'production'}]){
   await writeFile(path,JSON.stringify({...valid,...changed}));await assert.rejects(loadRuntime(path));
  }
 }finally{await rm(directory,{recursive:true,force:true});}
});
