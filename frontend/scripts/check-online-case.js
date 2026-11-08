// Standalone recorded production case proof; parent wiring stays coordinator-owned.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openCaseFixture} from './online-case-fixture.js';
import {recordedCaseGolden,recordedCaseUnknown} from './online-case-journeys.js';
const folder='captures/20261108_G9-case';
export async function checkOnlineCase({widths=[1280,320],extended=true}={}){
  const report={stage:'case',outcome:'running',widths,worldScenarios:widths.map(width=>({width,worldLocked:width===1280})),checks:[],requests:[],captures:[],
    coverage:'eight published case routes, native keyboard/touch pin, search and partner completion, night, accusation/reveal/public coast',
    pending:['Seven-fault coverage for the eight case route groups and physical-device certification are not claimed by this runner.']};
  await mkdir(folder,{recursive:true});
  async function run(operation,options){const env=await openCaseFixture(options);try{const result=await operation(env);report.checks.push(...result.checks);}
    finally{report.requests.push(...env.caseRequests);await env.close();}}
  try{
    for(const width of widths){const worldLocked=width===1280;
      await run(env=>recordedCaseGolden(env,{width,worldLocked,capture:async(label,page)=>{
        // These two pages contain only fixture-authored schematic display text, never sealed case content.
        const path=`${folder}/${label}-${width}.png`;await page.screenshot({path});report.captures.push(path);
      }}),{worldLocked});}
    if(extended)await run(recordedCaseUnknown);
    report.outcome='passed';console.log(JSON.stringify({checks:report.checks.length,requests:report.requests.length,pending:report.pending},null,2));return report;
  }catch(error){report.outcome='failed';report.failureType=error.name;throw error;}
  finally{await writeFile(folder+'/online-case.json',JSON.stringify(report,null,2)+'\n');}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const width=process.argv.find(arg=>arg.startsWith('--width='))?.slice(8);
  await checkOnlineCase({widths:width?[Number(width)]:undefined,extended:!process.argv.includes('--golden-only')});
}
