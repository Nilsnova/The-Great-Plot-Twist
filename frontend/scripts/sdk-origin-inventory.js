// Reviewed SDK literals are inventory evidence, never additional CSP or network permissions.
import assert from 'node:assert/strict';

export const reviewedSdkVersion='2.118.0';
export const sdkManifestEntry='node_modules/@supabase/supabase-js/dist/index.mjs';
const packages=['@supabase/supabase-js','@supabase/auth-js','@supabase/realtime-js'];
const reviewedOrigins={
  'http://localhost:9999':{
    classification:'dormant-default',
    purpose:'GoTrue standalone fallback; SupabaseClient supplies the validated project auth/v1 URL.',
    urls:['http://localhost:9999'],
    evidence:['@supabase/auth-js/src/lib/constants.ts: GOTRUE_URL',
      '@supabase/auth-js/src/GoTrueClient.ts: DEFAULT_OPTIONS overridden by constructor options',
      '@supabase/supabase-js/src/SupabaseClient.ts: _initSupabaseAuthClient supplies authUrl'],
  },
  'https://developer.mozilla.org':{
    classification:'documentation',
    purpose:'LockManager specification link inside the SDK warning text; no request target.',
    urls:['https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request'],
    evidence:['@supabase/auth-js/src/lib/locks.ts: null-lock warning'],
  },
  'https://github.com':{
    classification:'documentation',
    purpose:'SDK migration and Node support links in warning text; no request targets.',
    urls:['https://github.com/supabase/supabase-js/blob/master/packages/core/realtime-js/migrations/httpsend-server-version.md',
      'https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/migrations/lockless-coordination.md',
      'https://github.com/orgs/supabase/discussions/45715'],
    evidence:['@supabase/realtime-js/src/RealtimeChannel.ts: server-version warning',
      '@supabase/auth-js/src/GoTrueClient.ts: deprecated lock-option warning',
      '@supabase/supabase-js/src/index.ts: Node support warning'],
  },
};
export function literalOrigins(source){
  return [...new Set(source.match(/(?:https?|wss):\/\/[a-zA-Z0-9._:-]+/g)??[])];
}
export function assertProductionHtmlInventory({manifest,htmlFiles}){
  const entries=['asset-library.html','host.html','index.html','ui-kit.html'];
  const publicPages=['auth-check.html','help.html','privacy.html'];
  const declared=Object.entries(manifest).filter(([key,value])=>key.endsWith('.html')||value.src?.endsWith('.html'));
  assert.deepEqual(declared.map(([key])=>key).sort(),entries,
    'Production manifest must declare exactly the four approved Vite HTML entries');
  for(const [key,value] of declared)assert.ok(value.src===key&&value.isEntry===true,
    `${key}: production HTML must remain a declared Vite entry`);
  assert.deepEqual([...htmlFiles].sort(),[...entries,...publicPages].sort(),
    'Production build must contain exactly the four Vite entries and three approved public HTML pages');
  return true;
}
export function createSdkOriginInventory({manifest={},declaredVersion,installedVersions={}}={}){
  assert.equal(declaredVersion,reviewedSdkVersion,'SDK origin review requires the exact approved dependency pin');
  for(const name of packages)assert.equal(installedVersions[name],reviewedSdkVersion,
    `${name}: installed version needs a new SDK origin review`);
  const entry=manifest[sdkManifestEntry];
  let sdkFile=null;
  if(entry){
    assert.ok(entry.src===sdkManifestEntry&&entry.isDynamicEntry===true
      &&/^assets\/dist-[A-Za-z0-9_-]+\.js$/.test(entry.file),
    'SDK literals require the exact declared dynamic SDK entry');
    assert.ok(Object.entries(manifest).every(([key,value])=>key===sdkManifestEntry||value.file!==entry.file),
      'SDK literal classification cannot cover a file shared with another manifest entry');
    sdkFile=entry.file;
  }
  return {
    version:reviewedSdkVersion,
    classify({file,origin,source}){
      if(file!==sdkFile||!Object.hasOwn(reviewedOrigins,origin))return null;
      const reviewed=reviewedOrigins[origin];
      const occurrences=source.match(/(?:https?|wss):\/\/[a-zA-Z0-9._:-]+/g)??[];
      assert.equal(occurrences.filter(value=>value===origin).length,reviewed.urls.length,
        `${file}: SDK literal count changed for ${origin}; review the new use`);
      for(const url of reviewed.urls){
        assert.equal(source.split(url).length-1,1,
          `${file}: reviewed SDK documentation/default URL changed; review the new use`);
        assert.ok(/^[`'"]/.test(source.slice(source.indexOf(url)+url.length)),
          `${file}: reviewed SDK URL must end at its original string boundary`);
      }
      return {file,origin,classification:reviewed.classification,purpose:reviewed.purpose,
        evidence:[...reviewed.evidence],urls:[...reviewed.urls]};
    },
  };
}
