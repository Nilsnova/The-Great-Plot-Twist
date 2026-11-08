// Source-only inventory exceptions are pinned and confined to one manifest-declared SDK chunk.
import {describe,it,expect} from 'vitest';
import {assertProductionHtmlInventory,createSdkOriginInventory,literalOrigins,reviewedSdkVersion,sdkManifestEntry} from '../scripts/sdk-origin-inventory.js';

const file='assets/dist-fixture.js';
const manifest={[sdkManifestEntry]:{src:sdkManifestEntry,file,isDynamicEntry:true}};
const versions={'@supabase/supabase-js':reviewedSdkVersion,'@supabase/auth-js':reviewedSdkVersion,
  '@supabase/realtime-js':reviewedSdkVersion};
const source=[
  'http://localhost:9999',
  'https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request',
  'https://github.com/supabase/supabase-js/blob/master/packages/core/realtime-js/migrations/httpsend-server-version.md',
  'https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/migrations/lockless-coordination.md',
  'https://github.com/orgs/supabase/discussions/45715',
].map(value=>JSON.stringify(value)).join(';');
const create=overrides=>createSdkOriginInventory({manifest,declaredVersion:reviewedSdkVersion,
  installedVersions:versions,...overrides});

describe('reviewed SDK origin inventory',()=>{
  it('classifies only the reviewed dormant default and documentation uses in its declared file',()=>{
    const inventory=create();
    expect(inventory.classify({file,source,origin:'http://localhost:9999'})).toMatchObject({
      classification:'dormant-default',origin:'http://localhost:9999',file});
    for(const origin of ['https://developer.mozilla.org','https://github.com']){
      const classification=inventory.classify({file,source,origin});
      expect(classification.classification).toBe('documentation');expect(classification.evidence.length).toBeGreaterThan(0);
    }
    expect(literalOrigins(source)).toEqual(['http://localhost:9999','https://developer.mozilla.org','https://github.com']);
  });
  it('never gives an authored file, another chunk or an absent manifest the SDK classification',()=>{
    for(const wrongFile of ['src/online/auth.js','assets/game-fixture.js','dist/'+file,file+'.map']){
      for(const origin of literalOrigins(source))expect(create().classify({file:wrongFile,source,origin})).toBeNull();
    }
    expect(create({manifest:{}}).classify({file,source,origin:'http://localhost:9999'})).toBeNull();
  });
  it('rejects unknown origins rather than treating SDK placement as a general allowlist',()=>{
    for(const origin of ['https://unreviewed.invalid','http://localhost:9998','https://developer.mozilla.org.evil.invalid',
      'https://localhost:9999','constructor','__proto__']){
      expect(create().classify({file,source:`fetch(${JSON.stringify(origin)})`,origin})).toBeNull();
    }
  });
  it('fails if a reviewed origin gains another occurrence or its specific documented URL changes',()=>{
    expect(()=>create().classify({file,origin:'http://localhost:9999',
      source:source+';fetch("http://localhost:9999")'})).toThrow('literal count changed');
    expect(()=>create().classify({file,origin:'https://developer.mozilla.org',
      source:source.replace('/LockManager/request','/LockManager/other')})).toThrow('URL changed');
    expect(()=>create().classify({file,origin:'http://localhost:9999',
      source:source.replace('http://localhost:9999','http://localhost:9999/new-default')})).toThrow('original string boundary');
  });
  it.each(['^2.118.0','2.118.1','2.119.0',undefined])('requires the exact reviewed dependency pin: %s',declaredVersion=>{
    expect(()=>create({declaredVersion})).toThrow('exact approved dependency pin');
  });
  it.each(Object.keys(versions))('requires the reviewed installed %s version',name=>{
    expect(()=>create({installedVersions:{...versions,[name]:'2.119.0'}})).toThrow('installed version needs a new SDK origin review');
  });
  it('requires the exact lazy SDK source entry and forbids shared/authored asset aliases',()=>{
    for(const entry of [
      {src:'src/online/auth.js',file,isDynamicEntry:true},
      {src:sdkManifestEntry,file,isDynamicEntry:false},
      {src:sdkManifestEntry,file:'../src/online/auth.js',isDynamicEntry:true},
      {src:sdkManifestEntry,file:'assets/game-fixture.js',isDynamicEntry:true},
    ])expect(()=>create({manifest:{[sdkManifestEntry]:entry}})).toThrow('exact declared dynamic SDK entry');
    expect(()=>create({manifest:{...manifest,'src/authored.js':{file}}})).toThrow('shared with another manifest entry');
  });
});

describe('exact production HTML inventory',()=>{
  const entries=['asset-library.html','host.html','index.html','ui-kit.html'];
  const pages=[...entries,'auth-check.html','help.html','privacy.html'];
  const productionManifest={...manifest,...Object.fromEntries(entries.map(src=>[src,{src,isEntry:true,file:'assets/test.js'}]))};
  it('accepts the four compiled entries plus the three existing approved public pages',()=>{
    expect(assertProductionHtmlInventory({manifest:productionManifest,htmlFiles:[...pages].reverse()})).toBe(true);
  });
  it.each(pages)('rejects a missing approved %s page',missing=>{
    expect(()=>assertProductionHtmlInventory({manifest:productionManifest,htmlFiles:pages.filter(file=>file!==missing)}))
      .toThrow('exactly the four Vite entries and three approved public HTML pages');
  });
  it('rejects unexpected pages, including a wrong seven-page set, a nested page and the case lab',()=>{
    for(const htmlFiles of [[...pages,'extra.html'],[...pages.filter(file=>file!=='privacy.html'),'extra.html'],
      [...pages,'nested/index.html'],[...pages,'case-lab.html']]){
      expect(()=>assertProductionHtmlInventory({manifest:productionManifest,htmlFiles}))
        .toThrow('exactly the four Vite entries and three approved public HTML pages');
    }
  });
  it('rejects a changed compiled-entry manifest even when the emitted seven-page list is unchanged',()=>{
    const {['host.html']:removed,...missing}=productionManifest;
    for(const changed of [missing,{...productionManifest,'case-lab.html':{src:'case-lab.html',isEntry:true}}]){
      expect(()=>assertProductionHtmlInventory({manifest:changed,htmlFiles:pages}))
        .toThrow('exactly the four approved Vite HTML entries');
    }
    expect(()=>assertProductionHtmlInventory({manifest:{...productionManifest,
      'host.html':{src:'host.html',isEntry:false}},htmlFiles:pages})).toThrow('declared Vite entry');
  });
});
