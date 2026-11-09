// Public bulletin/weather fixtures intercept the production client; credentials come from the auth fixture.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openAuthFixture} from './online-auth-fixture.js';
import {signInFromTitle} from './online-chaos-signin.js';
import {recordedBulletin} from '../tests/fixtures/server/bulletin.js';
import {DEFAULT_ATTRIBUTION} from '../src/net/weather.js';

export const PUBLIC_BULLETIN_TEXT='Recorded public weather bulletin.';
const paths=new Set(['/api/config','/api/me','/api/me/name','/api/save','/api/crews/me','/api/bulletin','/api/weather']);
const moduleKeys=['src/online/case-adapter/bulletin.js','src/screens/bulletin/index.js'];
const exactKeys=(value,expected)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===expected.slice().sort().join();
export async function openBulletinFixture({clock=false}={}){
  const env=await openAuthFixture(),{page}=env;
  // Numeric enforcing-header and event proof only; no URL, directive or account value is retained.
  const security={enforcingDocuments:0,missingEnforcingPolicy:0,violations:0};
  page.on('response',response=>{
    if(!response.request().isNavigationRequest()||response.frame()!==page.mainFrame()
      ||new URL(response.url()).origin!==env.url)return;
    if(response.headers()['content-security-policy'])security.enforcingDocuments++;
    else security.missingEnforcingPolicy++;
  });
  page.on('console',message=>{
    if(message.type()==='error'&&message.text()==='[recorded bulletin CSP violation]')security.violations++;
  });
  try{
    await page.addInitScript(()=>addEventListener('securitypolicyviolation',()=>console.error('[recorded bulletin CSP violation]')));
    if(clock)await page.clock.install({time:new Date()});
    const manifest=JSON.parse(await readFile('.test-cache/g9-online-dist/.vite/manifest.json','utf8'));
    const modules=moduleKeys.map(key=>{
      assert.ok(manifest[key]?.file&&manifest[key].isDynamicEntry,'The bulletin controller/drawer must have real dynamic entries');
      return {key,path:'/'+manifest[key].file};
    });
    let flag=false,reply='ready',text=PUBLIC_BULLETIN_TEXT;
    // This recorded account persists across normal lifecycle reads and autosaves in one journey.
    let save={version:1,data:{kind:'world',actions:[],place:'saltreach_harbor'},updatedAt:null};
    const saveStats={reads:0,acceptedPuts:0,conflicts:0};
    let entryPuts=null;
    const requests=[],resources=new Set();
    page.on('request',request=>{
      const url=new URL(request.url());
      if(url.origin!==env.url)return;
      if(url.pathname.endsWith('.js'))resources.add(url.pathname);
      if(url.pathname.startsWith('/api/'))requests.push({method:request.method(),
        path:paths.has(url.pathname)?url.pathname:':other-api',bearer:!!request.headers().authorization});
    });
    const error=(route,status,code)=>route.fulfill({status,json:{error:{code,message:'Recorded public service failure.'}}});
    await page.route('**/api/**',async route=>{
      const request=route.request(),path=new URL(request.url()).pathname,method=request.method();
      if(!paths.has(path))return route.fallback();
      if(['/api/config','/api/bulletin','/api/weather'].includes(path)&&method!=='GET')return error(route,405,'method_not_allowed');
      if(path==='/api/config')return route.fulfill({json:{flags:{sign_in:true,live_presence:false,
        market:false,predictions:false,arena:false,case:false,festival:false,bulletin:flag}}});
      if(path==='/api/bulletin'){
        if(reply==='offline')return route.abort('failed');
        if(reply==='gateway')return error(route,502,'database_error');
        if(reply==='unavailable')return error(route,503,'bulletin_unavailable');
        if(reply==='off')return error(route,404,'feature_off');
        const data=recordedBulletin({hook:true,text});
        data.weather.tonight={date:'2026-11-07',startsAt:'2026-11-07T00:00:00Z',endsAt:'2026-11-08T00:00:00Z',
          state:'calm',isNow:true,isFogNight:false,fogNightKind:null};
        return route.fulfill({json:data});
      }
      if(path==='/api/weather')return route.fulfill({json:{cloudCover:.7,rain:.8,fog:.35,wind:.73,
        isDay:true,summary:'Recorded weather',place:'Recorded coastal station',source:'fallback',
        fetchedAt:'2026-11-07T12:00:00Z',attribution:DEFAULT_ATTRIBUTION}});
      if(!request.headers().authorization)return error(route,401,'unauthorized');
      if(path==='/api/me'&&method==='GET')return route.fulfill({json:{id:env.fixtureUserId,
        captainName:'Recorded Captain',coins:0,crews:[],kit:'witness',place:'saltreach_harbor'}});
      if(path==='/api/me/name'&&method==='POST')return route.fulfill({json:{captainName:'Recorded Captain',rerollsLeft:1}});
      if(path==='/api/save'){
        if(method==='GET'){saveStats.reads+=1;return route.fulfill({json:structuredClone(save)});}
        if(method!=='PUT')return error(route,405,'method_not_allowed');
        let body;try{body=request.postDataJSON();}catch{}
        assert.ok(exactKeys(body,['version','data']),'A recorded autosave sends only the published version and data');
        assert.ok(Number.isInteger(body.version)&&body.version>0&&body.version<2147483647,
          'A recorded autosave supplies a bounded server version');
        assert.ok(exactKeys(body.data,['kind','actions','place'])&&body.data.kind==='world'
          &&body.data.place==='saltreach_harbor'&&Array.isArray(body.data.actions)&&body.data.actions.length===0
          &&Buffer.byteLength(JSON.stringify(body.data))<=100000,
          'The bulletin journey saves only its recorded harbor continuation without new story actions');
        if(body.version!==save.version){saveStats.conflicts+=1;return error(route,409,'stale_save');}
        save={version:save.version+1,data:structuredClone(body.data),updatedAt:'2026-11-07T12:00:00Z'};
        saveStats.acceptedPuts+=1;
        return route.fulfill({json:{version:save.version,updatedAt:save.updatedAt}});
      }
      if(path==='/api/crews/me'&&method==='GET')return route.fulfill({json:{crew:null}});
      return error(route,405,'method_not_allowed');
    });
    return {...env,bulletinSecurity:()=>({...security}),publicRequests:requests,
      setFlag:value=>{flag=value;},setReply:(value,nextText=text)=>{reply=value;text=nextText;},
      reads:path=>requests.filter(item=>item.path===path),
      runtimeImports:()=>modules.filter(item=>resources.has(item.path)).map(item=>item.key),
      saveStats:()=>({...saveStats,version:save.version,entryPuts,security:{...security}}),
      async enterWorld(){await signInFromTitle(env);
        await page.locator('#play').click();
        await page.locator('.hud.exploring').waitFor();
        await page.locator('.intro-modal[open]').waitFor({state:'hidden'});
        await assertBulletinSaveReady(page);
        assert.ok(saveStats.acceptedPuts>0,'The native world continuation receives an accepted versioned save');
        entryPuts=saveStats.acceptedPuts;},
    };
  }catch(error){await env.close();throw error;}
}
export async function assertBulletinSaveReady(page){
  const status=page.locator('.captain-status > [role="status"][data-state]');
  await status.waitFor({state:'visible'});
  assert.equal(await status.count(),1,'The native captain has one authoritative save status');
  await page.locator('.captain-status > [role="status"][data-state="saved"]').waitFor({state:'visible'});
  const saved=await status.evaluate(element=>({state:element.dataset.state,
    healthy:!/(?:offline|conflict|saving)/i.test(element.textContent??'')}));
  assert.ok(saved.state==='saved'&&saved.healthy,'The native captain confirms cloud save readiness without Offline or Conflict');
}
export async function openBulletinDrawer(page){
  const journal=page.locator('.hud.exploring .hud-actions').getByRole('button',{name:'Journal',exact:true});
  if(await journal.getAttribute('aria-expanded')!=='true')await journal.click();
  const entry=page.locator('.case-toolbar').getByRole('button',{name:/^(?:Tonight\b|Harbor bulletin$|Bulletin$)/}).first();
  await entry.waitFor({state:'visible'});await entry.click();
  const drawer=page.locator('.case-modal[open] .bulletin-screen');await drawer.waitFor({state:'visible'});return drawer;
}
export async function closeBulletinDrawer(page){
  await page.keyboard.press('Escape');await page.locator('.case-modal[open]').waitFor({state:'hidden'});
}
export async function retryBulletin(page){
  const retry=page.locator('.case-modal[open]').getByRole('button',{name:'Retry bulletin',exact:true});
  await retry.waitFor({state:'visible'});await retry.click();
}
export function nextBulletinRead(page){return page.waitForRequest(request=>{
  try{return new URL(request.url()).pathname==='/api/bulletin'&&request.method()==='GET';}catch{return false;}
});}
export function assertPublicBulletinTraffic(env){
  const security=env.bulletinSecurity();
  assert.ok(security.enforcingDocuments>0&&security.missingEnforcingPolicy===0,'Every recorded Bulletin document has enforcing Content-Security-Policy');
  assert.equal(security.violations,0,'Authenticated Bulletin journeys emit no securitypolicyviolation event');
  const reads=env.publicRequests.filter(item=>['/api/bulletin','/api/weather'].includes(item.path));
  assert.ok(reads.every(item=>item.method==='GET'&&!item.bearer),'Public bulletin/weather reads must not carry a bearer');
  assert.ok(env.publicRequests.every(item=>item.method==='GET'||item.method==='POST'&&item.path==='/api/me/name'
    ||item.method==='PUT'&&item.path==='/api/save'),
    'The public drawer sends no mutation beyond normal captain setup and validated autosave');
  const saves=env.saveStats(),puts=env.publicRequests.filter(item=>item.method==='PUT'&&item.path==='/api/save');
  assert.equal(saves.conflicts,0,'Normal recorded autosaves never receive a fabricated conflict');
  assert.equal(puts.length,saves.acceptedPuts,'Every save PUT receives a validated compare-and-swap acknowledgement');
  assert.equal(saves.version,1+saves.acceptedPuts,'The recorded server increments its persistent save version once per accepted PUT');
  assert.ok(Number.isInteger(saves.entryPuts)&&saves.entryPuts>0,'Native world entry establishes the legitimate save-write baseline');
  assert.equal(saves.acceptedPuts,saves.entryPuts,'Bulletin, Credits, public read retries and idle timers send no extra save PUT');
  assert.equal(env.pageErrors.length,0,'The intercepted public flow has no uncaught browser error');
  assert.equal(env.consoleErrors.filter(error=>!error.resource).length,0,'No unexpected application console error');
  assert.ok(env.external.every(value=>new URL(value).origin==='https://placeholder.supabase.co'),
    'Outside requests stay on intercepted placeholder endpoints');
}
