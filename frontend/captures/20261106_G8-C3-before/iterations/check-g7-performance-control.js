// Compare the prior game loop without changing any source file in this checkout.
import {execFileSync,spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {copyFile} from 'node:fs/promises';
const controlFiles=['game.js','core/renderer.js','audio/controller.js','audio/logic.js','audio/synth.js','ui/chart.js','ui/hud.js','adapter/fake/index.js','adapter/fake/view.js','adapter/extensions.js'];
const previous=new Map(controlFiles.map(file=>[resolve('src',file),execFileSync('git',['show',`origin/feat/g7-living-world:frontend/src/${file}`],{encoding:'utf8'})]));
const server=await createServer({cacheDir:'captures/20261106_G8-C3-before/control-cache',server:{host:'127.0.0.1',port:5393,strictPort:true},plugins:[{name:'prior-game-loop-control',enforce:'pre',load(id){return previous.get(id.split('?')[0]);}}]});
try{
  await server.listen();
  const result=await new Promise(resolveExit=>{const child=spawn(process.execPath,['scripts/check-living.js'],{env:{...process.env,TEST_URL:'http://127.0.0.1:5393'},stdio:'inherit'});child.on('exit',code=>resolveExit(code??1));});
  await copyFile('captures/20261105_G7-C1-Living-Checks.json','captures/20261106_G8-C3-before/G7-control-Living-Checks.json');
  process.exitCode=result;
}finally{await server.close();}
