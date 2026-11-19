// Fail closed if a scenario's claimed production baseline no longer matches the served checkout.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const paths=['backend/server','backend/content','frontend/src','supabase/migrations',
 'backend/uv.lock','backend/pyproject.toml','frontend/package-lock.json','frontend/package.json',
 ':(exclude)backend/server/tests'];
export function sourceEvidence(baseline,{checkoutRoot=root}={}){
 if(!/^[a-f0-9]{40}$/.test(baseline??''))throw Error('An explicit full production candidate SHA is required');
 try{execFileSync('git',['diff','--exit-code',baseline,'--',...paths],{cwd:checkoutRoot,stdio:'pipe'});}
 catch{throw Error('Production source differs from the expected acceptance baseline');}
 const untracked=execFileSync('git',['ls-files','--others','--exclude-standard','--',...paths],{cwd:checkoutRoot,encoding:'utf8'})
  .trim().split('\n').filter(path=>path&&!path.includes('/tests/'));
 if(untracked.length)throw Error('Untracked production files prevent a source-qualified acceptance run');
 return {expectedProductionBaseline:baseline,actualCheckoutHead:execFileSync('git',['rev-parse','HEAD'],{cwd:checkoutRoot,encoding:'utf8'}).trim(),
  productionDiffFromBaseline:'empty',paths};
}

export function recordServingSource(runtime,service,processId=process.pid){
 if(!['api','frontend','worker'].includes(service))throw Error('Unknown local serving process');
 const evidence={...sourceEvidence(runtime.expectedCommit),service,processId,
  sourceRoot:root,recordedAt:new Date().toISOString()};
 writeFileSync(join(runtime.directory,service+'-source.json'),JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
 return evidence;
}

export function servedSourceEvidence(runtime){
 return ['api','frontend'].map(service=>{
  const recorded=JSON.parse(readFileSync(join(runtime.directory,service+'-source.json'),'utf8'));
  if(recorded.expectedProductionBaseline!==runtime.expectedCommit||recorded.service!==service)
   throw Error('The local served candidate differs from the requested production baseline');
  process.kill(recorded.processId,0);
  const current=sourceEvidence(runtime.expectedCommit,{checkoutRoot:recorded.sourceRoot});
  return {service,...current};
 });
}
