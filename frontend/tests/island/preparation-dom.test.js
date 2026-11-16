import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

it.each([{width:1280,height:720},{width:375,height:812}])('bell preparation works at $width x $height', async size => {
  await browser.withPage(async page => {
    await page.setViewportSize(size);
    await page.evaluate(async () => {
      for (const sheet of ['base','kit/kit','shell','styles','travel','readability','kit/components','devices','open-panels']) await window.g20Import(`/src/ui/${sheet}.css`);
      const {createIslandUi} = await window.g20Import('/src/island/ui.js');
      const {bellModel} = await window.g20Import('/src/island/card-model.js');
      const {preparationModel} = await window.g20Import('/src/island/preparation-model.js');
      const island = {code:'ISLE-K7Q2M',waveBest:1,spots:[{id:'cannon_1',kind:'cannon',built:true},{id:'wall_1',kind:'wall',built:true}]};
      window.actions = [];
      window.prepUi = createIslandUi({container:document.body});
      window.prepModel = bellModel({waveBest:1,nextWave:2,preparation:preparationModel({island,wallRecovery:true,
        wallState:{code:island.code,rows:[{spot:'wall_1',health:0}]}})});
      window.prepAction = action => window.actions.push(action);
      window.prepUi.bellCard(window.prepModel, window.prepAction);
    });
    expect(await page.getByRole('region',{name:'Before the wave'}).textContent()).toContain('1 destroyed');
    const unlocks = page.locator('.island-unlocks summary');
    expect((await unlocks.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await unlocks.focus(); await page.keyboard.press('Enter');
    expect(await page.locator('.island-unlocks').evaluate(node => node.open)).toBe(true);
    expect(await page.locator('.island-unlocks li').count()).toBe(3);
    await page.evaluate(()=>window.prepUi.bellCard(window.prepModel, window.prepAction));
    expect(await page.locator('.island-unlocks').evaluate(node=>node.open)).toBe(true);
    expect(await unlocks.evaluate(node=>node===document.activeElement)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const ring = page.getByRole('button',{name:'Ring the bell',exact:true});
    await ring.focus(); await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.actions)).toEqual(['ring']);
    await page.keyboard.press('Escape');
    expect(await page.locator('dialog[open]').count()).toBe(0);
    await page.evaluate(() => window.prepUi.dispose());
  });
});

it('the controller forwards nextWave and discards a late wall read after a visit', async () => {
  await browser.withPage(async page => {
    await page.evaluate(async () => {
      const {createIsland} = await window.g20Import('/src/island/index.js');
      const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
      const {BELL} = await window.g20Import('/src/island/spots.js');
      const {on,emit} = await window.g20Import('/src/core/events.js');
      const base = createFakeIslandTransport({flags:{wall_recovery:true}});
      base.dev.setWaveBest(20); window.bellId = BELL.id;
      const row = (spot,health) => ({spot,level:1,health,recoversAt:null,repairCost:3});
      const get = async path => {
        if (path === '/api/island/walls') return new Promise(resolve => { window.finishOldWalls = resolve; });
        if (path.startsWith('/api/island/walls?')) return {ok:true,data:{coins:100,walls:[row('wall_1',100),row('wall_2',100)]}};
        const answer = await base.get(path);
        return path === '/api/island' && answer.ok ? {...answer,data:{...answer.data,nextWave:18}} : answer;
      };
      window.prepIsland = createIsland({container:document.body,emit,on,mode:'fake',transport:{...base,get},wallRecovery:()=>true,
        storage:null,visitStorage:null,menu:()=>()=>{}});
      await window.prepIsland.load(); window.prepIsland.pick(BELL.id);
    });
    await page.waitForFunction(() => !!window.finishOldWalls);
    expect(await page.locator('.island-card-bell .island-purpose').first().textContent()).toContain('wave 18');
    await page.evaluate(async () => { window.prepIsland.visit('ISLE-FR3ND'); await window.prepIsland.load(); });
    await page.waitForFunction(() => !!window.prepIsland.visiting);
    await page.evaluate(() => window.prepIsland.pick(window.bellId));
    await page.waitForFunction(() => document.querySelector('.island-preparation')?.textContent.includes('Last known wall health'));
    const before = await page.locator('.island-preparation').textContent();
    await page.evaluate(async () => {
      window.finishOldWalls({ok:true,data:{coins:100,walls:[{spot:'wall_1',level:1,health:0,recoversAt:null,repairCost:3}]}});
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    expect(await page.locator('.island-preparation').textContent()).toBe(before);
    expect(before).toContain('0 destroyed');
    await page.evaluate(() => window.prepIsland.dispose());
  });
});
