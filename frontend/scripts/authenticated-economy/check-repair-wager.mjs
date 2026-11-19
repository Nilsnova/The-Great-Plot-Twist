// Local orchestration of this task's scenario with the shared provider helper interface.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {runRepairWager} from './repair-wager.mjs';

const expectedCommit='64ee02b360d68836b2de9247121ab47dc6a3ecbf';
const runtimePath=process.env.MP_ECO_RUNTIME??'/tmp/mp505-provider/runtime.json';
const outputDir=process.env.MP_ECO_OUTPUT??'/tmp/next505-repair-wager';
const helpers=process.env.MP_ECO_HELPER_ROOT
  ?pathToFileURL(process.env.MP_ECO_HELPER_ROOT.replace(/\/?$/,'/')):new URL('./',import.meta.url);
const {createApiClients,requestApi}=await import(new URL('api-clients.mjs',helpers));
const {observe,install,admit}=await import(new URL('observer.mjs',helpers));
const {servedSourceEvidence,sourceEvidence}=await import(new URL('source.mjs',helpers));
const helperNames=['api-clients.mjs','observer.mjs','runtime.mjs','source.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(helperNames.map(async name=>
  [name,createHash('sha256').update(await readFile(new URL(name,helpers))).digest('hex')])));
await mkdir(outputDir,{recursive:true});
const localRoot=fileURLToPath(new URL('../../../',import.meta.url));
const ownSourceBefore=sourceEvidence(expectedCommit,{checkoutRoot:localRoot});
const ownFiles=[new URL(import.meta.url),new URL('./repair-wager.mjs',import.meta.url)];
const ownHashes=async()=>Promise.all(ownFiles.map(async file=>createHash('sha256').update(await readFile(file)).digest('hex')));
const ownBefore=await ownHashes();
const startedAt=new Date().toISOString(),before=await hashes();let env,proof;
try {
  env=await createApiClients({labels:['compat-repair-owner','compat-repair-member'],runtimePath,expectedCommit});
  const result=await runRepairWager({clients:env.clients,request:requestApi,
    observe:(sql,args)=>observe(sql,args,{runtimePath}),
    install:(sql,args,purpose)=>install(sql,args,purpose,{runtimePath}),
    admit:(actorId,options)=>admit(actorId,{...options,runtimePath}),outputDir,sourceCommit:expectedCommit});
  const after=await hashes();
  if(JSON.stringify(ownBefore)!==JSON.stringify(await ownHashes()))throw Error('Scenario source changed during execution.');
  if(JSON.stringify(after)!==JSON.stringify(before))throw Error('Provider helpers changed during the scenario.');
  proof={status:'passed',startedAt,finishedAt:new Date().toISOString(),expectedCommit,
    servedBefore:env.servedSources,servedAfter:servedSourceEvidence(env.runtime),helperHashes:before,
    ownSourceBefore,ownSourceAfter:sourceEvidence(expectedCommit,{checkoutRoot:localRoot}),ownScenarioHashes:ownBefore,
    scenarioStatus:result.status,limits:['API-only Auth/HTTP acceptance; no rendered-browser or natural-price claim.']};
}catch(error){proof={status:'failed',startedAt,finishedAt:new Date().toISOString(),expectedCommit,error:String(error)};process.exitCode=1;}
finally{await env?.close();await writeFile(outputDir+'/source-proof.json',JSON.stringify(proof,null,2)+'\n');}
console.log(JSON.stringify(proof));
