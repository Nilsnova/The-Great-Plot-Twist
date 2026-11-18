// CW4/T27 visual regression: real character and presence renderers, with controlled weapon events.
// Two browser pages show the same captain locally and remotely; no live accounts are used.
// Run with --before to capture the unchanged baseline without asserting the new frame names.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';
import {musketPixels} from './weapon-pose-pixels.js';
import {POSES} from '../src/pirates/poses.js';

const before = process.argv.includes('--before');
const galleryOnly = process.argv.includes('--gallery-only');
const out = process.env.T27_CAPTURES ?? `/tmp/plot-twist-t27-${before ? 'before' : 'after'}-directions`;
await mkdir(out, {recursive: true});
const env = await openWorldBrowser({hmr: false});
try {
  const pages = [env.page, await env.page.context().newPage()];
  pages[1].on('pageerror', error => env.errors.push(error.message));
  for (const [index, page] of pages.entries()) {
    await page.goto(`${env.url}/ui-kit.html`);
    await page.evaluate(async remote => {
      const THREE = await import('/node_modules/three/build/three.module.js');
      const {loadArt} = await import('/src/world/art.js');
      const {createCharacter} = await import('/src/player/character.js');
      const {createOtherCaptains} = await import('/src/world/others/index.js');
      const {POSE_IDS, createPoses} = await import('/src/pirates/poses.js');
      document.body.replaceChildren(); document.body.style.cssText = 'margin:0;background:#153d46;color:white;font:18px sans-serif';
      const heading = document.createElement('p'); heading.textContent = `CW4 — ${remote ? 'teammate' : 'own captain'} fixture`; document.body.append(heading);
      const renderer = new THREE.WebGLRenderer({alpha:true, preserveDrawingBuffer:true}); document.body.append(renderer.domElement);
      const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-6,6,4,-4,.1,100); camera.position.z = 10;
      const art = await loadArt(['explorer', 'captain-3', 'captain-3-side', 'captain-3-back', ...POSE_IDS]);
      const character = createCharacter(art); character.setColour(2); scene.add(character.sprite);
      const others = createOtherCaptains(scene, document.body, art, true, {colourOf:()=>2});
      if (remote) { scene.remove(character.sprite); others.ingest({sampledAt:1000, others:[{id:'captain',name:'Captain',place:'home_islet',x:0,y:0,facing:'front',moving:false}]}); }
      let clock = 0;
      const poses = createPoses({now:()=>clock});
      window.t27 = {
        gallery() {
          document.getElementById('cw4-gallery-labels')?.remove();
          const gallery=new THREE.Scene(), bodies=[], labels=document.createElement('div');
          labels.id='cw4-gallery-labels';
          labels.style.cssText='position:absolute;left:0;top:54px;width:100%;pointer-events:none'; document.body.append(labels);
          const phone=innerWidth<600, half=phone?6.2:4, height=innerHeight-80;
          camera.top=half;camera.bottom=-half;camera.left=-half*innerWidth/height;camera.right=-camera.left;camera.updateProjectionMatrix();
          for(const [i,weapon] of ['musket','pistols','blunderbuss','long_rifle','fire_bombs'].entries()) {
            clock=0;poses.note([{type:'captain_fired',weapon,by:weapon,x:0,z:0,toX:8,toZ:0}]);
            const body=createCharacter(art),x=phone?0:(i-2)*2.5,y=phone?4-i*2.3:-.8;
            body.setColour(2);gallery.add(body.sprite);body.group.position.set(x,0,-y/.72);body.pose(poses.get(weapon));body.animate(0,0);bodies.push(body);
            const label=document.createElement('span');label.textContent=weapon.replaceAll('_',' ');
            label.style.cssText=`position:absolute;left:${phone?12:(x-camera.left)/(camera.right-camera.left)*innerWidth}px;top:${(1-y/half)/2*height+15}px;${phone?'':'transform:translateX(-50%);'}font:16px sans-serif;white-space:nowrap`;
            labels.append(label);
          }
          renderer.setSize(innerWidth,height);renderer.render(gallery,camera);
          for(const body of bodies){body.dispose();body.sprite.geometry.dispose();body.poseMesh?.geometry.dispose();}
        },
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
  const approvedMusket=JSON.parse(await readFile(new URL('../tests/fixtures/cw4-musket-pixels.json',import.meta.url),'utf8'));
  assert.deepEqual(await musketPixels(pages[0]),approvedMusket.hashes,'approved musket RGBA pixels stay identical');
  const snapshots = new Map(), ownShots = new Map();
  if(!galleryOnly) for (const weapon of ['musket','pistols','blunderbuss','long_rifle','fire_bombs'])
  for(const [phase,age] of [['fire',0],['ready',POSES[weapon].fire+.01]])
  for (const [width,height] of [[1280,720],[375,812]]) for (const [direction,toX,toZ] of [['right',8,0],['left',-8,0],['up',0,-8],['down',0,8],['up-right',8,-8],['down-left',-8,8],['up-left',-8,-8],['down-right',8,8],['steep-up',2,-7],['shallow-up',7,-2]]) {
    const event={type:'captain_fired',weapon,by:'captain',x:0,z:0,toX,toZ};
    for (const [index,page] of pages.entries()) {
      await page.setViewportSize({width,height});
      const visible=await page.evaluate(([event,age])=>window.t27.draw(event,age),[event,age]);
      assert.equal(visible.length,1,'one visible captain body');
      if(!before) {
        assert.equal(visible[0].frame,`captain-3-${weapon}-${phase==='fire'?2:1}`);
        assert.ok(Math.abs(visible[0].angle-Math.atan2(toZ*.72,Math.abs(toX)))<1e-10,'exact projected aim');
        assert.equal(visible[0].flip,toX<0);
      }
      const screenshot=await page.screenshot({path:`${out}/${weapon}-${width}x${height}-${direction}-${phase}-${index?'remote':'own'}.png`});
      if(width===375 && index===0 && weapon==='musket'&&phase==='fire') ownShots.set(direction,screenshot.toString('base64'));
      const key=`${weapon}:${width}:${index}`; if(!snapshots.has(key)) snapshots.set(key,new Set());
      snapshots.get(key).add(createHash('sha256').update(screenshot).digest('hex'));
      const idle=await page.evaluate(event=>window.t27.draw(event,1),event);
      assert.equal(idle.length,1); assert.ok(!idle[0].frame.includes(`-${weapon}-`),'pose expires back to idle');
    }
  }
  if(!before&&!galleryOnly) {
    const {writeFile}=await import('node:fs/promises');
    const sheet=await pages[0].evaluate(async()=>{
      const {paint}=await import('/src/art/paint.js');
      const {weaponPose,CAPTAIN_PALETTES}=await import('/src/art/people.js');
      const weapons=['musket','pistols','blunderbuss','long_rifle','fire_bombs'];
      const canvas=document.createElement('canvas');canvas.width=720;canvas.height=1200;
      const c=canvas.getContext('2d');c.fillStyle='#153d46';c.fillRect(0,0,720,1200);
      for(let row=0;row<10;row++) for(let col=0;col<5;col++) {
        const x=col*144,y=row*120;
        c.drawImage(paint(weaponPose(CAPTAIN_PALETTES[row],weapons[col],true,0),[48,32],3),x,y);
        c.fillStyle='white';c.font='12px sans-serif';c.fillText(`${weapons[col]} ${row+1}`,x+8,y+112);
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
  if(!before&&!galleryOnly) for(const hashes of snapshots.values()) assert.ok(hashes.size>=4,'directional views differ even when the body occludes the gun');
  if(!before&&!galleryOnly) for(const page of pages) {
    const silhouettes=new Set();
    for(const weapon of ['musket','pistols','blunderbuss','long_rifle','fire_bombs']) {
      await page.evaluate(weapon=>window.t27.draw({type:'captain_fired',weapon,by:'captain',x:0,z:0,toX:8,toZ:0}),weapon);
      silhouettes.add(createHash('sha256').update(await page.screenshot()).digest('hex'));
    }
    assert.equal(silhouettes.size,5,'changing weapons at the same angle repaints five distinct silhouettes');
  }
  for(const [width,height] of [[1280,720],[375,812]]) {
    await pages[0].setViewportSize({width,height});await pages[0].evaluate(()=>window.t27.gallery());
    await pages[0].screenshot({path:`${out}/weapons-${width}x${height}.png`});
  }
  for(const page of pages) { const memory=await page.evaluate(()=>window.t27.close());
    if(!before&&!galleryOnly) { assert.ok(memory.before<=2,'one reused shot texture plus idle'); assert.equal(memory.after,memory.before-1,'shot texture released'); } }
  assert.deepEqual(env.errors,[]);
  console.log(`check-shooting-direction: OK (220 unchanged musket pixels; ${galleryOnly?'gallery fixture capture':'5 weapons, 2 phases, 2 pages, 10 shot angles'}, 2 viewports; ${before?'baseline':'after'}); ${out}`);
} finally { await env.close(); }
