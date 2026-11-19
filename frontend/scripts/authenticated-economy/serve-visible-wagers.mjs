// Exact unmodified frontend on a distinct loopback origin, with only its API proxy changed.
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import {loadRuntime} from './runtime.mjs';
import {sourceEvidence} from './source.mjs';
const runtime=await loadRuntime(process.argv[2]),directory=resolve(process.argv[3]);
const root=fileURLToPath(new URL('../../',import.meta.url));
const baseline=sourceEvidence(runtime.expectedCommit);
process.env.VITE_SUPABASE_URL='';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='';
const providerProxy='http://127.0.0.1:55106/provider';
const configuration={root,cacheDir:join(directory,'vite-cache'),configFile:resolve(root,'vite.config.js'),envDir:runtime.directory,
 define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(providerProxy),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify(runtime.anonKey)},
 server:{host:'127.0.0.1',port:55106,strictPort:true,hmr:false,
  watch:{ignored:['**/scripts/authenticated-economy/**']},proxy:{'/api':'http://127.0.0.1:58006','/provider':{target:runtime.providerUrl,changeOrigin:true,secure:true,ws:true,rewrite:path=>path.replace(/^\/provider(?=\/|$)/,'')}}}};
const server=await createServer(configuration);await server.listen();
await mkdir(directory,{recursive:true,mode:0o700});
await writeFile(join(directory,'side-frontend-source.json'),JSON.stringify({...baseline,
 service:'visible-wager-frontend',privateViteCache:true,providerProxy,providerTarget:runtime.providerUrl,providerTlsValidation:true,providerWebsocketForwarding:true,providerRewrite:'remove exact /provider prefix',processId:process.pid,frontendUrl:'http://127.0.0.1:55106',apiProxy:'http://127.0.0.1:58006',
 wrapperSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
 viteConfigSha256:createHash('sha256').update(await readFile(resolve(root,'vite.config.js'))).digest('hex'),
 packageLockSha256:createHash('sha256').update(await readFile(resolve(root,'package-lock.json'))).digest('hex')},null,2)+'\n');
console.log('Source-qualified visible wager frontend listening on127.0.0.1:55106');
