// Independent local database observations; installation is an explicit, labeled setup action.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {resolve as pathResolve} from 'node:path';
const backend=fileURLToPath(new URL('../../../backend/',import.meta.url));

function call(statement,parameters,{runtimePath='/tmp/mp505-provider/runtime.json',purpose}={}) {
 return new Promise((resolve,reject)=>{
  const configuration=JSON.parse(readFileSync(runtimePath,'utf8'));
  const args=['run','--offline','--no-sync','--with','psycopg[binary]','python','-m','tools.authenticated_economy.observe','--runtime',runtimePath];
  if(purpose)args.push('--install');
  const child=spawn('uv',args,{cwd:backend,env:{PATH:process.env.PATH,
   ...(configuration.uvCacheDir?{UV_CACHE_DIR:configuration.uvCacheDir}:{}),
   UV_PROJECT_ENVIRONMENT:configuration.pythonEnvironment??pathResolve(backend,'.venv'),
   PYTHONPATH:backend},stdio:['pipe','pipe','pipe']});
  let output='',error='';
  child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk);
  child.on('error',reject);
  child.on('close',code=>{if(code)reject(Error('Disposable observer failed: '+error.slice(-1200)));else{try{resolve(JSON.parse(output))}catch(e){reject(e)}}});
  child.stdin.end(JSON.stringify({statement,parameters,purpose}));
 });
}
export const observe=(statement,parameters=[],options={})=>call(statement,parameters,options);
export const install=(statement,parameters=[],purpose,options={})=>{
 if(!purpose)throw Error('Installer setup must be explicitly labeled');
 return call(statement,parameters,{...options,purpose});
};

export async function admit(actorId,{coins=200,runtimePath}={}) {
 const uid='installer_admit_'+crypto.randomUUID().replaceAll('-','');
 const rows=await install('select public.island_treasury_admit($1::uuid,$1::uuid,$2,$3) as result',
  [actorId,uid,coins],'Service-only admission of a fresh disposable test island; no legacy conversion',{runtimePath});
 if(rows[0]?.result?.status!=='done')throw Error('Fresh test-island admission refused');
 return rows[0].result;
}
