// B2: generated captain names stay readable on phones; entry/lobby controls keep their behavior.
import {expect, it} from 'vitest';
import {mkdir,writeFile} from 'node:fs/promises';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();
const phones = [{width:375,height:812}, {width:390,height:844}];

// Optional review evidence; ordinary tests do not write screenshots.
async function capture(page, name, measurements) {
  const folder = process.env.B2_LOBBY_CAPTURE; if (!folder) return;
  await mkdir(folder, {recursive:true});
  await page.screenshot({path:`${folder}/${name}.png`});
  if (measurements) await writeFile(`${folder}/${name}.json`, JSON.stringify(measurements,null,2));
}

async function lobby(page, size, me = 'p0') {
  await page.setViewportSize(size);
  await page.evaluate(async me => {
    await window.g20Import('/src/ui/kit/kit.css');
    const {createIslandUi} = await window.g20Import('/src/island/ui.js');
    const {lobbyModel} = await window.g20Import('/src/island/lobby.js');
    const roles = ['gunner','medic',null,'engineer'];
    const members = Array.from({length:10}, (_,i) => ({id:`p${i}`,name:`Wandering Lighthouse ${i+10}`,
      role:i === 0 ? 'host' : 'member',captainRole:roles[i % roles.length]}));
    const model = lobbyModel({code:'ISLE-K7Q2M',base:'https://example.test/',members,
      online:new Set(['p0','p1','p2','p4']),me,hostId:'p0'});
    window.starts = 0;
    const ui = createIslandUi({container:document.body});
    ui.lobbyCard(model, {start:() => { window.starts++; }});
  }, me);
}

it.each(phones)('shows full lobby names/status and reachable controls at $width x $height', async size => {
  await browser.withPage(async page => {
    await lobby(page, size);
    const names = await page.locator('.island-lobby-name').evaluateAll(nodes => nodes.map(node => ({
      text:node.textContent,width:node.clientWidth,contentWidth:node.scrollWidth,unclipped:node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1,
    })));
    await page.locator('.island-lobby-players').scrollIntoViewIfNeeded();
    await capture(page, `lobby-${size.width}x${size.height}`, names);
    expect(names).toHaveLength(10);
    expect(names.every(name => name.unclipped)).toBe(true);
    expect(names[0].text).toBe('Wandering Lighthouse 10 (you)');
    expect(await page.locator('.island-lobby-state').allTextContents()).toContain('Host · online');
    const last = page.locator('.island-lobby-player').last();
    await last.scrollIntoViewIfNeeded();
    expect(await page.locator('.island-lobby-players').evaluate(list => list.scrollTop)).toBeGreaterThan(0);
    const start = page.getByRole('button', {name:'Start',exact:true});
    await start.scrollIntoViewIfNeeded();
    const box = await start.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    expect(await page.locator('dialog[open]').evaluate(card => card.scrollWidth <= card.clientWidth)).toBe(true);
    await start.focus(); expect(await start.evaluate(node => node === document.activeElement)).toBe(true);
    await start.click(); expect(await page.evaluate(() => window.starts)).toBe(1);
    await page.keyboard.press('Escape'); expect(await page.locator('dialog[open]').count()).toBe(0);
  });
});

it('keeps Start disabled for a member while the host is present', async () => {
  await browser.withPage(async page => {
    await lobby(page, phones[0], 'p1');
    const start = page.getByRole('button', {name:'Start',exact:true});
    expect(await start.isDisabled()).toBe(true);
    await start.evaluate(node => node.click());
    expect(await page.evaluate(() => window.starts)).toBe(0);
    const done = page.getByRole('button', {name:'Look around first',exact:true});
    await done.click(); expect(await page.locator('dialog[open]').count()).toBe(0);
  });
});

it('retains a bounded full lobby and usable Start on desktop', async () => {
  await browser.withPage(async page => {
    await lobby(page, {width:1280,height:720});
    await page.locator('.island-lobby-players').scrollIntoViewIfNeeded();
    await capture(page, 'lobby-1280x720');
    expect(await page.locator('.island-lobby-player').count()).toBe(10);
    expect(await page.locator('dialog[open]').evaluate(card => card.scrollWidth <= card.clientWidth)).toBe(true);
    await page.getByRole('button', {name:'Start',exact:true}).click();
    expect(await page.evaluate(() => window.starts)).toBe(1);
  });
});

it.each([...phones,{width:1280,height:720}])('keeps Continue/Create/Join reachable at $width x $height', async size => {
  await browser.withPage(async page => {
    await page.setViewportSize(size);
    await page.evaluate(async () => {
      await window.g20Import('/src/ui/kit/kit.css');
      const {chooseGame} = await window.g20Import('/src/front-door/games.js');
      const game = {code:'ISLE-K7Q2M',hostName:'Wandering Lighthouse 99',role:'member',waveBest:10,members:10,maxMembers:10};
      window.joins = []; window.creates = 0;
      const api = window.entryApi = {games:async () => ({ok:true,data:{games:[game]}}),
        createGame:async () => { window.creates++; return {ok:true,data:{game:{...game,role:'host'}}}; }, joinGame:async code => {
        window.joins.push(code); return {ok:true,data:{game}};
      }};
      chooseGame({container:document.body,lane:{api,mode:'fake'}}).done.then(choice => { window.entryChoice = choice; });
    });
    await page.locator('.games-pick').waitFor();
    await capture(page, `entry-${size.width}x${size.height}`);
    expect(await page.locator('.games-pick-title').textContent()).toBe("Wandering Lighthouse 99's game");
    for (const selector of ['.games-pick','.games-create-button','.games-join button']) {
      const control = page.locator(selector); await control.scrollIntoViewIfNeeded();
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    const code = page.locator('input[name=code]'); await code.fill('bad!');
    await page.locator('.games-join button').click();
    await page.waitForFunction(() => document.querySelector('.games-status').textContent.includes('Check the code'));
    expect(await page.evaluate(() => window.joins)).toEqual([]);
    expect(await page.locator('dialog[open]').evaluate(card => card.scrollWidth <= card.clientWidth)).toBe(true);
    await code.fill('k7q2m'); await page.locator('.games-join button').click();
    await page.waitForFunction(() => !!window.entryChoice?.joined);
    expect(await page.evaluate(() => window.joins)).toEqual(['ISLE-K7Q2M']);
    await page.evaluate(async () => {
      const {chooseGame} = await window.g20Import('/src/front-door/games.js');
      chooseGame({container:document.body,lane:{api:window.entryApi,mode:'fake'}});
    });
    await page.getByRole('button', {name:'Create a game',exact:true}).click();
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    expect(await page.evaluate(() => window.creates)).toBe(1);
    await page.evaluate(async () => {
      const {chooseGame} = await window.g20Import('/src/front-door/games.js');
      chooseGame({container:document.body,lane:{api:window.entryApi,mode:'fake'}});
    });
    await page.locator('.games-pick').click();
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    expect(await page.evaluate(() => window.joins)).toEqual(['ISLE-K7Q2M','ISLE-K7Q2M']);
  });
});
