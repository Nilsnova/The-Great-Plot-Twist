// Local manifests support QA; production exposes only game and approved galleries.
import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {buildSecurityHeaders} from './scripts/security-headers.js';
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
const platformConfig=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
export const previewSecurityHeaders=buildSecurityHeaders(
 process.env.VITE_SUPABASE_URL||undefined,{platformConfig},
);
import {noticesFile,thirdPartyNoticesPlugin} from './scripts/third-party-notices.js';
import {buildInfoPlugin} from './scripts/build-info.js';
export default defineConfig({
 define:{__BUILD_STAMP__:JSON.stringify(buildStamp)},
 plugins:[createBuildIdentityPlugin(buildStamp),thirdPartyNoticesPlugin(),buildInfoPlugin()],
 base:'./',server:{proxy:{'/api':'http://127.0.0.1:8000'}},
 preview:{proxy:{'/api':'http://127.0.0.1:8000'},headers:previewSecurityHeaders},
 build:{license:{fileName:noticesFile},manifest:!process.env.VERCEL,rolldownOptions:{input:{
  game:resolve(import.meta.dirname,'index.html'),workshop:resolve(import.meta.dirname,'asset-library.html'),uiKit:resolve(import.meta.dirname,'ui-kit.html'),
  host:resolve(import.meta.dirname,'host.html'),
  ...(process.env.CASE_LAB==='1'?{caseLab:resolve(import.meta.dirname,'case-lab.html')}:{}),
 }}},test:{include:['tests/**/*.test.js']},
});
