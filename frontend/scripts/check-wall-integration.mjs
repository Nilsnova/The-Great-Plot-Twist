// VIS69 local browser evidence with installed Chrome and the application's fake island transport.
// Install locked frontend dependencies in both checkouts first and use main 840549a5 for baseline.
// node scripts/check-wall-integration.mjs <checkout> <output> baseline|revised [desktop|phone]
// <checkout> may be the Git root or its frontend directory; <output> is relative to the caller.
import assert from 'node:assert/strict';
import {access, mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const [checkout, output, revision, deviceFilter] = process.argv.slice(2);
assert.ok(checkout && output && ['baseline', 'revised'].includes(revision), 'checkout, output and revision are required');
const root = resolve(checkout), out = resolve(output);
const frontend = await access(join(root,'frontend','package.json')).then(() => join(root,'frontend'), () => root);
process.chdir(frontend);
const fromFrontend = path => import(pathToFileURL(join(frontend,'scripts',path)));
const {openWorldBrowser, settle} = await fromFrontend('world-browser-tools.js');
const {stubWeather} = await fromFrontend('weather-browser-fixture.js');
const {stubOfflineApi} = await fromFrontend('api-browser-fixture.js');
const devices = [
  {label:'desktop', viewport:{width:1280, height:720}, isMobile:false, reducedMotion:'no-preference'},
  {label:'phone', viewport:{width:375, height:812}, isMobile:true, reducedMotion:'reduce'},
].filter(device => !deviceFilter || device.label === deviceFilter);
assert.ok(devices.length, 'choose desktop or phone');
await mkdir(out, {recursive:true});
const flags = 'live_presence,market,arena,sign_in,demo,sports,islands,placement,wall_recovery,arsenal,rescue,defenses_v2,tower_health,pathing,more_tower_spots,ship_fire,tower_obstacles,structure_recovery';
const wallPrices = [10, 20, 40, 80, 160];
const startingCoins = 400000, best = 30;
const targets = {third: {id:'wall_6', x:-12, z:-1}, fourth: {id:'wall_11', x:-7.5, z:-1}};
const battleSignals = ['wave_started', 'cannon_fired', 'mortar_fired', 'culverin_fired', 'swivel_fired', 'ship_fired', 'boarder_landed', 'wall_damaged', 'wave_finished', 'wave_finish_answered'];
const START_DIALOGS = '.games-card[open], .island-card-lobby[open], .goal-card[open], dialog.cutscene[open], .tutorial-card[open]';
const env = await openWorldBrowser({hmr:false});

async function dismissNarrator(page) {
  for (let count = 0, quiet = 0; count < 120 && quiet < 9; count++) {
    const close = page.locator('.narrator-card:not([hidden])').getByRole('button',{name:'Skip the narrator',exact:true});
    if (await close.count()) { await close.click(); quiet=0; }
    else quiet++;
    await page.waitForTimeout(100);
  }
}

async function closeDialogs(page) {
  for (let count = 0, quiet = 0; count < 60 && quiet < 5; count++) {
    const open = page.locator('dialog[open]').last();
    if (!await open.count()) quiet++;
    else {
      quiet = 0;
      const continueButton = open.getByRole('button', {name:/^(Skip all|Skip|Got it)$/}).first();
      if (await continueButton.count()) await continueButton.click();
      else await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(150);
  }
  assert.equal(await page.locator('dialog[open]').count(), 0, 'all onboarding dialogs dismissed normally');
}

async function enter(page) {
  await page.goto(`${env.url}/?islands=fake&fakeplayer=me&fakename=Captain&fakeflags=${flags}`);
  await page.locator('.shell-screen[open]').waitFor();
  await page.locator('#play').click();
  for (let attempt = 0; attempt < 24; attempt++) {
    await page.waitForFunction(selector => document.querySelector(selector)
      || (window.__island?.world.current?.id === 'home_islet' && window.__island.island?.island), START_DIALOGS);
    if (await page.locator('.games-card[open]').count()) {
      await page.getByRole('button',{name:'Create a game', exact:true}).click();
    } else if (await page.locator('.island-card-lobby[open]').count()) {
      await page.locator('.island-lobby-start').click();
    } else if (await page.locator('.goal-card[open]').count()) {
      await page.getByRole('button',{name:'Got it',exact:true}).click();
    } else if (await page.locator('dialog.cutscene[open], .tutorial-card[open]').count()) {
      await page.getByRole('button',{name:'Skip',exact:true}).click();
    } else break;
    await page.waitForTimeout(200);
  }
  await page.waitForFunction(() => window.__island?.world.current?.id === 'home_islet'
    && window.__island.island?.island && window.__island.waves);
  await closeDialogs(page);
}

// Original saved defaults are independently taken from the agreed twelve-slot layout.
const wallDefaults = [[-18.5,-1],[19,1],[19,-1],[-1,17],[1,17],[-18.5,-3],
  [8.5,2],[.5,9.5],[-1.5,9.5],[-9.5,-1],[-9.5,1],[8.5,0]];
const islandState = page => page.evaluate(async defaults => {
  const answer = await window.__island.island.api.getIsland();
  if (!answer.ok) throw new Error(`island read failed: ${answer.code}`);
  const {coins, spots} = answer.data;
  const walls = spots.filter(spot => spot.id.startsWith('wall_')).map(({id,built,x,z,level}) => {
    const [fixedX,fixedZ] = defaults[Number(id.slice(5))-1];
    return {id,built,x:x??fixedX,z:z??fixedZ,level};
  });
  return {coins,walls};
},wallDefaults);

function wallOf(state, id) { return state.walls.find(wall => wall.id === id); }

async function proofFrame(page) {
  return page.evaluate(() => {
    const g = window.__island;
    return {lost:g.renderer.getContext().isContextLost(), zoom:g.camera.zoom, camera:g.camera.position.toArray(),
      drawCalls:g.renderer.info.render.calls, triangles:g.renderer.info.render.triangles, textures:g.renderer.info.memory.textures,
      reducedMotion:document.documentElement.dataset.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches,
      visible:g.world.current.group.visible, pixelRatio:g.renderer.getPixelRatio()};
  });
}

async function capture(page, report, name, {settleFrame = true} = {}) {
  if (settleFrame) await settle(page);
  const frame = await proofFrame(page);
  assert.equal(frame.lost, false, 'Chromium WebGL context remains active');
  assert.equal(frame.visible, true, 'home island is rendered');
  assert.ok(frame.drawCalls > 0, 'renderer issued draw calls');
  const file = `${revision}-${report.label}-${name}.png`;
  await page.screenshot({path:join(out,file)});
  report.screens.push({file, frame});
}

async function stand(page,x,z) {
  await page.evaluate(([x,z]) => {
    const game = window.__island, ground = game.world.current.groundHeight;
    game.player.position.set(x, ground?.(x,z) ?? 1.03, z);
    game.view.setPlace('home_islet', game.player.position);
    game.renderer.domElement.focus();
  },[x,z]);
}

async function buyWall(page,id,level,report) {
  const before = await islandState(page);
  const original = wallOf(before,id);
  // The regular phone details sheet can cover its wall. Use the app's village dock for a
  // proof of the map feedback without changing how the UI lays out or dismissing it mid-effect.
  const viaPhoneDetails = revision === 'revised' && id === 'wall_10' && level === 3 && report.isMobile;
  const viaVillageDock = (id === 'wall_10' && level === 2) || viaPhoneDetails;
  if (viaVillageDock) {
    await dismissNarrator(page);
    await stand(page,-7,-1);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Manage village',exact:true}).click();
    await page.getByRole('button',{name:'Working village view',exact:true}).click();
    await page.waitForTimeout(950);
    await groundTap(page,report,original);
    assert.equal(await page.evaluate(() => window.__island.island.selection?.spotId),id,'selected correct wall to upgrade from its dock');
    if (viaPhoneDetails) await page.locator('.island-selection-dock [data-focus="details"]').tap();
  } else {
    await page.evaluate(id => window.__island.island.pick(id),id);
  }
  const panel = viaVillageDock && !viaPhoneDetails ? '.island-selection-dock' : '.island-card[open]';
  const action = page.locator(`${panel} [data-focus="${level === 1 ? 'build' : 'upgrade'}"]`);
  if (viaPhoneDetails) await action.tap();
  else await action.click();
  await page.waitForFunction(([id,level]) => {
    const row = window.__island.island.island.spots.find(spot => spot.id === id);
    return row?.built && row.level === level;
  },[id,level]);
  if (id === 'wall_10' && level <= 2) {
    const title = level === 1 ? 'build-feedback' : 'upgrade-feedback';
    const name = revision === 'revised' ? 'island-wall-feedback' : '__none';
    if (revision === 'revised') {
      await page.waitForFunction(name => window.__island.world.current.group.getObjectByName(name)?.visible, name, {timeout:2500});
      const samples = await page.evaluate(name => new Promise(resolve => {
        const ring = window.__island.world.current.group.getObjectByName(name), samples = [];
        function sample() {
          if (samples.length === 10) return resolve(samples);
          const motes = window.__island.world.current.group.getObjectByName('island-wall-feedback-motes');
          samples.push({at:performance.now(), visible:ring.visible, opacity:ring.material.opacity,
            radius:ring.scale.x, center:ring.position.toArray(), visibleMotes:motes?.visible === true});
          requestAnimationFrame(sample);
        }
        sample();
      }), name);
      assert.ok(samples.every(sample => sample.visible && sample.opacity > 0 && sample.radius > 0));
      assert.ok(samples.every(sample => sample.center.every(Number.isFinite)));
      assert.ok(samples.every(sample => JSON.stringify(sample.center) === JSON.stringify(samples[0].center)), 'ground anchor remains fixed');
      if (report.isMobile) {
        assert.ok(samples.every(sample => sample.radius === samples[0].radius && sample.opacity === samples[0].opacity), 'reduced motion holds the receipt static');
        assert.ok(samples.every(sample => !sample.visibleMotes), 'reduced motion avoids moving motes');
      } else {
        assert.ok(samples.some(sample => sample.radius !== samples[0].radius || sample.opacity !== samples[0].opacity), 'normal motion eases radius or opacity');
        assert.ok(samples.some(sample => sample.visibleMotes), 'normal motion includes the particle reveal');
      }
      const unobscured = await page.evaluate(name => {
        const game=window.__island, canvas=game.renderer.domElement, rect=canvas.getBoundingClientRect();
        const projected=game.world.current.group.getObjectByName(name).position.clone().project(game.camera);
        const x=rect.left+(projected.x+1)*rect.width/2, y=rect.top+(1-projected.y)*rect.height/2;
        return document.elementFromPoint(x,y) === canvas;
      },name);
      assert.ok(unobscured,'the actual purchase highlight is visible within the game canvas');
      report.feedback.push({title, samples, unobscured});
    }
    await capture(page,report,title,{settleFrame:false});
    if (revision === 'revised') {
      await page.waitForFunction(name => !window.__island.world.current.group.getObjectByName(name)?.visible,name,{timeout:3000});
    }
  }
  if (viaPhoneDetails) {
    const handle = await page.waitForFunction(() => document.getAnimations().find(animation =>
      animation.id === 'island-wall-level-receipt' && animation.playState === 'running'), null, {timeout:2500});
    const header = await handle.evaluate(animation => {
      const target = animation.effect.target;
      const box = target.getBoundingClientRect();
      const receipt = target.querySelector('.island-wall-purchase-receipt[role="status"]');
      const duplicateToast = [...document.querySelectorAll('.u-toast-text')].some(item => item.textContent === receipt?.textContent);
      const {duration,easing} = animation.effect.getTiming();
      return {id:animation.id, duration, easing, duplicateToast, receipt:receipt?.textContent,
        receiptVisible:receipt?.getBoundingClientRect().height > 0, visible:box.height > 0 && box.width > 0
        && getComputedStyle(target).visibility === 'visible', modal:!!target.closest('.island-card[open]')};
    });
    await handle.dispose();
    assert.ok(header.visible && header.modal && header.receiptVisible,'the receipt appears in the open phone Details sheet');
    assert.match(header.receipt,/^Wall level 3\s*·/, 'the receipt confirms the purchased level');
    assert.equal(header.duplicateToast,false,'the Details receipt is not duplicated by an overlapping toast');
    assert.match(header.easing,/^steps\(1\b/,'reduced motion holds the header highlight static');
    report.feedback.push({title:'details-upgrade-feedback',header});
    await capture(page,report,'details-upgrade-feedback',{settleFrame:false});
    await page.waitForFunction(() => !document.getAnimations().some(animation =>
      animation.id === 'island-wall-level-receipt' && animation.playState === 'running'), null, {timeout:2500});
  }
  const after = await islandState(page), saved = wallOf(after, id);
  assert.equal(after.coins, before.coins - wallPrices[level - 1], `${id} level ${level} paid its exact listed price`);
  assert.ok(saved.built && saved.level === level, `${id} level ${level} was persisted in the fake transport`);
  assert.deepEqual([saved.x,saved.z],[original.x,original.z],`${id} purchase held its anchor`);
  report.receipts.push({spot:id, level, paid:before.coins-after.coins, balance:after.coins, at:[saved.x,saved.z]});
  await page.evaluate(() => window.__island.island.ui.close());
  if (viaVillageDock) await page.getByRole('button',{name:'Exit village mode',exact:true}).click();
}

async function switchView(page,report,view) {
  await page.getByRole('button',{name:view === 'fit' ? 'Fit village' : 'Working village view',exact:true}).click();
  await page.waitForTimeout(950);
  await dismissNarrator(page);
  await capture(page,report,view);
}

async function groundTap(page,device,{x,z,lift=0}) {
  const point = await page.evaluate(async ({x,z,lift}) => {
    const g = window.__island, rect = g.renderer.domElement.getBoundingClientRect();
    g.camera.updateMatrixWorld();
    const {projectGround} = await import('/src/world/projection.js');
    const ground = projectGround(x,z);
    const projected = g.player.position.clone().set(ground.x,ground.y+lift,0).project(g.camera);
    const clientX = rect.left + (projected.x+1)*rect.width/2, clientY = rect.top + (1-projected.y)*rect.height/2;
    const hit = document.elementFromPoint(clientX,clientY);
    return {clientX,clientY,canvas:hit===g.renderer.domElement,hit:hit?.className};
  },{x,z,lift});
  assert.ok(point.canvas,`projected ground tap must hit game canvas: ${JSON.stringify(point)}`);
  await (device.isMobile ? page.touchscreen.tap(point.clientX,point.clientY) : page.mouse.click(point.clientX,point.clientY));
}

async function startMove(page,id) {
  await page.evaluate(id => window.__island.island.pick(id),id);
  await page.getByRole('button',{name:'Move',exact:true}).click();
  await page.locator('.island-move-bar:not([hidden])').waitFor();
}

async function placeTrial(page,device,report) {
  const before = await islandState(page);
  const west = wallOf(before, 'wall_10');
  await groundTap(page,device,{x:west.x, z:west.z, lift:.45});
  await page.locator('.island-selection-dock').waitFor({timeout:6000});
  assert.equal(await page.evaluate(() => window.__island.island.selection?.spotId),'wall_10','real canvas input selected the intended wall');
  await capture(page,report,'selected');
  await page.locator('.island-selection-dock').getByRole('button',{name:'Close',exact:true}).click();

  await startMove(page,targets.third.id);
  await page.waitForTimeout(650);
  await groundTap(page,device,targets.third);
  await page.waitForFunction(({x,z}) => {
    const move = window.__island.island.moveMode.state;
    return move?.x === x && move?.z === z && move?.ok;
  },targets.third,{timeout:6000});
  await page.locator('.island-move-place').click();
  await page.locator('.island-move-bar').waitFor({state:'hidden'});
  const third = await islandState(page);
  assert.equal(third.coins,before.coins,'Move does not charge');
  assert.deepEqual(wallOf(third,targets.third.id),{...wallOf(before,targets.third.id),x:targets.third.x,z:targets.third.z});
  assert.deepEqual(third.walls.filter(row=>row.id!==targets.third.id),before.walls.filter(row=>row.id!==targets.third.id));
  report.move = {from:wallOf(before,targets.third.id),to:wallOf(third,targets.third.id),charged:0};

  await startMove(page,targets.fourth.id);
  await page.waitForTimeout(650);
  await groundTap(page,device,targets.fourth);
  const rowLimit = await page.evaluate(() => {
    const b = document.querySelector('.island-move-bar');
    return {refused:b.classList.contains('is-refused'),disabled:b.querySelector('.island-move-place').disabled,
      status:b.querySelector('.island-move-status').textContent, candidate:window.__island.island.moveMode.state};
  });
  assert.equal(rowLimit.candidate.x,targets.fourth.x,'move candidate x');
  assert.equal(rowLimit.candidate.z,targets.fourth.z,'move candidate z');
  assert.equal(rowLimit.refused, revision==='revised','only current branch blocks exceeding three rows');
  assert.equal(rowLimit.disabled, revision==='revised','only current branch disables Place here');
  if (revision==='revised') assert.match(rowLimit.status,/at most three wall rows/i);
  await capture(page,report,'fourth-row');
  await page.locator('.island-move-cancel').click();
  report.fourth = {refused:rowLimit.refused, disabled:rowLimit.disabled, status:rowLimit.status};
  if (revision==='revised') {
    const result = await page.evaluate(({id,x,z}) => window.__island.island.api.move({spot:id,x,z}),targets.fourth);
    assert.deepEqual([result.ok,result.status,result.code],[false,409,'wall_rows']);
    report.fourth.transport = {status:result.status,code:result.code};
  }
  assert.deepEqual(await islandState(page),third,'fourth-row preview and rejection leave coins, levels and positions intact');

  const invalid = await page.evaluate(async () => {
    const i=window.__island.island;
    const duplicate = await i.api.build({spot:'wall_1',kind:'wall'});
    const extra = await i.api.build({spot:'wall_13',kind:'wall'});
    const maximum = await i.api.upgrade({spot:'wall_5'});
    return [duplicate,extra,maximum].map(({ok,status,code})=>({ok,status,code}));
  });
  assert.deepEqual(invalid,[
    {ok:false,status:409,code:'spot_taken'},
    {ok:false,status:404,code:'no_such_spot'},
    {ok:false,status:409,code:'max_level'},
  ]);
  assert.deepEqual(await islandState(page),third,'invalid builds and upgrade leave coins and positions intact');
  report.rejectedPurchases = invalid;
  await page.getByRole('button',{name:'Exit village mode',exact:true}).click();
}

async function fight(page,report) {
  await dismissNarrator(page);
  await stand(page,-4,2);
  await page.evaluate(() => window.__island.island.pick('island_bell'));
  await page.locator('.island-card-bell[open] [data-focus="bell"]').click();
  await page.waitForFunction(() => window.__island.waves.island.wave?.info?.wave === 31);
  await page.waitForFunction(() => window.__wallReviewEvents.some(e => ['cannon_fired','mortar_fired','culverin_fired','swivel_fired'].includes(e.type))
    && window.__wallReviewEvents.some(e => e.type==='ship_fired'), null, {timeout:100000,polling:100});
  await capture(page,report,'firing');
  await page.waitForFunction(() => window.__wallReviewEvents.some(e=>e.type==='boarder_landed')
    && window.__wallReviewEvents.some(e=>e.type==='wall_damaged' && e.broken===true), null, {timeout:140000,polling:100});
  const combat = await page.evaluate(() => {
    const wave = window.__island.waves.island.wave;
    const eventTypes = {};
    for (const event of window.__wallReviewEvents) eventTypes[event.type]=(eventTypes[event.type]??0)+1;
    return {wave:wave.info.wave, seed:wave.info.seed, ticks:wave.ticks, eventTypes,
      firstFire:window.__wallReviewEvents.find(e=>e.type.endsWith('_fired')), firstBreach:window.__wallReviewEvents.find(e=>e.type==='wall_damaged'&&e.broken===true),
      walls:wave.state.walls.map(({id,hp,maxHp})=>({id,hp,maxHp})),
      defenses:wave.defenses.filter(row=>row.kind==='wall').map(({id,x,z,level})=>({id,x,z,level})),
      art:wave.renderer?.levels?.()??null, visibleMarks:wave.renderer?.marks?.()??null};
  });
  assert.equal(combat.walls.length,12,'wave still uses all twelve installed walls');
  assert.ok(combat.walls.some(wall=>wall.hp===0),'observed a true simulation wall breach');
  assert.ok(combat.walls.some(wall=>wall.hp===wall.maxHp),'intact walls remain visible during first breach');
  const third = combat.defenses.find(wall=>wall.id===targets.third.id);
  assert.deepEqual([third.x,third.z],[targets.third.x,targets.third.z],'wave uses saved Move coordinates');
  assert.equal(combat.art[third.id],third.level,'battle draws the moved wall at its purchased tier');
  assert.deepEqual(combat.defenses.map(row=>row.id).sort(),combat.walls.map(row=>row.id).sort(),
    'all saved wall defenses correspond one-to-one with wall health in the simulation');
  report.combat = combat;
  await capture(page,report,'breach');
}

async function run(device) {
  const report = {label:device.label, viewport:device.viewport, isMobile:device.isMobile, reducedMotion:device.reducedMotion,
    browser:env.browser.version(), receipts:[], screens:[], feedback:[], consoleErrors:[], pageErrors:[], externalRequests:[]};
  const context = await env.browser.newContext({viewport:device.viewport, isMobile:device.isMobile, hasTouch:device.isMobile,
    reducedMotion:device.reducedMotion, deviceScaleFactor:device.isMobile?2:1});
  const page = await context.newPage();
  page.on('pageerror',err=>report.pageErrors.push(err.message));
  page.on('console',msg=>{ if (msg.type()==='error') report.consoleErrors.push(msg.text()); });
  await page.route('**/*',route=>{
    const url = route.request().url();
    if (url.startsWith(env.url+'/')) return route.continue();
    report.externalRequests.push(new URL(url).origin);
    return route.abort();
  });
  await stubOfflineApi(page);
  await stubWeather(page);
  try {
    await enter(page);
    await page.evaluate(async ([startingCoins,best,events])=>{
      const g = window.__island, i = g.island;
      g.settings.hour=11; g.settings.fastTime=false;
      i.dev.setCoins(startingCoins); i.dev.setWaveBest(best);
      await i.load();
      window.__wallReviewEvents=[];
      for (const type of events) g.on(type,event=>window.__wallReviewEvents.push(structuredClone(event)));
      for (const [id,kind] of [['cannon_1','cannon'],['cannon_2','mortar'],['cannon_3','harpoon'],['cannon_4','swivel'],
        ['cannon_5','culverin'],['tower_1','watchtower'],['house_1','house'],['house_2','house']]) await i.build(id,kind);
      i.ui.close();
    },[startingCoins,best,battleSignals]);
    await closeDialogs(page);
    const preWall = await islandState(page);
    assert.equal(preWall.walls.length,12,'fixture has exactly twelve reserved wall slots');
    assert.equal(preWall.walls.filter(s=>s.built).length,0,'fixture starts with no built walls');
    for (let index = 1; index <= 12; index++) {
      const id = `wall_${index}`, tier = 1+(index-1)%5;
      if (id==='wall_10') await stand(page,-7,-1);
      for (let level=1; level<=tier; level++) await buyWall(page,id,level,report);
    }
    const paid = await islandState(page);
    assert.equal(report.receipts.filter(row=>row.level===1).length,12);
    assert.deepEqual([...new Set(paid.walls.map(row=>row.level))].sort(),[1,2,3,4,5]);
    assert.equal(paid.coins,preWall.coins-report.receipts.reduce((total,row)=>total+row.paid,0));
    report.paid = paid;
    console.log(`${revision} ${device.label}: ${report.receipts.length} exact paid wall transactions; balance ${paid.coins}`);
    await closeDialogs(page);
    await dismissNarrator(page);
    await stand(page,-6,-1);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Manage village',exact:true}).click();
    await page.locator('.island-village-mode:not([hidden])').waitFor();
    await switchView(page,report,'work');
    await switchView(page,report,'fit');
    await placeTrial(page,device,report);
    console.log(`${revision} ${device.label}: pointer selection, free placement, fourth-row result and rejected payments verified`);
    await fight(page,report);
    console.log(`${revision} ${device.label}: wave ${report.combat.wave} fired and breached ${report.combat.firstBreach.wallId} (seed ${report.combat.seed})`);
    assert.deepEqual(report.pageErrors,[]);
    assert.deepEqual(report.consoleErrors,[]);
    assert.deepEqual(report.externalRequests,[]);
    report.result = 'passed';
  } catch (error) {
    report.result = 'failed';
    report.error = error.stack;
    await page.screenshot({path:join(out,`${revision}-${device.label}-failure.png`)}).catch(()=>{});
    throw error;
  } finally {
    await writeFile(join(out,`${revision}-${device.label}.json`),JSON.stringify(report,null,2)+'\n');
    await context.close();
  }
}

const failures = [];
try {
  for (const device of devices) {
    try { await run(device); }
    catch (error) { failures.push(error); console.error(error.stack); }
  }
} finally {
  await env.close();
}
if (failures.length) process.exitCode=1;
