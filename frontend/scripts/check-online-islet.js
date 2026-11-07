// Recorded L2 paths use public production controls and generated intercepted accounts only.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openIsletFixture} from './online-islet-fixture.js';
import {recordedIsletGolden,recordedIsletUnknownOutcome,recordedIsletExpiry,
  createIsletChaosJourney} from './online-islet-journeys.js';

const folder='captures/20261107_G9-C3',extra='.test-cache/g9-islet-captures';
const requestKeys=['actionUidMatchesPrevious','bodyKeys','method','path'];
const buildKeys=['actionUid','plot','type'];
function safeRequests(records){
  assert.ok(Array.isArray(records),'The intercepted islet request ledger exists');
  return records.map(record=>{
    const keys=Object.keys(record??{}).sort();
    assert.ok(keys.length===requestKeys.length&&keys.every((key,index)=>key===requestKeys[index]),
      'Islet request records contain only the approved safe fields');
    assert.ok(record.method==='GET'&&record.path==='/api/islet'
      ||record.method==='POST'&&record.path==='/api/islet/build','Only recorded islet paths enter this ledger');
    assert.ok(typeof record.actionUidMatchesPrevious==='boolean'&&Array.isArray(record.bodyKeys),
      'The ledger retains a UID comparison boolean and body field names only');
    const expected=record.method==='POST'?buildKeys:[];
    assert.ok(record.bodyKeys.length===expected.length&&record.bodyKeys.every((key,index)=>key===expected[index]),
      'Islet bodies retain only the approved field names');
    return {method:record.method,path:record.path,bodyKeys:[...record.bodyKeys],
      actionUidMatchesPrevious:record.actionUidMatchesPrevious};
  });
}
function validWidths(widths){
  assert.ok(Array.isArray(widths)&&widths.length>0&&widths.length<=2&&new Set(widths).size===widths.length
    &&widths.every(width=>Number.isSafeInteger(width)&&width>0),
    'Use one or two distinct positive whole viewport widths within the capture budget');
}

export async function checkOnlineIslet({widths=[1280,375],extended=true}={}){
  validWidths(widths);
  const report={stage:'stream8',outcome:'running',coverage:extended?'golden, unknown outcomes and expiry':'golden islet',
    widths:[...widths],checks:[],requests:[],captures:[],unknownOutcomeCases:0,expiryVerified:false,
    pending:['World-building screenshots require the coordinator’s sequential visual review.',
      'Seven-fault islet coverage runs separately through checkOnlineIsletChaos.']};
  await mkdir(folder,{recursive:true});await mkdir(extra,{recursive:true});
  async function run(label,operation){
    const env=await openIsletFixture(),errors=[];
    const collectError=error=>errors.push(error.name);env.page.on('pageerror',collectError);
    try{
      const result=await operation(env);
      assert.equal(errors.length,0,'Islet journeys have no unhandled browser errors');
      assert.equal(env.pageErrors.length,0,'The intercepted fixture has no unhandled browser errors');
      report.checks.push(...(result?.checks??[]),label+' has no unhandled browser errors');
      return result;
    }finally{
      try{report.requests.push(...safeRequests(env.isletRequests));}
      finally{env.page.off('pageerror',collectError);await env.close();}
    }
  }
  try{
    for(const width of widths){
      const captured=new Set();
      await run('Islet golden '+width,env=>recordedIsletGolden(env,{width,
        async capture(label,page){
          assert.ok(['islet-built','islet-world-built'].includes(label)&&!captured.has(label),
            'Only the two distinct approved golden islet captures are retained');
          const path=`${folder}/${label}-${width}.png`;
          await page.screenshot({path});captured.add(label);report.captures.push(path);
        }}));
      assert.equal(captured.size,2,'Each golden viewport records the built panel and the world view');
    }
    if(extended){
      await run('Unknown islet outcomes',async env=>{
        await env.page.setViewportSize({width:widths.at(-1),height:812});
        const result=await recordedIsletUnknownOutcome(env);
        assert.equal(result.checks.length,3,'All three recorded unknown-outcome cases complete');
        report.unknownOutcomeCases=result.checks.length;return result;
      });
      await run('Islet expiry',async env=>{
        await env.page.setViewportSize({width:widths.at(-1),height:812});
        const result=await recordedIsletExpiry(env,{async capture(label,page){
          assert.equal(label,'islet-expired-account','Expiry records its actual Account attention surface');
          await page.screenshot({path:`${extra}/${label}.png`});
        }});
        report.expiryVerified=true;return result;
      });
    }
    report.outcome='passed';
    console.log(JSON.stringify({checks:report.checks.length,requests:report.requests.length,
      captures:report.captures.length,unknownOutcomeCases:report.unknownOutcomeCases,expiryVerified:report.expiryVerified},null,2));
    return report;
  }catch(error){report.outcome='failed';report.failureType=error.name;throw error;}
  finally{await writeFile(folder+'/online-islet.json',JSON.stringify(report,null,2)+'\n');}
}

export async function checkOnlineIsletChaos({checkChaos,widths=[375]}={}){
  validWidths(widths);
  // A CLI parent passes its already-running function to avoid importing its unfinished module.
  const runChaos=checkChaos??(await import('./check-online-chaos.js')).checkOnlineChaos;
  assert.ok(typeof runChaos==='function'&&runChaos.groupFaultExpectations===true,
    'The shared chaos driver must support genuine group attention and focus expectations');
  return runChaos({openFixture:openIsletFixture,journeys:[createIsletChaosJourney()],widths,
    folder:`${folder}-chaos`,requireAllGroups:false});
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const width=process.argv.find(arg=>arg.startsWith('--width='))?.slice(8);
  const widths=width===undefined?undefined:[Number(width)];
  if(process.argv.includes('--chaos')){
    assert.ok(!process.argv.includes('--golden-only'),'Golden-only cannot narrow the seven-fault chaos verification');
    await checkOnlineIsletChaos({widths});
  }else await checkOnlineIslet({widths,extended:!process.argv.includes('--golden-only')});
}
