// Local manifests support QA; production exposes only game and approved galleries.
import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {proposedCsp} from './scripts/csp-policy.js';
import {createBuildIdentityPlugin} from './scripts/build-identity.js';
import {resolveBuildStamp} from './scripts/build-stamp.js';
function gitText(args){
 return execFileSync('git',args,{encoding:'utf8',timeout:1000,stdio:['ignore','pipe','ignore']});
}
const buildStamp=resolveBuildStamp({
 envSha:process.env.VERCEL_GIT_COMMIT_SHA,
 envName:process.env.VERCEL_ENV,
 readGitSha:()=>gitText(['rev-parse','--short','HEAD']),
 readDirty:()=>Boolean(gitText(['status','--porcelain']).trim()),
});
export const previewSecurityHeaders={
 'Content-Security-Policy':proposedCsp,
 'X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
};
export default defineConfig({
 define:{__BUILD_STAMP__:JSON.stringify(buildStamp)},
 plugins:[createBuildIdentityPlugin(buildStamp)],
 base:'./',server:{proxy:{'/api':'http://127.0.0.1:8000'}},
 preview:{proxy:{'/api':'http://127.0.0.1:8000'},headers:previewSecurityHeaders},
 build:{manifest:!process.env.VERCEL,rolldownOptions:{input:{
  game:resolve(import.meta.dirname,'index.html'),workshop:resolve(import.meta.dirname,'asset-library.html'),uiKit:resolve(import.meta.dirname,'ui-kit.html'),
  ...(process.env.CASE_LAB==='1'?{caseLab:resolve(import.meta.dirname,'case-lab.html')}:{}),
 }}},test:{include:['tests/**/*.test.js']},
});
