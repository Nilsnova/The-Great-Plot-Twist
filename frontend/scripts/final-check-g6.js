// Focused checks after the final presentation/lifecycle fixes; earlier regression results stay in the run log.
import {spawn} from 'node:child_process';
import {writeFile,open} from 'node:fs/promises';
const commands=[['npm',['test']],['npm',['run','build']],['npm',['run','test:case']],['node',['scripts/check-loading.js']]];
const results=[],log=await open('captures/20261105_G6-Final-Checks.log','w');
for(const [cmd,args] of commands){console.log([cmd,...args].join(' '));const code=await new Promise(resolve=>{const child=spawn(cmd,args,{stdio:['ignore','pipe','pipe']});child.stdout.on('data',data=>log.write(data));child.stderr.on('data',data=>log.write(data));child.on('close',resolve);});results.push({command:[cmd,...args].join(' '),exit:code});await writeFile('captures/20261105_G6-Final-Results.json',JSON.stringify(results,null,2));if(code)break;}
await log.close();if(results.some(result=>result.exit))process.exitCode=1;
