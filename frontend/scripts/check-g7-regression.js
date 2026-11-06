// Runs all existing browser checks sequentially, with retained logs and resumable results.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,open} from 'node:fs/promises';
const root='captures/20261106_G7-Final',resultFile='captures/20261106_G7-Final-Verification.json';
const commands=[
 ['tests','npm test'],['build','npm run build'],['generator','python3 scripts/pixel_art/generate.py'],
 ['credits','node scripts/check-credits.js'],['living','node scripts/check-living.js'],['life','node scripts/check-life.js'],
 ['case','node scripts/check-case.js'],['world','node scripts/check-world.js'],['readability','node scripts/check-readability.js'],
 ['browser','CAPTURE_PREFIX=G7 node scripts/check-browser.js'],['production','CAPTURE_PREFIX=G7 node scripts/check-production.js'],
 ['pixel','node scripts/check-pixel.js'],['pixel-production','ART_PRODUCTION=1 node scripts/check-pixel.js'],
 ['kit','node scripts/check-ui-kit.js'],['kit-production','KIT_PRODUCTION=1 node scripts/check-ui-kit.js'],
 ['cinematics','node scripts/check-cinematics.js'],['intro','node scripts/check-intro.js'],['weather','node scripts/check-weather-wiring.js'],
 ['experience','node scripts/check-experience.js'],['demo','node scripts/check-demo.js'],['loading','node scripts/check-loading.js'],
 ['lifecycle','node scripts/check-lifecycle.js'],['golden','node scripts/check-golden-path.js'],['chaos','node scripts/check-chaos.js'],
];
await mkdir(root,{recursive:true});let report=[];
if(process.argv.includes('--resume'))try{report=JSON.parse(await readFile(resultFile,'utf8'));}catch{}
for(const [id,command] of commands){
 if(report.some(item=>item.id===id&&item.code===0))continue;
 const log=`${root}/${id}.log`,file=await open(log,'w'),start=Date.now();console.log(`START ${command}`);
 const code=await new Promise(resolve=>{const child=spawn('/bin/bash',['-lc',command],{stdio:['ignore',file.fd,file.fd]});child.on('error',()=>resolve(1));child.on('exit',code=>resolve(code??1));});await file.close();
 report=report.filter(item=>item.id!==id);report.push({id,command,code,ms:Date.now()-start,log});await writeFile(resultFile,JSON.stringify(report,null,2)+'\n');console.log(`${code===0?'PASS':'FAIL'} ${id} (${Date.now()-start}ms)`);
 if(code!==0)process.exit(code);
}
