// CW4 evidence review: check procedural weapon poses against padded frame bounds.
import {openWorldBrowser} from '../../../../frontend/scripts/world-browser-tools.js';
import {writeFile} from 'node:fs/promises';
const env=await openWorldBrowser({hmr:false});
try {
 await env.page.goto(env.url+'/ui-kit.html');
 const result=await env.page.evaluate(async()=>{
  const {paint}=await import('/src/art/paint.js');
  const {weaponPose,CAPTAIN_PALETTES}=await import('/src/art/people.js');
  const touched=[];let cases=0;
  for(const weapon of ['pistols','blunderbuss','long_rifle','fire_bombs']) for(const firing of [false,true]) for(let degrees=-90;degrees<=90;degrees++) {
   const draw=weaponPose(CAPTAIN_PALETTES[2],weapon,firing,degrees*Math.PI/180);
   const art=paint(c=>{c.save();c.translate(2,2);draw(c);c.restore();},[52,36],3);
   const {data}=art.getContext('2d').getImageData(0,0,art.width,art.height);
   const edge=[];
   for(let y=0;y<art.height;y++) for(let x=0;x<art.width;x++) {
    if(data[(y*art.width+x)*4+3]<=8)continue;
    if(y<6)edge.push('top'); if(y>=102)edge.push('bottom');
    if(x<6)edge.push('left'); if(x>=150)edge.push('right');
   }
   if(edge.length)touched.push({weapon,firing,degrees,edges:[...new Set(edge)]}); cases++;
  }
  return {cases,edgeAlphaThreshold:8,density:3,palette:2,touched};
 });
 await writeFile('/tmp/cw4-r4-padded-sweep.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({cases:result.cases,touchedCount:result.touched.length,examples:result.touched.filter((x,i,a)=>i===0||x.weapon!==a[i-1].weapon||x.firing!==a[i-1].firing)}));
} finally {await env.close();}
