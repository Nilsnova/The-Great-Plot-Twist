// Fail closed if a scenario's claimed production baseline no longer matches the served checkout.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const paths=['backend/server','backend/content','frontend/src','supabase/migrations',
 'backend/uv.lock','backend/pyproject.toml','frontend/package-lock.json','frontend/package.json',
 ':(exclude)backend/server/tests'];
export function sourceEvidence(baseline,{checkoutRoot=root}={}){
 try{execFileSync('git',['diff','--exit-code',baseline,'--',...paths],{cwd:checkoutRoot,stdio:'pipe'});}
 catch{throw Error('Production source differs from the expected acceptance baseline');}
 const untracked=execFileSync('git',['ls-files','--others','--exclude-standard','--',...paths],{cwd:checkoutRoot,encoding:'utf8'})
  .trim().split('\n').filter(path=>path&&!path.includes('/tests/'));
 if(untracked.length)throw Error('Untracked production files prevent a source-qualified acceptance run');
 return {expectedProductionBaseline:baseline,actualCheckoutHead:execFileSync('git',['rev-parse','HEAD'],{cwd:checkoutRoot,encoding:'utf8'}).trim(),
  productionDiffFromBaseline:'empty',paths};
}
