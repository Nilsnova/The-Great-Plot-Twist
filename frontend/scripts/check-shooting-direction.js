// T27 visual regression: real character and presence renderers, with controlled shot events.
// Two browser pages show the same captain locally and remotely; no live accounts are used.
// Run with --before to capture the unchanged baseline without asserting the new frame names.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';

const before = process.argv.includes('--before');
const out = process.env.T27_CAPTURES ?? `/tmp/plot-twist-t27-${before ? 'before' : 'after'}-directions`;
await mkdir(out, {recursive: true});
const env = await openWorldBrowser({hmr: false});
try {
  const pages = [env.page, await env.page.context().newPage()];
  for (const [index, page] of pages.entries()) {
    await page.goto(`${env.url}/ui-kit.html`);
    await page.evaluate(async remote => {
      const THREE = await import('/node_modules/three/build/three.module.js');
      const {loadArt} = await import('/src/world/art.js');
      const {createCharacter} = await import('/src/player/character.js');
      const {createOtherCaptains} = await import('/src/world/others/index.js');
      const {POSE_IDS, createPoses} = await import('/src/pirates/poses.js');
      document.body.replaceChildren(); document.body.style.cssText = 'margin:0;background:#153d46;color:white;font:18px sans-serif';
      const heading = document.createElement('p'); heading.textContent = `T27 — ${remote ? 'teammate’s view' : 'own captain'}`; document.body.append(heading);
      const renderer = new THREE.WebGLRenderer({alpha:true, preserveDrawingBuffer:true}); document.body.append(renderer.domElement);
      const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-6,6,4,-4,.1,100); camera.position.z = 10;
      const art = await loadArt(['explorer', 'captain-3', 'captain-3-side', 'captain-3-back', ...POSE_IDS]);
      const character = createCharacter(art); character.setColour(2); scene.add(character.sprite);
      const others = createOtherCaptains(scene, document.body, art, true, {colourOf:()=>2});
      if (remote) { scene.remove(character.sprite); others.ingest({sampledAt:1000, others:[{id:'captain',name:'Captain',place:'home_islet',x:0,y:0,facing:'front',moving:false}]}); }
      let clock = 0;
      const poses = createPoses({now:()=>clock});
      window.t27 = {
        close() { const before=renderer.info.memory.textures; character.dispose?.(); others.dispose();
          const after=renderer.info.memory.textures; renderer.dispose(); return {before,after}; },
        draw(event, age=0) {
          clock=0; poses.clear(); if(event) poses.note([event]); clock=age;
          const pose=poses.get('captain');
          if(remote) others.update(0,{place:'home_islet',player:{x:0,y:0},now:1000,poses:new Map([['captain',pose]])});
          else { character.pose(pose); character.animate(.016,0); }
          camera.left=-4*innerWidth/(innerHeight-80); camera.right=-camera.left; camera.updateProjectionMatrix();
          renderer.setSize(innerWidth,innerHeight-80); renderer.render(scene,camera);
          const visible=[]; scene.traverseVisible(mesh=>{if(mesh.isMesh) visible.push({frame:mesh.userData.pose??mesh.userData.asset??'idle', angle:mesh.material.userData.shotAngle, flip:mesh.scale.x<0});});
          return visible;
        },
      };
    }, index === 1);
  }
  const snapshots = new Map(), ownShots = new Map();
  for (const [width,height] of [[1280,720],[375,812]]) for (const [direction,toX,toZ] of [['right',8,0],['left',-8,0],['up',0,-8],['down',0,8],['up-right',8,-8],['down-left',-8,8],['up-left',-8,-8],['down-right',8,8],['steep-up',2,-7],['shallow-up',7,-2]]) {
    const event={type:'captain_fired',by:'captain',x:0,z:0,toX,toZ};
    for (const [index,page] of pages.entries()) {
      await page.setViewportSize({width,height});
      const visible=await page.evaluate(event=>window.t27.draw(event),event);
      assert.equal(visible.length,1,'one visible captain body');
      if(!before) {
        assert.equal(visible[0].frame,'captain-3-musket-2');
        assert.ok(Math.abs(visible[0].angle-Math.atan2(toZ*.72,Math.abs(toX)))<1e-10,'exact projected aim');
        assert.equal(visible[0].flip,toX<0);
      }
      const screenshot=await page.screenshot({path:`${out}/${width}x${height}-${direction}-${index?'remote':'own'}.png`});
      if(width===375 && index===0) ownShots.set(direction,screenshot.toString('base64'));
      const key=`${width}:${index}`; if(!snapshots.has(key)) snapshots.set(key,new Set());
      snapshots.get(key).add(createHash('sha256').update(screenshot).digest('hex'));
      const idle=await page.evaluate(event=>window.t27.draw(event,1),event);
      assert.equal(idle.length,1); assert.ok(!idle[0].frame.includes('musket'),'pose expires back to idle');
    }
  }
  if(!before) {
    const {writeFile}=await import('node:fs/promises');
    const sheet=await pages[0].evaluate(async()=>{
      const {paint}=await import('/src/art/paint.js');
      const {musketPose,CAPTAIN_PALETTES}=await import('/src/art/people.js');
      const shots=[[8,0],[-8,0],[0,-8],[0,8],[8,-8],[-8,8],[-8,-8],[8,8]];
      const canvas=document.createElement('canvas');canvas.width=1152;canvas.height=1200;
      const c=canvas.getContext('2d');c.fillStyle='#153d46';c.fillRect(0,0,1152,1200);
      for(let row=0;row<10;row++) for(let col=0;col<8;col++) {
        const [dx,dz]=shots[col],x=col*144,y=row*120;
        const sprite=paint(musketPose(CAPTAIN_PALETTES[row],true,Math.atan2(dz*.72,Math.abs(dx))),[48,32],3);
        c.save();c.translate(x+(dx<0?144:0),y);c.scale(dx<0?-1:1,1);c.drawImage(sprite,0,0);c.restore();
        c.fillStyle='white';c.font='12px sans-serif';c.fillText(`Color ${row+1}: ${dx}, ${dz}`,x+8,y+112);
      }
      return canvas.toDataURL();
    });
    await writeFile(`${out}/all-colors-contact.png`,Buffer.from(sheet.split(',')[1],'base64'));
    const preview=await pages[0].evaluate(async shots=>{
      const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
      const c=canvas.getContext('2d');c.fillStyle='#153d46';c.fillRect(0,0,960,540);
      for(let i=0;i<shots.length;i++) {
        const [name,data]=shots[i],img=new Image();img.src=`data:image/png;base64,${data}`;await img.decode();
        const x=(i%4)*240,y=Math.floor(i/4)*270;
        c.drawImage(img,77,250,220,220,x+10,y+10,220,220);
        c.fillStyle='white';c.font='18px sans-serif';c.textAlign='center';c.fillText(name,x+120,y+250);
      }
      return canvas.toDataURL();
    },['up','down','left','right','up-left','up-right','down-left','down-right'].map(name=>[name,ownShots.get(name)]));
    await writeFile(`${out}/eight-directions-preview.png`,Buffer.from(preview.split(',')[1],'base64'));

  }
  if(!before) for(const hashes of snapshots.values()) assert.ok(hashes.size>=4,'directional views differ even when the body occludes the gun');
  for(const page of pages) { const memory=await page.evaluate(()=>window.t27.close());
    if(!before) { assert.ok(memory.before<=2,'one reused shot texture plus idle'); assert.equal(memory.after,memory.before-1,'shot texture released'); } }
  assert.deepEqual(env.errors,[]);
  console.log(`check-shooting-direction: OK (2 pages, 10 shot angles, 2 viewports; ${before?'baseline':'direction assertions'}); ${out}`);
} finally { await env.close(); }
