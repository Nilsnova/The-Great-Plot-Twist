// B2: local fake-game title-to-lobby check at phone/desktop sizes. Saves pictures and a report.
// Used by reviewers, run from frontend; real login/services are outside this tool.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openWorldBrowser,settle} from './world-browser-tools.js';

assert(!process.env.TEST_URL, 'Unset TEST_URL: entry actions must use an owned local fake game.');
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(),'plot-phone-entry-'));
await mkdir(output,{recursive:true});
const env = await openWorldBrowser(), {page} = env;
const report = {screens:[],errors:env.errors,external:env.external};
const stages = [
  ['intro','dialog.cutscene[open]','Skip'],
  ['tutorial','.tutorial-card[open]','Skip'],
  ['games','.games-card[open]','Create a game'],
  ['goal','.goal-card[open]','Got it'],
  ['lobby','.island-card-lobby[open]','Look around first'],
];

async function audit(name, selector, size) {
  const root = page.locator(selector).last(); await root.waitFor({state:'visible'}); await settle(page);
  const measured = await root.evaluate(root => {
    const box = root.getBoundingClientRect();
    const buttons = [...root.querySelectorAll('button')].filter(button => button.getClientRects().length);
    return {bounded:box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
      overflow:root.scrollWidth > root.clientWidth + 1,
      smallButtons:buttons.filter(button => { const b=button.getBoundingClientRect(); return b.width < 44 || b.height < 44; }).map(button => button.textContent.trim())};
  });
  assert(measured.bounded, `${name}: panel stays inside viewport`);
  assert(!measured.overflow, `${name}: no horizontal panel overflow`);
  assert.deepEqual(measured.smallButtons, [], `${name}: buttons at least 44x44`);
  const screenshot = `${name}-${size.width}x${size.height}.png`;
  await page.screenshot({path:join(output,screenshot)});
  report.screens.push({name,...size,...measured,screenshot});
}

async function enterIsland(size) {
  const seen = new Set();
  for (let attempt=0; attempt<240; attempt++) {
    for (const [name,selector,label] of stages) {
      const root = page.locator(selector).last();
      if (!(await root.isVisible())) continue;
      if (!seen.has(name)) { await audit(name,selector,size); seen.add(name); }
      await root.getByRole('button',{name:label,exact:true}).click();
    }
    if (seen.has('lobby') && await page.locator('dialog[open]').count() === 0) break;
    await page.waitForTimeout(100);
  }
  assert.deepEqual([...seen].sort(), stages.map(([name]) => name).sort(), 'Every entry stage appeared');
  assert(await page.evaluate(() => window.__island?.world.current?.id === 'home_islet'), 'Arrived on the fake island');
}

try {
  for (const size of [{width:375,height:812},{width:390,height:844},{width:1280,height:720}]) {
    await page.setViewportSize(size); await page.goto(env.url + '/?islands=fake');
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await page.reload();
    await audit('title','.shell-screen[open]',size);
    await page.getByRole('button',{name:'Join',exact:true}).click();
    await page.locator('.join-form').waitFor(); await audit('title-join','.shell-screen[open]',size);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.shell-screen[open]').getAttribute('data-mode'),'title');
    await page.locator('#play').click(); await enterIsland(size);
  }
  assert.deepEqual(report.errors, [], 'No browser errors'); assert.deepEqual(report.external, [], 'No external traffic');
  console.log(`Phone entry: ${report.screens.length} screens passed; browser errors: 0; external requests: 0.`);
} finally {
  try { await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)); }
  finally { await env.close(); }
  console.log(`Phone entry evidence: ${output}`);
}
