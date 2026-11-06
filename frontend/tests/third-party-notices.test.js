// Exercise Vite's actual notice generation with installed dependencies; no network or app startup.
import {it,expect} from 'vitest';
import {build} from 'vite';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {noticesFile,thirdPartyNoticesPlugin} from '../scripts/third-party-notices.js';
const require=createRequire(import.meta.url);
const exactLicense=(name,file)=>{
  const base=name==='vite'?dirname(require.resolve('vite/package.json')):join(dirname(require.resolve(name)),'..');
  return readFileSync(join(base,file),'utf8').trim();
};
it('ships exact notices for actual bundled packages and Vite helper code',async()=>{
  const fixture={name:'notice-fixture',resolveId(id){if(id==='notice-entry')return '\0notice-entry';},
    load(id){if(id==='\0notice-entry')return 'import {Vector2} from "three"; import {createClient} from "@supabase/supabase-js"; console.log(new Vector2(1,2),createClient);';}};
  const result=await build({configFile:false,logLevel:'silent',plugins:[fixture,thirdPartyNoticesPlugin()],
    build:{write:false,copyPublicDir:false,license:{fileName:noticesFile},rolldownOptions:{input:'notice-entry'}}});
  const notice=result.output.find(asset=>asset.fileName===noticesFile)?.source;
  expect(notice).toContain(exactLicense('three','LICENSE'));
  expect(notice).toContain(exactLicense('@supabase/supabase-js','LICENSE'));
  expect(notice).toContain(exactLicense('vite','LICENSE.md'));
  expect(notice).toContain('## @supabase/auth-js');
});
it('fails the build hook when automatic dependency notices were not generated',()=>{
  expect(()=>thirdPartyNoticesPlugin().generateBundle.handler({},{})).toThrow('notices are missing');
});
