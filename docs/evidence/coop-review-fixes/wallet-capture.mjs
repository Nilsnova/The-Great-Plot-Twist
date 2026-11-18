// Reproduce two accepted stale island reads against the real island client and HUD.
// Used by #486 review. All server answers and wallet corrections are synthetic; no account or database.
import {createServer} from '/workspace/The-Great-Plot-Twist/frontend/node_modules/vite/dist/node/index.js';
import {chromium} from '/workspace/The-Great-Plot-Twist/frontend/node_modules/playwright-core/index.mjs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const [source='/workspace/wave-publish',label='baseline']=process.argv.slice(2);
const out='/tmp/coop-wallet-race-browser/'+label;
await mkdir(out,{recursive:true});
const fixture=`
import '/src/ui/base.css';
import '/src/ui/kit/kit.css';
import '/src/ui/styles.css';
import '/src/ui/kit/components.css';
import {createIsland} from '/src/island/index.js';
import {createHud} from '/src/ui/hud.js';
import {createFakeIslandTransport} from '/src/pirates/fake-api.js';
const handlers=new Map(),events=[],reads=[],calls=[],samples=[];
const on=(type,fn)=>{if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn);return()=>handlers.get(type).delete(fn)};
const emit=event=>{events.push(event);for(const fn of handlers.get(event.type)??[])fn(event)};
const base=createFakeIslandTransport({coins:100});
const old=await base.get('/api/island');
const hud=createHud(document.querySelector('#game'),{hasIsland:()=>true,travel:()=>false},{on,emit,storage:null,toast:()=>{}});
hud.setCoinSource('island');hud.setCoins(100);hud.arrive('home_islet');
let holding=true;
const transport={...base,get:path=>{
 calls.push({method:'GET',path});
 if(path==='/api/island'&&holding)return new Promise(resolve=>reads.push(resolve));
 return base.get(path);
},post:(path,body)=>{calls.push({method:'POST',path});return base.post(path,body)}};
const island=createIsland({container:document.querySelector('#game'),emit,on,mode:'fake',transport,storage:null,visitStorage:null,menu:()=>()=>{},settings:()=>()=>{},onCoins:value=>hud.setCoins(value)});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const sample=stage=>{const result={stage,hudCoins:hud.coins,islandCoins:island.island?.coins??null,requests:reads.length,arsenalCalls:calls.filter(row=>row.path.startsWith('/api/island/arsenal')).length,domCoins:document.querySelector('.hud-coins-value')?.textContent};samples.push(result);document.querySelector('#phase').textContent=stage;return result};
let loading;
window.startRace=async()=>{
 loading=island.load();
 for(let i=0;i<20&&reads.length<1;i++)await tick();
 island.openCaptain();
 for(let i=0;i<20&&reads.length<2;i++)await tick();
 if(reads.length!==2||island.island!==null)throw new Error('Need two cold accepted reads');
 island.ui.close();
 base.dev.setCoins(120);island.setWalletCoins(120);
 return sample('Fresh wallet: 120 coins; both old reads pending');
};
window.first=async()=>{
 reads[0]({...old,data:{...old.data,coins:100}});await loading;await tick();await tick();
 return sample('First old response accepted; balance stays 120');
};
window.second=async()=>{
 reads[1]({...old,data:{...old.data,coins:100}});
 await tick();await tick();await tick();
 return sample('Both old responses accepted');
};
window.freshRead=async()=>{
 holding=false;base.dev.setCoins(80);await island.refreshDefended();await tick();
 return sample('A genuinely newer read may lower the balance to 80');
};
window.report=()=>({samples,calls,finishEvents:events.filter(event=>['wave_finished','wave_finish_answered','wave_controller_stopped'].includes(event.type)),hudText:document.querySelector('.hud')?.innerText});
window.ready=true;
`;
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Two stale island reads</title><style>html,body{margin:0;width:100%;height:100%;background:#254348;color:#fff4d5}#game{position:fixed;inset:0}.fixture{position:fixed;z-index:99999;bottom:16px;left:16px;right:16px;font:14px/1.4 system-ui;background:#142523;padding:10px;border:1px solid #b9a56a;max-width:600px;pointer-events:none}.fixture strong,.fixture span{display:block}.fixture span{margin-top:6px;color:#f4d47e}</style></head><body><div id="game"></div><aside class="fixture"><strong>Offline two-response wallet fixture</strong>Real island client and HUD. Load and Captain reads both began before wallet recovery. Their old 100-coin answers arrive after the fresh 120-coin balance. The arsenal reads the current synthetic server balance. No account or database.<span id="phase"></span></aside><script type="module" src="/__wallet-race.js"></script></body></html>`;
const server=await createServer({root:source+'/frontend',configFile:false,cacheDir:'/tmp/coop-wallet-race-browser/cache-'+label,server:{host:'127.0.0.1',port:0,strictPort:true,hmr:false},plugins:[{name:'wallet-race',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url==='/__wallet-race.html'){res.setHeader('Content-Type','text/html');res.end(html)}else if(req.url==='/__wallet-race.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture)}else next()})}}]});
let browser;
try{
 await server.listen();const url=server.resolvedUrls.local[0];
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const reports=[];
 for(const viewport of [{width:1280,height:720},{width:375,height:812}]){
  const page=await browser.newPage({viewport});const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await page.goto(url+'__wallet-race.html');await page.waitForFunction(()=>window.ready===true);
  const fresh=await page.evaluate(()=>window.startRace());
  await page.screenshot({path:out+'/fresh-'+viewport.width+'x'+viewport.height+'.png',fullPage:true});
  const first=await page.evaluate(()=>window.first());
  const second=await page.evaluate(()=>window.second());
  await page.screenshot({path:out+'/two-answers-'+viewport.width+'x'+viewport.height+'.png',fullPage:true});
  const newer=await page.evaluate(()=>window.freshRead());
  const result=await page.evaluate(()=>window.report());
  const expected=label==='baseline'?100:120;
  if(fresh.hudCoins!==120||first.hudCoins!==120||first.islandCoins!==120||second.hudCoins!==expected||second.islandCoins!==expected||newer.hudCoins!==80||newer.islandCoins!==80||first.arsenalCalls<1||errors.length||result.finishEvents.length)throw new Error('Unexpected race result: '+JSON.stringify({fresh,first,second,newer,errors,result}));
  reports.push({viewport,fresh,first,second,newer,result,pageErrors:errors});await page.close();
 }
 const paths=['frontend/src/island/index.js','frontend/src/island/arsenal.js','frontend/src/island/arsenal-api.js','frontend/src/island/api.js','frontend/src/ui/hud.js','frontend/src/pirates/fake-api.js'];
 const moduleSha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(await readFile(source+'/'+path)).digest('hex')])));
 const report={label,source,sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),trackedDiffSha256:createHash('sha256').update(execFileSync('git',['diff','--no-ext-diff','HEAD'],{cwd:source})).digest('hex'),scriptSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),moduleSha256,browser:browser.version(),comparison:'The baseline and fixed labels run the same deferred two-read scenario; screenshots capture the balance after both old answers. Fresh-120 screenshots capture the preceding correction within the same run.',limits:'Real createIsland, main HUD, island/arsenal API adapters and the project in-memory fake transport. No live account, real wallet payment/refund SQL, persistent database, 3D game or physical-device claim.',reports};
 await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await server.close()}
