// Personal v1 remains coin-free on a legacy economy; the real card shows the server's Engineer commitment.
import {expect, it} from 'vitest';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('reads personal adoption separately on a legacy island and keeps the island when respec returns only a profile', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {personalCaptain, personalReply} = await window.g20Import('/tests/island/economy-fixture.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport(); base.dev.setCoins(9000);
    let absent = false;
    const writes = [], commitment = {id: '55555555-5555-4555-8555-555555555555', state: 'pending', waveId: null};
    let profile = personalReply({captain: personalCaptain({engineerCommitment: commitment, roleLockedReason: 'engineer_bound'})});
    const transport = {get: path => path === '/api/captain'
      ? Promise.resolve(absent ? {ok: false, status: 409, code: 'captain_not_initialized'} : {ok: true, data: profile}) : base.get(path),
      post: (path, body) => {
        if (path !== '/api/captain/respec') return base.post(path, body);
        writes.push({path, body});
        profile = personalReply({captain: {...profile.captain, revision: '2'}, skills: {points: 4, earned: 4, spent: 0, known: []}});
        return Promise.resolve({ok: true, data: profile});
      }};
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      menu: () => () => {}, settings: () => () => {}});
    await island.load(); island.openCaptain();
    const initial = {text: document.querySelector('.island-card[open]').textContent, code: island.island.code};
    await island.build('wall_1', 'wall');
    island.openCaptain();
    const afterBuild = {text: document.querySelector('.island-card[open]').textContent,
      captain: island.island.captain, known: island.island.skills?.known};
    island.openCaptain('skills'); await island.respecCaptain(); await island.respecCaptain();
    const after = {code: island.island.code, spots: island.island.spots.length, coins: island.island.coins,
      role: island.captainLoadout().skills.includes('engineer'), points: island.island.skills.points};
    absent = true; await island.load(); island.openCaptain();
    const unavailable = document.querySelector('.island-card[open]').textContent;
    island.dispose();
    return {initial, afterBuild, after, writes, unavailable};
  });
  expect(result.initial.text).toContain('Skill points: 3');
  expect(result.initial.text).not.toContain('Upgrade');
  expect(result.afterBuild.captain).toMatchObject({progressionVersion: 1, level: 3, revision: '1'});
  expect(result.afterBuild.known).toEqual(['steady_aim']);
  expect(result.afterBuild.text).toContain('Skill points: 3');
  expect(result.afterBuild.text).not.toContain('Upgrade');
  expect(result.after).toMatchObject({code: result.initial.code, coins: 8990, role: true, points: 4});
  expect(result.after.spots).toBeGreaterThan(0);
  expect(result.writes).toHaveLength(1);
  expect(Object.keys(result.writes[0].body).sort()).toEqual(['actionUid', 'expectedRevision', 'progressionVersion']);
  expect(result.writes[0].body).toMatchObject({expectedRevision: '1', progressionVersion: 1});
  expect(result.unavailable).toContain('Captain progress unavailable');
  expect(result.unavailable).not.toContain('Upgrade');
});

it('shows an idle Engineer commitment and skill-only respec without a coin price', async () => {
  await evaluate.withPage(async page => {
    await page.setViewportSize({width: 1280, height: 800});
    const result = await page.evaluate(async () => {
      for (const path of ['/src/ui/base.css', '/src/ui/kit/kit.css', '/src/ui/styles.css', '/src/ui/readability.css']) await window.g20Import(path);
      const {createIslandUi} = await window.g20Import('/src/island/ui.js');
      const {captainModel, skillsModel} = await window.g20Import('/src/island/card-model.js');
      const {personalCaptain, personalReply} = await window.g20Import('/tests/island/economy-fixture.js');
      const profile = personalCaptain({engineerCommitment: {id: '55555555-5555-4555-8555-555555555555', state: 'pending', waveId: null}, roleLockedReason: 'engineer_bound'});
      const container = document.createElement('main'); container.id = 'game'; document.body.append(container);
      const ui = createIslandUi({container}); window.personalFixtureUi = ui;
      ui.captainCard({tab: 'skills', captain: captainModel({captain: profile, points: 3, coins: 9000}), weapons: null,
        skills: skillsModel({personalCaptain: profile, skills: personalReply().skills, coins: 0, captainLevel: 3, battle: true})}, {});
      const card = document.querySelector('.island-card[open]'), respec = card.querySelector('[data-focus="respec"]');
      return {button: respec.textContent, disabled: respec.disabled, line: card.querySelector('.island-respec-line').textContent,
        binding: card.querySelector('.island-role-lead').textContent, title: card.querySelector('.island-role-title').textContent};
    });
    expect(result).toMatchObject({button: 'Respec', disabled: false});
    expect(result.line).toContain('keep Engineer'); expect(result.binding).toContain('Stay Engineer'); expect(result.title).toContain('Engineer');
    expect(result.button).not.toContain('🪙');
    await page.locator('[data-focus="respec"]').scrollIntoViewIfNeeded();
    if (process.env.MP_ECO_EVIDENCE_DIR) {
      await mkdir(process.env.MP_ECO_EVIDENCE_DIR, {recursive: true});
      await page.screenshot({path: join(process.env.MP_ECO_EVIDENCE_DIR, 'engineer-personal-progress.png')});
    }
    await page.evaluate(() => window.personalFixtureUi.dispose());
  });
});


it.each([['captain_not_initialized', true], ['captain_context_required', false]])(
  'initial personal GET %s only permits the specified unadopted legacy fallback', async (code, legacy) => {
    const result = await evaluate(async code => {
      const {createIsland} = await window.g20Import('/src/island/index.js');
      const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
      const {on, emit} = await window.g20Import('/src/core/events.js');
      const base = createFakeIslandTransport(); base.dev.setCoins(9000); base.dev.setWaveBest(9);
      const transport = {post: (path, body) => base.post(path, body), get: path => path === '/api/captain'
        ? Promise.resolve({ok: false, status: 409, code}) : base.get(path)};
      const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
        menu: () => () => {}, settings: () => () => {}});
      await island.load(); island.openCaptain();
      const result = {captain: island.island.captain, text: document.querySelector('.island-card[open]').textContent};
      island.dispose(); return result;
    }, code);
    if (legacy) {
      expect(result.captain).not.toHaveProperty('progressionVersion', 1);
      expect(result.text).toContain('Upgrade');
      expect(result.text).not.toContain('Captain progress unavailable');
    } else {
      expect(result.captain).toEqual({progressionVersion: 1});
      expect(result.text).toContain('Captain progress unavailable');
      expect(result.text).not.toContain('Upgrade');
    }
  },
);
