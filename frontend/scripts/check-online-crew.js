// Recorded A6 paths use public production controls and runtime-generated intercepted accounts only.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openCrewPresenceFixture} from './online-crew-presence-fixture.js';
import {recordedCrewGolden,recordedUnknownCrewWrites,recordedLateCrewReplyAfterSignOut,
  createRecordedCrewChaosJourney} from './online-crew-journeys.js';

const folder='captures/20261107_G9-C2';
export async function checkOnlineCrew({widths=[1280,375],extended=true,musterOnly=false}={}){
  const report={stage:'stream6',outcome:'running',coverage:musterOnly?'muster visuals':extended?'full crew':'golden crew',widths,checks:[],requests:[],captures:[],
    pending:['Partner errands and authoritative positions await case DTOs and stream14.',
      'Realtime presence proof belongs to stream7.']};
  await mkdir(folder,{recursive:true});
  async function run(label,operation){
    const env=await openCrewPresenceFixture({startPlace:'saltreach_harbor'}),errors=[];
    env.page.on('pageerror',error=>errors.push(error.name));
    try{
      const result=await operation(env);
      report.checks.push(...(result?.checks??[]));
      assert.equal(errors.length,0,'Crew journeys have no unhandled browser errors');
      report.checks.push(label+' has no unhandled browser errors');
    }finally{
      report.requests.push(...env.crewRequests);
      await env.close();
    }
  }
  try{
    for(const width of widths)await run('Crew golden '+width,env=>recordedCrewGolden(env,{width,musterOnly,
      async capture(label,page){
        const safe=label==='crew-world-partners'?'world-after-muster':label;
        const path=`${folder}/${safe}-${width}.png`;
        await page.screenshot({path});report.captures.push(path);
      }}));
    if(extended&&!musterOnly){
      await run('Unknown crew outcomes',async env=>{
        await recordedUnknownCrewWrites(env);
        return {checks:['Unknown join/muster outcomes read back before one same-body repeat.']};
      });
      await run('Late crew cleanup',async env=>{
        await recordedLateCrewReplyAfterSignOut(env);
        return {checks:['A late old-account muster cannot restore partners, reads or live rooms.']};
      });
    }
    report.outcome='passed';
    console.log(JSON.stringify({checks:report.checks.length,requests:report.requests.length,pending:report.pending},null,2));
    return report;
  }catch(error){report.outcome='failed';report.failureType=error.name;throw error;}
  finally{await writeFile(folder+'/online-crew.json',JSON.stringify(report,null,2)+'\n');}
}

export async function checkOnlineCrewChaos({checkChaos}={}){
  // A CLI parent must pass its already-running function to avoid importing its unfinished module.
  const runChaos=checkChaos??(await import('./check-online-chaos.js')).checkOnlineChaos;
  for(const action of ['join','muster'])await runChaos({openFixture:openCrewPresenceFixture,
    journeys:[createRecordedCrewChaosJourney(action)],folder:`${folder}-chaos-${action}`});
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.includes('--chaos'))await checkOnlineCrewChaos();
  else{
    const width=process.argv.find(arg=>arg.startsWith('--width='))?.slice(8);
    await checkOnlineCrew({widths:width?[Number(width)]:undefined,
      extended:!process.argv.includes('--golden-only'),musterOnly:process.argv.includes('--muster-only')});
  }
}
