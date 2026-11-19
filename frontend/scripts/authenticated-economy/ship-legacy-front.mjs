// Separate genuine game frontend for declared local compatibility settings.
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import {loadRuntime} from './runtime.mjs';
import {sourceEvidence} from './source.mjs';
const runtime=await loadRuntime('/tmp/mp505-provider/runtime.json');
const root=fileURLToPath(new URL('../../',import.meta.url));
process.env.VITE_SUPABASE_URL='';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='';
const ownRoot=fileURLToPath(new URL('../../../',import.meta.url));
const own=sourceEvidence('92e7c3b6d68a8636a638606a605efa534ea3fb83',{checkoutRoot:ownRoot});
const equivalent=sourceEvidence(runtime.expectedCommit,{checkoutRoot:ownRoot});
const server=await createServer({root,configFile:resolve(root,'vite.config.js'),envDir:runtime.directory,
 cacheDir:'/tmp/mp505-ship-legacy/vite-cache',
 define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(runtime.providerUrl),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify(runtime.anonKey)},
 server:{host:'127.0.0.1',port:55107,strictPort:true,hmr:false,
  watch:{ignored:['**/scripts/authenticated-economy/**']},proxy:{'/api':'http://127.0.0.1:58007'}}});
await server.listen();await mkdir('/tmp/mp505-ship-legacy',{recursive:true,mode:0o700});
await writeFile('/tmp/mp505-ship-legacy/front-source.json',JSON.stringify({processId:process.pid,
 expectedTestSource:own.expectedProductionBaseline,servedProductionCandidate:equivalent.expectedProductionBaseline,
 sourceRoot:ownRoot,own,equivalent,port:55107,proxyPort:58007})+'\n',{mode:0o600});
console.log('Separate source-guarded ship/legacy frontend listening on55107.');
