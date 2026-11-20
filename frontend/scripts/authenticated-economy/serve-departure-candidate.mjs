// Serve the frozen membership departure fix against the same isolated real provider and API.
import {createServer} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const runtime=JSON.parse(await readFile(process.argv[2],'utf8')),output=resolve(process.argv[3]);
const helpers=process.env.MP_ECO_AUTH_HELPERS;
if(!helpers||runtime.project!=='mp505'||runtime.apiUrl!=='http://127.0.0.1:58005'||runtime.providerUrl!=='https://localhost:54421')throw Error('Explicit isolated provider helpers are required');
const {sourceEvidence,servedSourceEvidence}=await import(pathToFileURL(resolve(helpers,'source.mjs')));
const candidate='90a9a8227579c2be86cbe1d024fa75de7d61637e';
const frontend=fileURLToPath(new URL('../../',import.meta.url)),root=resolve(frontend,'..');
const source=sourceEvidence(candidate,{checkoutRoot:root});
process.env.VITE_SUPABASE_URL='';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='';
const providerUrl='http://127.0.0.1:55109/provider';
const server=await createServer({root:frontend,configFile:join(frontend,'vite.config.js'),envDir:runtime.directory,
 cacheDir:join(output,'vite-cache'),define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(runtime.providerUrl),
 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify(runtime.anonKey)},
 server:{host:'127.0.0.1',port:55109,strictPort:true,hmr:false,watch:{ignored:['**/scripts/authenticated-economy/**']},
 proxy:{'/api':runtime.apiUrl,'/provider':{target:runtime.providerUrl,changeOrigin:true,secure:true,ws:true,
 rewrite:path=>path.replace(/^\/provider(?=\/|$)/,'')}}}});
await server.listen();await mkdir(output,{recursive:true,mode:0o700});
await writeFile(join(output,'candidate-source.json'),JSON.stringify({candidate,source,primarySource:servedSourceEvidence(runtime),
 frontendUrl:'http://127.0.0.1:55109',sdkRestoreProxy:providerUrl,productProviderUrl:runtime.providerUrl,apiUrl:runtime.apiUrl,processId:process.pid,privateViteCache:true,
 wrapperSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),recordedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600});
console.log('Frozen departure candidate listening on loopback55109');
