// Captures the production Captain/Tech DOM with version-1 fixture models, not a live API or saved island.
// Run from frontend: node scripts/capture-captain-repair.js [output folder].
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? '../docs/evidence/T58-captain-repair';
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const shot = async (name, selector) => {
  await settle(page);
  const path = `${out}/${name}.png`;
  await page.locator(selector).screenshot({path});
  console.log(path);
};
const assertSingleCard = async (selector, title) => {
  for (let index = 0; index < 8; index++) {
    const cutscene = page.locator('dialog.cutscene[open] .cutscene-skip');
    const tutorial = page.locator('dialog.tutorial-card[open]').getByRole('button', {name: 'Skip', exact: true});
    if (await cutscene.count()) await cutscene.click();
    else if (await tutorial.count()) await tutorial.click();
    else break;
    await page.waitForTimeout(100);
  }
  const card = page.locator(selector);
  await card.waitFor();
  const actual = (await card.locator('.kit-heading').textContent())?.trim();
  const openDialogs = await page.locator('dialog[open]').evaluateAll(dialogs => dialogs.map(dialog =>
    `${dialog.className}: ${dialog.querySelector('.kit-heading')?.textContent?.trim() ?? ''}`));
  if (actual !== title || openDialogs.length !== 1)
    throw new Error(`Expected only the ${title} card to be open; found ${actual ?? 'no title'}; open dialogs: ${openDialogs.join(' | ')}.`);
};

