// Repeatable B3 component audit. Run from frontend; writes only to a new temporary output folder.
import assert from 'node:assert/strict';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openWorldBrowser} from './world-browser-tools.js';
import {showFeedbackFixture} from './feedback-fixtures.js';

// Always own the local fixture server, rather than point test actions at a deployed game.
assert(!process.env.TEST_URL, 'Unset TEST_URL: this check uses its own local server.');
const output = await mkdtemp(join(tmpdir(), 'plot-feedback-'));
const cases = ['join-code','join-full','create-offline','build-coins','build-locked','build-busy','leaderboard-offline','connection-offline'];
const env = await openWorldBrowser();
const report = {checked:[],errors:env.errors,external:env.external};
const {page} = env;

async function checkGame(name) {
  const status = page.locator('.games-status');
  if (name === 'create-offline') {
    const create = page.getByRole('button', {name:'Create a game',exact:true});
    await create.click();
    await page.waitForFunction(() => document.querySelector('.games-status')?.textContent.includes('Check your internet'));
    assert.equal(await create.isEnabled(), true);
    assert.equal(await page.evaluate(() => window.feedback.create), 1);
    return async () => {
      await create.click();
      await page.waitForFunction(() => !!window.feedback.choice?.joined);
      assert.equal(await page.evaluate(() => window.feedback.create), 2);
    };
  }
  await page.locator('input[name=code]').fill(name === 'join-code' ? 'bad!' : 'ISLE-K7Q2M');
  const submit = page.locator('.games-join button');
  await submit.click();
  const expected = name === 'join-code' ? 'Game codes look like' : 'This game has 10 players already.';
  await page.waitForFunction(text => document.querySelector('.games-status')?.textContent.includes(text), expected);
  assert.equal(await status.isVisible(), true);
  assert.equal(await submit.isEnabled(), true);
  assert.equal(await page.evaluate(() => window.feedback.join), name === 'join-code' ? 0 : 1);
  return async () => {
    await submit.click();
    await page.waitForFunction(() => !document.querySelector('.games-join button').disabled);
    assert.equal(await page.evaluate(() => window.feedback.join), name === 'join-code' ? 0 : 2);
  };
}

async function checkBuild(name) {
  const selector = name === 'build-locked' ? '[data-kind=mortar]' : '[data-kind=cannon]';
  const choice = page.locator(selector);
  const expected = name === 'build-coins' ? 'Not enough' : name === 'build-busy' ? 'Building…' : 'Opens after wave';
  assert((await choice.textContent()).includes(expected), `${name}: useful refusal/pending text`);
  const buttons = name === 'build-locked' ? choice : page.locator('.island-choice');
  assert((await buttons.count()) > 0);
  for (const button of await buttons.all()) {
    assert.equal(await button.isDisabled(), true);
    await button.evaluate(element => element.click()); // native disabled clicks must not emit build
  }
  assert.equal(await page.evaluate(() => window.feedback.build), 0);
  return async () => {
    if (name !== 'build-locked') return;
    const cannon = page.locator('[data-kind=cannon]');
    assert.equal(await cannon.isEnabled(), true);
    await cannon.click();
    assert.equal(await page.evaluate(() => window.feedback.build), 1);
  };
}

async function checkRetry(name) {
  const connection = name === 'connection-offline';
  const message = page.locator(connection ? '.connection-banner p' : '.island-message');
  assert.equal(await message.isVisible(), true);
  assert((await message.textContent()).includes(connection ? 'try again' : 'Return to the title'));
  const retry = page.getByRole('button', {name:connection ? 'Retry connection' : 'Try again',exact:true});
  assert.equal(await retry.isEnabled(), true);
  await retry.click();
  const calls = await page.evaluate(() => window.feedback);
  if (connection) assert.deepEqual(calls.intents, ['continueGame']);
  else assert.equal(calls.retry, 1);
}

try {
  for (const name of cases) for (const [width,height] of [[1280,720],[375,812]]) {
    await page.setViewportSize({width,height});
    await page.goto(env.url + '/qa/feedback.html');
    await page.evaluate(showFeedbackFixture, name);
    const afterCapture = name.startsWith('join') || name === 'create-offline' ? await checkGame(name)
      : name.startsWith('build') ? await checkBuild(name) : await checkRetry(name);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no horizontal overflow`);
    const screenshot = `${name}-${width}x${height}.png`;
    await page.screenshot({path:join(output,screenshot)});
    await afterCapture?.(); // preserve the error picture before testing successful recovery
    report.checked.push({name,width,height,screenshot});
  }
  assert.deepEqual(report.errors, [], 'No unexpected browser errors');
  assert.deepEqual(report.external, [], 'No external traffic');
  console.log(`Feedback audit: ${report.checked.length} cases passed; browser errors: 0; external requests: 0.`);
} finally {
  try { await writeFile(join(output,'report.json'), JSON.stringify(report,null,2)); }
  finally { await env.close(); }
  console.log(`Feedback evidence: ${output}`);
}
