// Bounded synthetic routing probe; timings are Node evidence, not a phone or placement claim.
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createBoarderPaths} from '../src/pirates/boarder-paths.js';
const ring=JSON.parse(readFileSync(new URL('../tests/pirates/fixtures/perimeter-ring.json', import.meta.url),'utf8')).ring;
const interior=[];for(let z=-6;z<=4&&interior.length<26;z+=2)for(let x=-5;x<=5&&interior.length<26;x+=2)interior.push([x,z]);
const coords=[...ring,...interior];
if(coords.length!==128)throw Error(`Expected128 shapes, got${coords.length}`);
const samples=[];
for(const perimeterWalls of [false,true]){
  const walls=coords.map(([x,z],i)=>({id:`wall_${i+1}`,kind:'wall',x,z,hp:100,maxHp:100}));
  const begin=performance.now();
  const paths=createBoarderPaths({coast:{rx:20,rz:22,seed:3},heart:{x:0,z:2},walls,pace:{hackPerSecond:10,speed:1},perimeterWalls});
  paths.refresh();
  const initialMs=performance.now()-begin,initialBuilds=paths.builds,times=[];
  for(let i=0;i<20;i++){
    for(const wall of walls)wall.hp=i%2===0?49:100;
    const start=performance.now();paths.refresh();times.push(performance.now()-start);
  }
  const afterRebuilds=paths.builds,startUnchanged=performance.now();
  for(let i=0;i<1000;i++)paths.refresh();
  samples.push({mode:perimeterWalls?'perimeter':'legacy',shapes:walls.length,cell:paths.grid.cell,cols:paths.grid.cols,rows:paths.grid.rows,cells:paths.grid.cols*paths.grid.rows,
    initialMs,initialBuilds,rebuilds:20,rebuildTimesMs:times,rebuildTotalMs:times.reduce((a,b)=>a+b,0),rebuildMaxMs:Math.max(...times),afterRebuilds,
    unchangedRefreshes:1000,unchangedTotalMs:performance.now()-startUnchanged,afterUnchanged:paths.builds});
}
const report={scope:'Synthetic deterministic Node-only128-shape routing probe;102ringfixture+26interior shapes, not placement validation or phone/browser evidence.',node:process.version,samples};
console.log(JSON.stringify(report, null, 2));
