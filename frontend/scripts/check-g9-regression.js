// One resumable, sequential browser pass. Logs are local-path-free and never contain request credentials.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {g8Commands} from './g9-commands.js';
const phase=process.argv.find(arg=>arg.startsWith('--phase='))?.slice(8)??'after';
if(!['before','after'].includes(phase))throw new Error('Use --phase=before or --phase=after');
const folder=`captures/20261106_G9-C1-${phase}`,resultFile=`${folder}/Verification.json`;
const commands=[...g8Commands,['build-stamp','node scripts/check-build-stamp.js'],
  ['problem-report','node scripts/check-problem-report.js'],['call-states','node scripts/check-call-states.js'],
  ['csp-inventory','node scripts/check-csp-inventory.js'],['online','node scripts/check-online-golden.js']];
for(const [id,path] of [['claude-islet','scripts/check-islet.js'],['market','scripts/check-market.js']]){
  try{await access(path);commands.push([id,'node '+path]);}catch{/* Add main's panels when available. */}
}
await mkdir(folder,{recursive:true});let report=[];
if(process.argv.includes('--resume'))try{report=JSON.parse(await readFile(resultFile,'utf8'));}catch{}
const rerun=new Set((process.argv.find(arg=>arg.startsWith('--rerun='))?.slice(8)??'').split(','));
for(const [id,command] of commands){
  if(!rerun.has(id)&&report.some(item=>item.id===id&&item.code===0))continue;
  const start=Date.now();console.log('START '+command);let output='';
  const code=await new Promise(resolve=>{
    const child=spawn('/bin/bash',['-lc',command],{stdio:['ignore','pipe','pipe']});
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk;});
    child.on('error',()=>resolve(1));child.on('exit',code=>resolve(code??1));
  });
  output=output.replaceAll(process.cwd(),'.').replace(/\/Users\/[^\s\n"']+/g,'[local path]');
  const log=`${folder}/${id}.log`;await writeFile(log,output);
  report=report.filter(item=>item.id!==id);report.push({id,command,code,ms:Date.now()-start,log});
  await writeFile(resultFile,JSON.stringify(report,null,2)+'\n');
  console.log(`${code===0?'PASS':'FAIL'} ${id} (${Date.now()-start}ms)`);
  if(code!==0&&!process.argv.includes('--keep-going'))process.exit(code);
}
if(report.some(item=>item.code!==0))process.exitCode=1;
