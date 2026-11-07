// Production A4 proof uses only public controls and intercepted HTTP/Phoenix endpoints.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openCrewPresenceFixture} from './online-crew-presence-fixture.js';
import {assertPresenceSendTiming} from './online-presence-send-observer.js';
import {recordedPresenceGate,recordedPresenceGolden,recordedPresenceDeleteCleanup}
  from './online-presence-journeys.js';

const folder='captures/20261107_G9-C2',extra='.test-cache/g9-presence-captures';
async function coldGraph(){
  const manifest=JSON.parse(await readFile('.test-cache/g9-online-dist/.vite/manifest.json','utf8'));
  const sdk='node_modules/@supabase/supabase-js/dist/index.mjs',realtime='src/online/realtime.js',seen=new Set();
  function walk(key){if(seen.has(key))return;seen.add(key);for(const item of manifest[key].imports??[])walk(item);}
  walk('index.html');
  assert.ok(manifest[sdk]?.isDynamicEntry,'The pinned SDK remains a dynamic entry');
  assert.ok(manifest[realtime]?.isDynamicEntry,'A4 remains a dynamic entry');
  assert.ok(!seen.has(sdk)&&!seen.has(realtime),'Neither SDK nor A4 belongs to the cold title graph');
  return {sdkInInitialGraph:false,realtimeInInitialGraph:false};
}
export async function checkOnlinePresence({widths=[1280,375],extended=true}={}){
  const report={stage:'stream7',outcome:'running',checks:[],gates:[],captures:[],requests:[],protocol:[],nativePause:[],unverified:[]};
  await mkdir(folder,{recursive:true});await mkdir(extra,{recursive:true});
  async function run(label,operation){
    const env=await openCrewPresenceFixture({startPlace:'saltreach_harbor'}),errors=[];
    env.page.on('pageerror',error=>errors.push(error.name));
    try{
      report.coldGraph=await coldGraph();
      const result=await operation(env);
      assertPresenceSendTiming(await env.wire.readSendTiming(),env.wire.records.filter(row=>row.event==='position'));
      for(const check of result?.checks??[])report.checks.push(label+': '+check);
      if(result?.nativeTabPause)report.nativePause.push({label,...result.nativeTabPause});
      if(result?.nativeTabPause?.verified===false)report.unverified.push(result.nativeTabPause.reason);
      assert.equal(errors.length,0,'Presence journeys have no unhandled browser errors');
      assert.equal(env.wire.failures.length,0,'The intercepted v2 protocol has no fixture error');
      report.checks.push(label+' has no unhandled browser or protocol error');
      return result;
    }catch(error){
      report.failureState=await env.page.evaluate(()=>({hidden:document.hidden,
        canvasFocused:document.activeElement?.matches('canvas[tabindex="0"]')??false,
        activeTag:document.activeElement?.tagName??null,
        dialogs:[...document.querySelectorAll('dialog[open]')].map(dialog=>dialog.className),
        shell:document.querySelector('.shell-screen[open]')?.dataset.mode??null,
        connection:document.querySelector('.presence-connection')?.textContent??null,
        exploring:!!document.querySelector('.hud.exploring')}));
      await env.page.screenshot({path:extra+'/failure.png'});
      report.failureWire=env.wire.records.map(({event,roomKind,at,moving})=>({event,roomKind,at,moving}));
      report.failureSendTiming=await env.wire.readSendTiming();
      throw error;
    }finally{
      const positions=env.wire.records.filter(row=>row.event==='position');
      const sendTiming=await env.wire.readSendTiming();
      const emissions=sendTiming?.records??[];
      const minimum=values=>values.length?Math.min(...values):null;
      report.protocol.push({label,activeConnections:env.wire.connectionCount,
        openedConnections:env.wire.records.filter(row=>row.event==='socket_opened').length,positions:positions.length,
        moving:positions.filter(row=>row.moving).length,stopped:positions.filter(row=>!row.moving).length,
        emotes:env.wire.records.filter(row=>row.event==='emote').length,
        advertisedMinimumGapMs:positions.length?Math.min(...positions.map(row=>row.everyMs)):null,
        browserEmissions:emissions.length,
        minimumBrowserSendGapMs:minimum(emissions.slice(1).map((row,index)=>row.at-emissions[index].at)),
        minimumBrowserMonotonicGapMs:minimum(emissions.slice(1).map((row,index)=>row.monotonicAt-emissions[index].monotonicAt)),
        minimumEndpointArrivalGapMs:positions.length>1?Math.min(...positions.slice(1).map((row,index)=>row.at-positions[index].at)):null});
      report.requests.push(...env.crewRequests);await env.close();
    }
  }
  try{
    if(extended)for(const [label,options] of [['flag false',{flag:false}],['string flag',{flag:'true'}],
      ['number flag',{flag:1}],['name pending',{flag:true,named:false}],['signed out',{flag:true,signedIn:false}]]){
      report.gates.push({label,...await run(label,env=>recordedPresenceGate(env,options))});
    }
    for(const width of widths)await run('Presence '+width,env=>recordedPresenceGolden(env,{width,
      async capture(label,page){
        const keep=label==='presence-two-captains-wave'&&width===375
          ||label==='presence-eight-plus-more'&&width===1280;
        const path=`${keep?folder:extra}/${label}-${width}.png`;await page.screenshot({path});
        if(keep)report.captures.push(path);
      }}));
    if(extended)await run('Deletion cleanup',async env=>{await recordedPresenceDeleteCleanup(env);
      return {checks:['Confirmed deletion leaves every private room and removes peer controls.']};});
    report.unverified=[...new Set(report.unverified)];report.outcome='passed';
    console.log(JSON.stringify({checks:report.checks.length,gates:report.gates.length,unverified:report.unverified},null,2));
    return report;
  }catch(error){report.outcome='failed';report.failureType=error.name;throw error;}
  finally{await writeFile(folder+'/online-presence.json',JSON.stringify(report,null,2)+'\n');}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const width=process.argv.find(arg=>arg.startsWith('--width='))?.slice(8);
  await checkOnlinePresence({widths:width?[Number(width)]:undefined,extended:!process.argv.includes('--golden-only')});
}
