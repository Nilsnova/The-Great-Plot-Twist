// Sequential browser/GPU checks; retain exact command results for the graphics handoff.
import {spawn} from 'node:child_process';
import {writeFile,open} from 'node:fs/promises';
const commands=[
 ['npm',['test']],['npm',['run','build']],
 ['node',['scripts/check-case.js']],['node',['scripts/check-world.js']],
 ['node',['scripts/check-readability.js']],['node',['scripts/check-browser.js']],
 ['node',['scripts/check-production.js']],['node',['scripts/check-pixel.js']],
 ['node',['scripts/check-pixel.js'],{ART_PRODUCTION:'1'}],
 ['node',['scripts/check-ui-kit.js']],['node',['scripts/check-ui-kit.js'],{KIT_PRODUCTION:'1'}],
 ['node',['scripts/check-cinematics.js']],['node',['scripts/check-intro.js']],
 ['node',['scripts/check-weather-wiring.js']],['node',['scripts/check-experience.js']],
 ['node',['scripts/check-demo.js']],['node',['scripts/check-loading.js']],
];
const log=await open('captures/20261105_G6-Verification.log','a'),results=[];
for(const [command,args,env={}] of commands){const label=[...Object.entries(env).map(([k,v])=>`${k}=${v}`),command,...args].join(' ');console.log('Running '+label);await log.write('\n'+label+'\n');const start=Date.now();const exit=await new Promise(resolve=>{const child=spawn(command,args,{env:{...process.env,CAPTURE_PREFIX:'G6',...env},stdio:['ignore','pipe','pipe']});child.stdout.on('data',data=>log.write(data));child.stderr.on('data',data=>log.write(data));child.on('close',resolve);});results.push({command:label,exit,ms:Date.now()-start});await writeFile('captures/20261105_G6-Test-Results.json',JSON.stringify(results,null,2));console.log(label+' -> '+exit);}
await log.close();if(results.some(result=>result.exit!==0))process.exitCode=1;
