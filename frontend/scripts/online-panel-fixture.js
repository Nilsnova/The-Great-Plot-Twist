// Production panels use generated auth and local intercepted answers only. Reports retain no intent values.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openAuthFixture} from './online-auth-fixture.js';

const origins=new Set(['https://placeholder.supabase.co']);
const prefixes={predictions:'/api/predictions',arena:'/api/duels'};
const entries={predictions:'src/screens/predictions/desk.js',arena:'src/screens/duels/index.js'};
const copy=value=>structuredClone(value);
const hasBearer=request=>/^Bearer \S+$/.test(request.headers().authorization??'');
const keys=(value,expected)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join()===expected.slice().sort().join();
const canonical=path=>path.replace(/^(\/api\/duels)\/[^/]+(?=\/|$)/,'$1/:duel');
// The approved GET-only cabin/five-plot baseline shares this panel account's recorded wallet.
const recordedPanelIslet=coins=>({coins,timber:0,signalStationBuilt:false,
  playMoneyNote:'Play money. No cash value. It cannot be bought or cashed out.',
  spots:[
    ['plot_1','cabin','Cabin','built'],['plot_2','workshop','Workshop','empty'],
    ['plot_3','windmill','Windmill','locked'],['plot_4','greenhouse','Greenhouse','locked'],
    ['islet_signal_station','signal_station','Signal station','empty'],
  ].map(([plot,type,name,state])=>({plot,type,name,state,plotName:`Recorded ${name.toLowerCase()} plot`,
    about:'Recorded building information.',level:null,builtAt:null,
    cost:state==='built'?null:{coins:300,timber:10},
    missing:state==='empty'?(coins<300?['coins','timber']:['timber']):[],canBuild:false,
    lockedNote:state==='locked'?'This recorded plot opens later.':null}))});
export async function openPanelFixture({area,flag=true,createService,startPlace}={}){
  assert.ok(Object.hasOwn(prefixes,area)&&typeof createService==='function','A panel fixture names an approved route group');
  const env=await openAuthFixture(),service=createService({userId:env.fixtureUserId,now:()=>Date.now()});
  const panelRequests=[],assetRequests=[],configAuthorizations=[],previous=new Map();let selectedFlag=flag,sequence=0;
  // Count enforcing documents and actual CSP events without retaining URLs, directives or account data.
  const security={enforcingDocuments:0,missingEnforcingPolicy:0,violations:0};
  env.page.on('response',response=>{
    if(!response.request().isNavigationRequest()||response.frame()!==env.page.mainFrame()
      ||new URL(response.url()).origin!==env.url)return;
    if(response.headers()['content-security-policy'])security.enforcingDocuments++;
    else security.missingEnforcingPolicy++;
  });
  env.page.on('console',message=>{
    if(message.type()==='error'&&message.text()==='[recorded panel CSP violation]')security.violations++;
  });
  const landing=startPlace??(area==='predictions'?'saltreach_harbor':'smugglers_cove');
  // One generated account retains its cloud CAS across reloads and panel scenario resets.
  let save={version:1,data:{kind:'world',actions:['to_desk'],place:landing},updatedAt:null};
  const saveStats={reads:0,acceptedPuts:0,conflicts:0};
  const asset=request=>{const target=new URL(request.url());if(target.origin===env.url&&target.pathname.startsWith('/assets/'))assetRequests.push(target.pathname);};
  env.page.on('request',asset);
  try{
    await env.page.addInitScript(()=>{
      document.addEventListener('securitypolicyviolation',()=>console.error('[recorded panel CSP violation]'));
    });
    const manifest=JSON.parse(await readFile(new URL('../.test-cache/g9-online-dist/.vite/manifest.json',import.meta.url),'utf8'));
    const modulePaths={};
    for(const [name,key] of Object.entries(entries)){
      assert.ok(manifest[key]?.file,'The production manifest identifies the actual panel entry');
      modulePaths[name]=['/'+manifest[key].file];
    }
    await env.page.route('**/api/**',async route=>{
      const request=route.request(),path=new URL(request.url()).pathname,method=request.method();
      if(path==='/api/config'){configAuthorizations.push(Boolean(request.headers().authorization));return route.fulfill({json:{flags:{sign_in:true,live_presence:false,market:false,
        predictions:area==='predictions'?selectedFlag:false,arena:area==='arena'?selectedFlag:false,
        case:false,bulletin:false},auth:{provider:'github'}}});}
      if(path==='/api/islet'){
        assert.equal(method,'GET','The panel baseline never accepts an islet change');
        assert.ok(hasBearer(request),'The panel islet baseline requires the generated Bearer A2 session');
        assert.ok(request.postData()===null,'A panel islet GET carries no request body');
        const coins=service.snapshot().coins;
        assert.ok(Number.isSafeInteger(coins)&&coins>=0,'The panel supplies a valid recorded authoritative wallet');
        return route.fulfill({json:recordedPanelIslet(coins)});
      }
      if(path==='/api/save'){
        assert.ok(hasBearer(request),'Recorded cloud saves require the generated Bearer A2 session');
        if(method==='GET'){
          assert.ok(request.postData()===null,'A recorded save GET carries no request body');
          saveStats.reads+=1;return route.fulfill({json:copy(save)});
        }
        assert.equal(method,'PUT','Recorded saves use only the published GET/PUT route');
        let body;try{body=request.postDataJSON();}catch{}
        assert.ok(keys(body,['version','data']),'A recorded save PUT sends only version and data');
        assert.ok(Number.isInteger(body.version)&&body.version>0&&body.version<2147483647,
          'A recorded save PUT supplies a bounded server version');
        assert.ok(keys(body.data,['kind','actions','place'])&&body.data.kind==='world'&&body.data.place===landing
          &&Array.isArray(body.data.actions)&&body.data.actions.length<=300
          &&body.data.actions.every(action=>typeof action==='string'&&/^[a-z0-9_]{1,40}$/.test(action))
          &&Buffer.byteLength(JSON.stringify(body.data))<=100000,
          'A panel save retains only its valid recorded world replay and published landing');
        if(body.version!==save.version){saveStats.conflicts+=1;return route.fulfill({status:409,
          json:{error:{code:'stale_save',message:'Recorded save version changed.'}}});}
        save={version:save.version+1,data:copy(body.data),updatedAt:new Date().toISOString()};saveStats.acceptedPuts+=1;
        return route.fulfill({json:copy(save)});
      }
      if(path==='/api/me'&&method==='GET')return route.fulfill({json:{id:env.fixtureUserId,
        displayName:'Recorded Captain',captainName:'Recorded Captain',coins:service.snapshot().coins,
        crews:[],kit:'witness',place:landing}});
      if(!path.startsWith(prefixes[area]))return route.fallback();
      let body;try{body=request.postDataJSON();}catch{body=undefined;}
      const authorized=Boolean(request.headers().authorization),safePath=canonical(path),key=method+':'+safePath;
      const uid=typeof body?.stakeId==='string'?body.stakeId:typeof body?.actionUid==='string'?body.actionUid:null;
      const serialized=body===undefined?null:JSON.stringify(body),prior=previous.get(key);
      panelRequests.push({sequence:++sequence,group:area,path:safePath,method,authorized,
        bodyKeys:body&&typeof body==='object'?Object.keys(body).sort():[],uidPresent:uid!==null,
        sameUid:prior?uid!==null&&uid===prior.uid:null,sameBody:prior?serialized===prior.serialized:null});
      if(method!=='GET')previous.set(key,{uid,serialized});
      if(area==='predictions'&&path==='/api/predictions'&&authorized)
        return route.fulfill({status:403,json:{error:{code:'forbidden',message:'Recorded anonymous boundary.'}}});
      if(!(area==='predictions'&&path==='/api/predictions')&&!authorized)
        return route.fulfill({status:401,json:{error:{code:'unauthorized',message:'Recorded sign-in boundary.'}}});
      const result=await service.handle({method,path,body,authorized});
      if(!result)return route.fulfill({status:404,json:{error:{code:'not_found',message:'Recorded route is unavailable.'}}});
      if(result.abort)return route.abort('failed');
      return route.fulfill({status:result.status??200,headers:result.headers??{},json:result.json});
    });
    return {...env,panel:service,panelRequests,assetRequests,panelSecurity:()=>({...security}),panelSnapshot:()=>service.snapshot(),
      panelSaveStats:()=>({...saveStats,version:save.version,security:{...security}}),
      configAnonymous:()=>configAuthorizations.length>0&&configAuthorizations.every(value=>!value),
      setPanelFlag(value){selectedFlag=value;},resetPanel(){service.reset();previous.clear();},
      moduleRequested(name=area){return modulePaths[name].some(path=>assetRequests.includes(path));}};
  }catch(error){await env.close();throw error;}
}

