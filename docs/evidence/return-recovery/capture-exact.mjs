// Verify reward-return browser wiring with real client modules and a persistent loopback fixture.
// Used by coop-wave review. The HTTP fixture is synthetic and never contacts a live account/database.
import {createServer} from '/workspace/The-Great-Plot-Twist/frontend/node_modules/vite/dist/node/index.js';
import {chromium} from '/workspace/The-Great-Plot-Twist/frontend/node_modules/playwright-core/index.mjs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
const [source = '/workspace/wave-return-recovery', label = 'final'] = process.argv.slice(2);
const out='/tmp/coop-return-browser/'+label;
await mkdir(out,{recursive:true});
const fixture = `
import '/src/ui/base.css';
import '/src/ui/kit/kit.css';
import '/src/ui/styles.css';
import '/src/ui/kit/components.css';
import {createHud} from '/src/ui/hud.js';
import {createWaveController} from '/src/pirates/controller.js';
import {createWaveHud} from '/src/pirates/hud.js';
import {createNarrator} from '/src/narrator/index.js';
import {createSession} from '/src/online/session.js';
import {createAdapterStore} from '/src/online/adapter/store.js';
import {createAdapterTransport} from '/src/online/adapter/transport.js';
import {createReadMonitor} from '/src/online/adapter/read-monitor.js';
import {createPanelWallet} from '/src/online/adapter/panel-wallet.js';
import {registerPanelServices} from '/src/online/panel-services.js';
import {createWaveRewardRecovery} from '/src/online/wave-reward-recovery.js';
const ACCOUNT='12345678-1234-4234-8234-123456789abc';
const TOKEN='7165d60f-14f5-4b9e-96a0-2ed457b4c219';
const CURRENT='62345678-1234-4234-8234-123456789abc';
const START=Date.UTC(2026,10,18,12);
const listeners=new Map(), events=[], calls=[], timers=[], deliveredWallet=[];
const on=(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);return()=>listeners.get(type).delete(fn)};
const emit=event=>{events.push(event);for(const fn of listeners.get(event.type)??[])fn(event)};
if(!localStorage.getItem('fixture_initialized')){localStorage.setItem('plot_twist_first_quests_v1',JSON.stringify({version:1,done:1}));localStorage.setItem('fixture_initialized','1')}
const hud=createHud(document.querySelector('#game'),{hasIsland:()=>true,travel:()=>false,start:()=>{}},{on,emit,storage:localStorage,toast:()=>{}});
hud.setCoinSource('island');hud.setCoins(100);hud.arrive('home_islet');
const session=createSession();session.setToken('offline-fixture-session');
const store=createAdapterStore({session});
store.commit({me:{id:ACCOUNT,captainName:'Fixture Captain',coins:100,kit:'witness',place:'home_islet',crews:[]},config:{flags:{islands:false}},accountState:'signed_in'});
store.subscribe(({view})=>hud.setCaptain(view));hud.setCaptain(store.read());
const request=async(method,path,body)=>{
 calls.push({method,path});
 try{const response=await fetch(path,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();return response.ok?{ok:true,status:response.status,data}:{ok:false,status:response.status,...data}}catch{return{ok:false,status:0,code:'network_error'}}
};
const api={get:path=>request('GET',path),post:(path,body)=>request('POST',path,body)};
const ctx={session,store,state:store.state,api,publicApi:api,accept:()=>({accepted:true,reason:null,message:''}),refuse:reason=>({accepted:false,reason,message:reason}),waitForSetup:async()=>{},onMeRefreshed:async()=>({setupHandled:false})};
ctx.readMonitor=createReadMonitor(ctx);ctx.transport=createAdapterTransport(ctx);
const panelWallet=createPanelWallet(ctx);
const lease=registerPanelServices(session,{api:panelWallet.api,publicApi:api,getFlags:()=>({islands:false}),isReady:()=>true,getIdentity:()=>ACCOUNT,getWallet:()=>panelWallet.freshWallet()});
const narrator=createNarrator({container:document.querySelector('#game'),on,getGame:()=>({code:'ISLE-K7Q2M',waveBest:5}),preferences:()=>({narrator:true,captions:false,master:0,voice:0}),onPreferences:()=>()=>{},storage:null,fetchImpl:null,held:()=>true,createCard:()=>({show(){},hide(){},dispose(){},visible:false}),setTimer:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimer:()=>{}});
let now=START;
const snap={recoveryVersion:1,waveProtocol:2,configVersion:1,waveId:CURRENT,islandEpoch:'epoch-fixture',seed:77,startsAt:new Date(START).toISOString(),weather:{kind:'calm',ships:1,fog:0},rules:['structure_recovery'],participants:[{participantToken:TOKEN,captain:{level:1,skills:[],weapon:'musket'}}],createWave:{seed:77,wave:6,defenses:[]},structures:[]};
const recoveryTransport={readEvents:async()=>({headSeq:0,sealedThroughTick:30,events:[]}),sendInputs:async()=>({accepted:[]}),checkpoint:async()=>({accepted:true}),finishWave:async()=>{throw new Error('Active fixture wave must not finish')}};
const battle=createWaveController({bus:{on,emit},world:{container:document.querySelector('#game'),place:()=> 'home_islet'},place:'home_islet',playerId:ACCOUNT,now:()=>now,recoveryPlayoutMs:0,recoveryTransport,createRenderer:()=>null,createHud:createWaveHud,createEventArt:()=>null,createFinisherScene:()=>null,accept:()=>true,setTimer:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimer:()=>{},reducedMotion:()=>true});
emit({type:'wave_started_server',waveId:CURRENT,wave:6,seed:77,where:'own',startsAt:snap.startsAt,weather:snap.weather,rules:snap.rules,recoveryVersion:1,waveProtocol:2,initialSnapshot:snap,participantToken:TOKEN,lastActorCounter:0});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
await tick();now+=1000;battle.update(.05);await tick();battle.update(.05);await tick();
const before={waveId:battle.wave?.info.waveId,done:battle.wave?.done,queued:[...narrator.queued],speaking:narrator.speaking,lowProbe:narrator.say('player_revived')};
let host=null;
window.startRecovery=()=>{sessionStorage.setItem('resume_recovery','1');host??=createWaveRewardRecovery({session,emit,onWallet:value=>{deliveredWallet.push(value);hud.setCoins(value)},onReset:()=>hud.resetRecoveredWins()});return true};
window.report=()=>({hudCoins:hud.coins,accountCoins:store.read().captain.coins,quests:hud.quests,deliveredWallet,calls,events:events.filter(event=>['wave_finished','wave_finish_answered','wave_controller_started','wave_controller_stopped','wave_rewards_recovered'].includes(event.type)),before,battle:{waveId:battle.wave?.info.waveId,done:battle.wave?.done,ticks:battle.wave?.ticks},narrator:{queued:[...narrator.queued],speaking:narrator.speaking,lowProbe:narrator.say('player_revived')},hudText:document.querySelector('.hud')?.innerText,activeHud:document.querySelector('.pirate-hud')?.innerText});
window.ready=true;
if(sessionStorage.getItem('resume_recovery')==='1')window.startRecovery();
`;
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wave reward return fixture</title><style>html,body{margin:0;width:100%;height:100%;background:#254348;color:#fff4d5}#game{position:fixed;inset:0}.fixture{position:fixed;z-index:99999;bottom:16px;left:16px;right:16px;font:14px/1.4 system-ui;background:#142523;padding:10px;border:1px solid #b9a56a;max-width:580px;pointer-events:none}.fixture strong{display:block}</style></head><body><div id="game"></div><aside class="fixture"><strong>Offline reward-return wiring fixture</strong>Real recovery host, wallet reader and HUD. Synthetic server keeps a paid reward after a lost response and full page reload. Wave 6 stays active. No account or database call.</aside><script type="module" src="/__reward-fixture.js"></script></body></html>`;
let state,settledResolve;
function reset(){state={coins:100,wonWaveBest:0,pending:true,applied:0,lost:0,recoverCalls:0,meReads:0,recoverBodies:[],replies:[]};return new Promise(resolve=>{settledResolve=resolve})}
function json(res,value){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value))}
const server=await createServer({root:`${source}/frontend`,configFile:false,cacheDir:'/tmp/coop-return-browser/cache-'+label,server:{host:'127.0.0.1',port:0,strictPort:true,hmr:false},plugins:[{name:'reward-fixture',configureServer(server){server.middlewares.use(async(req,res,next)=>{
if(req.url==='/__reward-fixture.html'){res.setHeader('Content-Type','text/html');res.end(html);return}
if(req.url==='/__reward-fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return}
if(req.url==='/api/waves/recover'&&req.method==='POST'){
let body='';for await(const chunk of req)body+=chunk;state.recoverBodies.push(JSON.parse(body));state.recoverCalls++;
if(state.pending){state.pending=false;state.coins+=15;state.wonWaveBest=5;state.applied++;state.lost++;settledResolve();res.destroy();return}
const reply={coins:state.coins,wonWaveBest:state.wonWaveBest,recovered:[],hasMore:false};state.replies.push(reply);json(res,reply);return}
if(req.url==='/api/me'&&req.method==='GET'){state.meReads++;json(res,{id:'12345678-1234-4234-8234-123456789abc',captainName:'Fixture Captain',coins:state.coins,kit:'witness',place:'home_islet',crews:[]});return}
if(req.url?.startsWith('/api/')){res.statusCode=404;json(res,{error:{code:'fixture_route_missing'}});return}
next();})}}]});
let browser;
try{
await server.listen();const url=server.resolvedUrls.local[0];browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const reports=[];
for(const viewport of [{width:1280,height:720},{width:375,height:812}]){
const settled=reset();const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];
page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
await page.goto(url+'__reward-fixture.html');await page.waitForFunction(()=>window.ready===true);const before=await page.evaluate(()=>window.report());
if(before.hudCoins!==100||before.quests.done!==1||before.battle.done!==false||!before.activeHud?.includes('Wave 6'))throw new Error('Invalid starting fixture: '+JSON.stringify(before));
await page.screenshot({path:`${out}/before-${viewport.width}x${viewport.height}.png`,fullPage:true});
await page.evaluate(()=>window.startRecovery());await settled;await page.reload();await page.waitForFunction(()=>window.ready===true);
await page.waitForFunction(()=>{const r=window.report();return r.hudCoins===115&&r.accountCoins===115&&r.quests.done===2});
const after=await page.evaluate(()=>window.report());
if(!after.activeHud?.includes('Wave 6')||after.battle.waveId!==after.before.waveId||after.battle.done!==false||after.narrator.lowProbe.length!==0||JSON.stringify(after.narrator.queued)!==JSON.stringify(after.before.queued)||after.narrator.speaking!==after.before.speaking)throw new Error('Recovery affected active wave/narrator: '+JSON.stringify(after));
if(after.events.some(event=>['wave_finished','wave_finish_answered','wave_controller_stopped'].includes(event.type)))throw new Error('Recovery emitted an active wave lifecycle result');
if(state.applied!==1||state.lost!==1||state.replies.length<1||state.replies.some(reply=>reply.recovered.length!==0)||state.meReads<1||state.recoverBodies.some(body=>Object.keys(body).length!==0)||errors.length)throw new Error('Fixture conservation/request/error check failed: '+JSON.stringify({state,errors}));
await page.screenshot({path:`${out}/after-${viewport.width}x${viewport.height}.png`,fullPage:true});
reports.push({viewport,before,after,server:structuredClone(state),pageErrors:errors});await context.close();
}
const modulePaths=['frontend/src/online/wave-reward-recovery.js','frontend/src/online/panel-services.js','frontend/src/online/adapter/panel-wallet.js','frontend/src/online/adapter/store.js','frontend/src/online/adapter/transport.js','frontend/src/online/adapter/read-monitor.js','frontend/src/ui/hud.js','frontend/src/ui/quest-events.js','frontend/src/pirates/controller.js','frontend/src/pirates/hud.js','frontend/src/narrator/index.js'];
const moduleSha256=Object.fromEntries(await Promise.all(modulePaths.map(async path=>[path,createHash('sha256').update(await readFile(source+'/'+path)).digest('hex')])));
const report={label,moduleSha256,comparison:'Before and after recovery on the same client source; not an old-code baseline.',source,sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),trackedDiffSha256:createHash('sha256').update(execFileSync('git',['diff','--no-ext-diff','HEAD'],{cwd:source})).digest('hex'),scriptSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),browser:browser.version(),limits:'Real production recovery host, private panel-service lease, panel-wallet, account adapter/read monitor, HUD, active controller and narrator. Persistent loopback HTTP server is a synthetic fixture; no live account/database, real refund SQL, 3D island or physical-device claim.',reports};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await server.close()}
