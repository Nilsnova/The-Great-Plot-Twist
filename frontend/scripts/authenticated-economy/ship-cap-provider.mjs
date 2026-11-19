// Reproducible API-only launcher. The prepared local provider/harness remains a separately pinned prerequisite.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runShipCap} from './ship-cap.mjs';

const argv=process.argv.slice(2);
function option(name){const at=argv.indexOf(name);if(at<0||!argv[at+1])throw Error('Required option: '+name);return resolve(argv[at+1]);}
const harnessRoot=option('--harness-root'),runtimePath=option('--runtime'),output=option('--output');
const directory=resolve(runtimePath,'..');
const importHelper=name=>import(pathToFileURL(join(harnessRoot,'frontend/scripts/authenticated-economy',name)).href);
const {createApiClients}=await importHelper('api-clients.mjs');
const {observe,install,admit}=await importHelper('observer.mjs');
const {servedSourceEvidence,sourceEvidence}=await importHelper('source.mjs');
const freeze=JSON.parse(await readFile(join(directory,'helper-freeze.json'),'utf8'));
const launcherHash=async()=>createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
const launcherBefore=await launcherHash();
async function helperEvidence(){
 const hashes={};
 for(const [path,expected] of Object.entries(freeze.hashes)){
  const actual=createHash('sha256').update(await readFile(join(harnessRoot,path))).digest('hex');
  assert.equal(actual,expected,path);hashes[path]=actual;
 }
 return {helperCommit:freeze.helperCommit,applicationMigrations:freeze.applicationMigrationCount,hashes};
}
let environment,report;
await mkdir(output,{recursive:true});
try{
 await helperEvidence();
 console.log('Registering ten ship members and one independent island owner');
 environment=await createApiClients({labels:[...Array.from({length:10},(_,i)=>'ship-member-'+i),'ship-foreign-owner'],runtimePath,expectedCommit:freeze.expectedCommit});
 const sources=async()=>{
  const services=servedSourceEvidence(environment.runtime);
  const worker=JSON.parse(await readFile(join(directory,'worker-source.json'),'utf8'));
  process.kill(worker.processId,0);assert.equal(worker.expectedProductionBaseline,freeze.expectedCommit);
  return {services,worker:{service:worker.service,...sourceEvidence(freeze.expectedCommit,{checkoutRoot:worker.sourceRoot})}};
 };
 report=await runShipCap({clients:environment.clients,
  observe:(statement,params)=>observe(statement,params,{runtimePath}),
  install:(statement,params,purpose)=>install(statement,params,purpose,{runtimePath}),
  admit:(actor,options)=>admit(actor,{...options,runtimePath}),sourceEvidence:sources,helperEvidence});
}catch(error){report=error.shipReport??{status:'failed',failure:{name:error.name,message:error.message}};process.exitCode=1;}
finally{
 await environment?.close();
 report.launcherBeforeSha256=launcherBefore;report.launcherAfterSha256=await launcherHash();
 if(report.launcherBeforeSha256!==report.launcherAfterSha256){report.status='failed';report.sourceFailure='Launcher changed during execution';process.exitCode=1;}
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,assertions:report.assertions?.length,failure:report.failure?.message}));