export function assertPanelPrivacy(env){
  const security=env.panelSecurity();
  assert.ok(security.enforcingDocuments>0&&security.missingEnforcingPolicy===0,
    'Every recorded panel document has an enforcing Content-Security-Policy header');
  assert.equal(security.violations,0,'Authenticated panel journeys emit no securitypolicyviolation event');
  assert.ok(env.consoleErrors.every(error=>error.resource),
    'Authenticated panels emit no CSP or other non-resource console error');
  assert.ok(env.external.every(value=>origins.has(new URL(value).origin)),'Panel requests stay on intercepted placeholder origins');
  assert.ok(!env.requests.some(request=>request.path==='/api/auth/exchange'),'Panels never use the retired auth exchange');
  assert.ok(env.configAnonymous(),'Panel configuration reads carry no account token');
  assert.ok(!env.panelRequests.some(request=>request.path.endsWith('/settle')),'Ordinary players send no prediction settlement');
  assert.ok(env.panelRequests.filter(request=>request.path==='/api/predictions').every(request=>!request.authorized),
    'The public prediction list carries no account token');
  assert.ok(env.panelRequests.filter(request=>request.path!=='/api/predictions').every(request=>request.authorized),
    'Own panel reads and changes use the private A2 boundary');
}

// Observe native readiness only; never force a save, change storage or call an application hook.
export async function waitForPanelSaved(env){
  const {page}=env;
  await page.locator('.captain-status > [role="status"][data-state="saved"]').waitFor({state:'visible'});
  const native=await page.locator('.captain-status > [role="status"][data-state]').evaluate(element=>({
    state:element.dataset.state,healthy:!/(?:offline|conflict|saving)/i.test(element.textContent??'')}));
  assert.ok(native.state==='saved'&&native.healthy,'The native captain status is Saved before the panel proof/capture');
  const stats=env.panelSaveStats();
  assert.ok(stats.reads>0&&stats.conflicts===0&&stats.version===stats.acceptedPuts+1,
    'The same recorded account keeps coherent incrementing cloud CAS without a save conflict');
}
