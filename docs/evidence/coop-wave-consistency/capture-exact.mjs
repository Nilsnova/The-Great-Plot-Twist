// Bounded browser evidence using real controller/HUD with a synthetic canonical close receipt.
// Used by the coop-wave-consistency review; never talks to an account or database.
import {createServer} from '/workspace/The-Great-Plot-Twist/frontend/node_modules/vite/dist/node/index.js';
import {chromium} from '/workspace/The-Great-Plot-Twist/frontend/node_modules/playwright-core/index.mjs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const [source = '/workspace/wave-integration', label = 'before'] = process.argv.slice(2);
const out = `/tmp/coop-wave-browser/${label}`;
await mkdir(out, {recursive: true});
const fixture = `
import '/src/ui/base.css';
import '/src/ui/kit/kit.css';
import '/src/pirates/pirates.css';
import {createWaveController} from '/src/pirates/controller.js';
import {createWaveHud} from '/src/pirates/hud.js';
import {createWaveFlow} from '/src/island/wave-flow.js';
const START = Date.UTC(2026,10,18,12), TOKEN='7165d60f-14f5-4b9e-96a0-2ed457b4c219';
const listeners=new Map(), events=[], calls=[], timers=[];
const bus={on(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);return()=>listeners.get(type).delete(fn)},emit(event){events.push(event);for(const fn of listeners.get(event.type)??[])fn(event)}};
let now=START;
const snapshot={recoveryVersion:1,waveProtocol:2,configVersion:1,waveId:'wave-r',islandEpoch:'epoch-r',seed:77,startsAt:new Date(START+1000).toISOString(),weather:{kind:'calm',ships:1,fog:0},rules:['structure_recovery'],participants:[{participantToken:TOKEN,captain:{level:1,skills:[],weapon:'musket'}}],createWave:{seed:77,wave:2,weather:{kind:'calm',ships:1,fog:0},defenses:[{id:'wall_1',kind:'wall',level:1,x:0,z:1}]},structures:[{spot:'wall_1',instanceId:'wall-instance',kind:'wall',level:1,x:0,z:1,hpUnits:1000000,maxHP:60,repairSeq:0}]};
const transport={
readEvents:async()=>({headSeq:0,sealedThroughTick:Math.max(-1,Math.floor((now-(START+1000))/50)-1),events:[]}),
sendInputs:async request=>({accepted:request.inputs.map((item,index)=>({serverSeq:index+100,effectiveTick:item.tick,type:'captain_input',participantToken:TOKEN,payload:{...item,participantToken:TOKEN,captain:{level:1,skills:[],weapon:'musket'}}}))}),
checkpoint:async({checkpoint})=>({accepted:true,...checkpoint}),
finishWave:async body=>{calls.push(body);return{ok:true,data:{loot:35,coins:135,waveBest:1,flags:1,boss:false,survived:true,recovery:{waveId:body.waveId,islandEpoch:body.checkpoint.islandEpoch,closedAt:new Date(START).toISOString(),closedHp:body.checkpoint.hpUnits,checkpointUid:body.checkpoint.checkpointUid,throughTick:body.checkpoint.throughTick,inputHeadSeq:body.checkpoint.inputHeadSeq,lastRepairSeq:body.checkpoint.lastRepairSeq,basisRepairSeq:body.checkpoint.basisRepairSeq}}}}
};
const controller=createWaveController({bus,now:()=>now,recoveryTransport:transport,recoveryPlayoutMs:0,playerId:'account-id',world:{container:document.querySelector('#game')},getDefenses:()=>[],createRenderer:()=>null,createHud:createWaveHud,createEventArt:()=>null,createFinisherScene:()=>null,reducedMotion:()=>true,setTimer:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimer:()=>{},accept:()=>true});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const step=async ms=>{now+=ms;controller.update(.05);await tick();await tick()};
window.runFixture=async()=>{
bus.emit({type:'wave_started_server',waveId:'wave-r',wave:2,seed:77,startsAt:snapshot.startsAt,weather:snapshot.weather,rules:snapshot.rules,recoveryVersion:1,waveProtocol:2,initialSnapshot:snapshot,participantToken:TOKEN,lastActorCounter:0});
await tick();await step(1000);
for(let i=0;i<40&&!controller.wave.done;i++)await step(60000);
for(let i=0;i<20&&!controller.wave.recoveryFinishAnswered;i++)await step(500);
await step(0);
return{done:controller.wave.done,localResult:controller.wave.sim.result(),presentedResult:controller.wave.result,answered:controller.wave.recoveryFinishAnswered,finishCalls:calls.length,finishRequestSurvived:calls[0]?.survived,canonicalReceipt:controller.wave.answer,screens:document.querySelector('.pirate-hud')?.innerText,events:events.filter(event=>['wave_finished','wave_finish_answered'].includes(event.type))};
};
window.staleStart=async()=>{
let resolve;const started=[];const flow=createWaveFlow({api:{startWave:()=>new Promise(done=>{resolve=done})},emit:event=>started.push(event),hasRenderer:()=>true,now:()=>START,setTimer:()=>1,clearTimer:()=>{}});
const pending=flow.ring('ISLE-AAAAA');flow.reset();resolve({ok:true,data:{waveId:'wave-A',wave:2,seed:77,startsAt:new Date(START+10000).toISOString(),weather:{kind:'calm'},flagship:false}});await pending;const result={started:started.filter(event=>event.type==='wave_started_server').length,current:flow.current?.wave?.waveId??null};flow.dispose();return result;
};
window.ready=true;
`;
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Coop result regression fixture</title><style>html,body{margin:0;width:100%;height:100%;background:#254348;color:#fff4d5}#game{position:fixed;inset:0}.fixture{position:fixed;z-index:99999;bottom:16px;left:16px;right:16px;font:14px/1.4 system-ui;background:#142523;padding:10px;border:1px solid #b9a56a;max-width:560px;pointer-events:none}.fixture strong{display:block}</style></head><body><div id="game"></div><aside class="fixture"><strong>Offline controller + HUD regression fixture</strong>The local simulation loses; a synthetic server receipt confirms a previously saved victory and 35 coins. No account, payment or database call.</aside><script type="module" src="/__coop-wave-fixture.js"></script></body></html>`;
const server=await createServer({root:`${source}/frontend`,configFile:false,cacheDir:`/tmp/coop-wave-browser/cache-${label}`,server:{host:'127.0.0.1',port:0,strictPort:true,hmr:false},plugins:[{name:'coop-fixture',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url==='/__coop-wave-fixture.html'){res.setHeader('Content-Type','text/html');res.end(html)}else if(req.url==='/__coop-wave-fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture)}else next()})}}]});
let browser;
try{
await server.listen();const url=server.resolvedUrls.local[0];
browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const reports=[];
for(const viewport of [{width:1280,height:720},{width:375,height:812}]){
const page=await browser.newPage({viewport});const errors=[];
await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
page.on('pageerror',error=>errors.push(error.message));
await page.goto(`${url}__coop-wave-fixture.html`);await page.waitForFunction(()=>window.ready===true);
const result=await page.evaluate(()=>window.runFixture());const stale=await page.evaluate(()=>window.staleStart());
if(!result.done||!result.answered||result.finishCalls!==1||result.finishRequestSurvived!==false)throw new Error('Expected actual local loss and one settled synthetic close: '+JSON.stringify(result));
if(label==='before'&&(!result.screens.includes('The island fell')||!result.screens.includes('Loot 🪙 +35')||stale.started!==1))throw new Error('Baseline no longer reproduces both reported defects');
if(label==='after'&&(result.presentedResult.survived!==true||!result.screens.includes('Wave won!')||result.screens.includes('The island fell')||stale.started!==0||stale.current!==null))throw new Error('Fixed result or stale-admission expectation failed: '+JSON.stringify({result,stale}));
if(errors.length)throw new Error('Unexpected browser errors: '+JSON.stringify(errors));
await page.screenshot({path:`${out}/result-${viewport.width}x${viewport.height}.png`,fullPage:true});
reports.push({viewport,result,stale,errors});await page.close();
}
const report={label,source,scriptSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),trackedDiffSha256:createHash('sha256').update(execFileSync('git',['diff','--no-ext-diff','HEAD'],{cwd:source})).digest('hex'),sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),browser:browser.version(),limits:'Real controller and HUD with synthetic in-browser journal/receipt. No live game, HTTP API, wallet, database, multiplayer or physical-device claim.',reports};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await server.close()}