try {
  await page.setViewportSize({width: 1280, height: 800});
  await page.goto(`${env.url}/?islands=fake&fakeplayer=t58_fixture&fakename=Ianno`);
  await page.locator('.shell-screen[open]').waitFor();
  await page.locator('#play').click();
  for (let index = 0; index < 12; index++) {
    await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open],.games-card[open],.island-card-lobby[open]')
      || (window.__island?.world.current?.id === 'home_islet' && window.__island.island && !document.querySelector('dialog[open]')),
    null, {timeout: 60000, polling: 100});
    if (await page.locator('.games-card[open]').count()) {
      await page.locator('.games-card[open] .games-create-button').waitFor();
      await page.locator('.games-card[open]').getByRole('button', {name: 'Create a game', exact: true}).click();
    } else if (await page.locator('.island-card-lobby[open]').count()) await page.keyboard.press('Escape');
    else if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
    else if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click();
    else break;
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => window.__island?.world.current?.id === 'home_islet' && window.__island.island && !document.querySelector('dialog[open]'));
  for (let index = 0; index < 10 && await page.locator('dialog[open]').count(); index++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  }
  if (await page.locator('dialog[open]').count()) throw new Error('An app dialog remained open before the fixture capture.');
  await page.evaluate(async () => {
    const [{createIslandUi}, {skillsModel, captainModel, techModel, buildCardModel}, {campaignOf}] = await Promise.all([
      import('/src/island/ui.js'), import('/src/island/card-model.js'), import('/src/campaign/index.js'),
    ]);
    const ui = createIslandUi({container: document.body, focus() {}, resetInput() {}});
    const research = campaignOf({waveBest: 30, campaign: {wave: 30, research: {
      done: ['wall'], tiers: {wall: {tier: 3, tier2: 'mason_drill', tier3: 'bastion'}},
    }}});
    const retired = ['quick_fix', 'long_reach', 'sturdy_planks', 'master_shipwright', 'swift_hammer', 'wide_arc', 'grand_engineer'];
    const captain = captainModel({captain: {level: 3}, coins: 2000, unlocks: {captain: 5}});
    const skills = skillsModel({skills: {known: retired, points: 0, role: 'engineer'}, wonWave: 20,
      picked: 'steady_aim', captainLevel: 3, coins: 2000, recoveryVersion: 1});
    const legacySkills = skillsModel({skills: {known: retired, points: 0, role: 'engineer'}, wonWave: 20,
      picked: 'quick_fix', captainLevel: 3, coins: 2000, recoveryVersion: 0});
    const tech = techModel({campaign: research, coins: 2000, recoveryVersion: 1});
    const wallCard = spec => buildCardModel({spotId: 'wall_1', slot: 'wall',
      spot: {id: 'wall_1', kind: 'wall', built: true, level: 1, cost: 10, upgradeCost: 20, spec},
      coins: 2000, campaign: research,
      recoveryState: {serverNow: '2026-11-17T12:00:00Z', islandEpoch: '22345678-1234-4234-8234-123456789abc',
        revision: 4, recoveryVersion: 1, waveProtocol: 2, displayPhase: 'between_waves', repairWindow: 'between_waves',
        waveId: null, remainingPaidUses: null, structures: [{spot: 'wall_1', instanceId: '32345678-1234-4234-8234-123456789abc',
          kind: 'wall', level: 1, hpUnits: 750000, maxHP: spec === 'bastion' ? 90 : 60,
          rateUnitsPerSecond: spec === 'quick_mend' ? 5000 : 7500,
          estimatedFreeSeconds: spec === 'quick_mend' ? 50 : 34, fixedPrice: 10, repairSeq: 0}]},
      recoveryStatus: 'ready', recoveryVersion: 1});
    window.__t58RecoveryCapture = {ui, captain, skills, legacySkills, tech, wallCard};
  });

  const captureCaptain = async (width, height, name, recoveryVersion = 1) => {
    await page.setViewportSize({width, height});
    await page.evaluate(version => window.__t58RecoveryCapture.ui.captainCard({tab: 'skills',
      captain: window.__t58RecoveryCapture.captain,
      skills: version === 0 ? window.__t58RecoveryCapture.legacySkills : window.__t58RecoveryCapture.skills,
      weapons: null}, {}), recoveryVersion);
    await assertSingleCard('.island-card-captain[open]', 'Captain and skills');
    await page.locator('.island-card-captain[open] .island-tree').waitFor();
    await shot(name, '.island-card-captain[open]');
    await page.evaluate(() => window.__t58RecoveryCapture.ui.close());
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  };
  await captureCaptain(1280, 800, 'captain-legacy-desktop', 0);
  await captureCaptain(1280, 800, 'captain-desktop');
  await captureCaptain(375, 812, 'captain-phone');

  const captureTech = async (width, height, option, name) => {
    await page.setViewportSize({width, height});
    await page.evaluate(() => window.__t58RecoveryCapture.ui.techCard(window.__t58RecoveryCapture.tech, {}));
    await assertSingleCard('.island-card-tech[open]', 'Tech hub');
    await page.locator('.island-card-tech[open] .island-tech-tree').waitFor();
    const wallTab = page.locator('.island-card-tech[open] [data-focus="branch-wall"]');
    if (await wallTab.isVisible()) await wallTab.click();
    await page.locator(`.island-card-tech[open] [data-focus="tech-${option}"]`).click();
    await shot(name, '.island-card-tech[open]');
    await page.evaluate(() => window.__t58RecoveryCapture.ui.close());
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  };
  await captureTech(1280, 800, 'mason_drill', 'tech-mason-drill-desktop');
  await captureTech(375, 812, 'bastion', 'tech-bastion-phone');

  const captureWall = async (spec, width, height, name) => {
    await page.setViewportSize({width, height});
    await page.evaluate(specId => window.__t58RecoveryCapture.ui.buildCard(
      window.__t58RecoveryCapture.wallCard(specId), {}), spec);
    await assertSingleCard('.island-card-build[open]', 'Wall');
    await page.locator('.island-card-build[open] .island-structure-recovery').waitFor();
    await shot(name, '.island-card-build[open]');
    await page.evaluate(() => window.__t58RecoveryCapture.ui.close());
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  };
  await captureWall('quick_mend', 1280, 800, 'wall-quick-mend-desktop');
  await captureWall('bastion', 375, 812, 'wall-bastion-phone');
  await page.evaluate(() => window.__t58RecoveryCapture.ui.dispose());
} catch (error) {
  await page.screenshot({path: `${out}/failure.png`}).catch(() => {});
  throw error;
} finally {
  await env.close?.();
}
