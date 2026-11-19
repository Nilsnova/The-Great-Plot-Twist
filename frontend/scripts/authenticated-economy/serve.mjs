// Serve the unmodified game with only private generated local provider settings.
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {loadRuntime} from './runtime.mjs';

const runtime=await loadRuntime(process.argv[2]);
// The production preview-header builder intentionally accepts hosted domains only.
// Keep that unchanged; local development injects the exact provider values into
// browser modules through Vite's normal define hook, not production CSP headers.
process.env.VITE_SUPABASE_URL='';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY='';
const root=fileURLToPath(new URL('../../',import.meta.url));
const server=await createServer({root,configFile:resolve(root,'vite.config.js'),envDir:runtime.directory,
 define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(runtime.providerUrl),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify(runtime.anonKey)},
 server:{host:'127.0.0.1',port:runtime.ports.frontend,strictPort:true,hmr:false,
  watch:{ignored:['**/scripts/authenticated-economy/**']},proxy:{'/api':runtime.apiUrl}}});
await server.listen();
console.log(JSON.stringify({frontendUrl:runtime.frontendUrl,status:'listening'}));
