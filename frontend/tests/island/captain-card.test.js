// Menu › Captain and skills in real Chromium with the fake server (TOWER-DEFENSE.md §10, §14): the two
// tabs, the skill tree's states and points, learning a skill and the tier order (weapons are in the arsenal,
// arsenal-dom.test.js). The same shapes the real server answers.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('the skill tree: points from won waves, learn, tier order, no points', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const learned = [];
    on('captain_skill_learned', event => learned.push(event.skill));
    const transport = createFakeIslandTransport();
    const entries = [];
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      menu: provider => { entries.push(...provider().map(item => item.label)); return () => {}; }});
    await island.load();
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const card = () => document.querySelector('.island-card[open]');
    const tab = id => card().querySelector(`[data-focus="tab-${id}"]`);
    const skill = id => card().querySelector(`[data-skill="${id}"]`);
    const tree = () => [...card().querySelectorAll('.island-skill')].map(item => `${item.dataset.skill}:${[...item.classList].find(name => /^is-(learned|ready|locked|closed)$/.test(name))}`);
    const detail = () => ({name: card().querySelector('.island-skill-detail strong').textContent,
      line: card().querySelector('.island-skill-line').textContent, button: card().querySelector('[data-focus="learn"]').textContent,
      disabled: card().querySelector('[data-focus="learn"]').disabled,
      reason: card().querySelector('.island-skill-detail .island-reason').hidden ? '' : card().querySelector('.island-skill-detail .island-reason').textContent});

    island.openCaptain();
    const title = card().querySelector('.kit-heading').textContent;
    const tabs = [...card().querySelectorAll('.kit-tab')].map(item => item.textContent);
    tab('skills').click();
    const fresh = {points: card().querySelector('.island-points').textContent, tree: tree(), detail: detail(),
      heads: [...card().querySelectorAll('.island-branch-name')].map(item => item.textContent)};
    island.ui.close();

    // Wave 5 won: 2 skill points.
    transport.dev.setWaveBest(5); await island.load();
    island.openCaptain('skills');
    const two = {points: card().querySelector('.island-points').textContent, tab: tab('skills').textContent, tree: tree()};
    skill('long_barrel').click(); await wait(10);
    const lockedDetail = detail();
    skill('steady_aim').focus(); skill('steady_aim').click(); await wait(10);
    const focusKept = document.activeElement?.dataset?.skill;
    card().querySelector('[data-focus="learn"]').click(); await wait(40);
    const afterLearn = {points: card().querySelector('.island-points').textContent, tree: tree(), toast: island.ui.toastText};
    skill('long_barrel').click(); await wait(10);
    const noPoints = detail();
    const linked = [...card().querySelectorAll('.island-branch-marksman .island-tier')].map(item => item.classList.contains('is-linked'));
    // The server refuses the tier order too.
    const refused = await island.api.learnSkill({skill: 'second_wind'});
    const loadout = island.captainLoadout();
    island.dispose();
    return {title, tabs, fresh, two, lockedDetail, focusKept, afterLearn, noPoints, linked, refused, loadout, learned, entries};
  });
  expect(result.entries).toContain('Captain and skills');
  expect(result.title).toBe('Captain and skills');
  expect(result.tabs).toEqual(['Captain', 'Skills']);
  expect(result.fresh.points).toBe('Skill points: 0');
  expect(result.fresh.heads).toEqual(['Marksman', 'Brawler', 'Shipwright']);
  expect(result.fresh.tree).toEqual(['steady_aim', 'long_barrel', 'hot_shot', 'quick_hands', 'far_sight', 'heavy_shot', 'dead_eye',
    'cutlass', 'sweep', 'heavy_blade', 'second_wind', 'snap_shot', 'bruiser', 'field_surgeon',
    'quick_fix', 'long_reach', 'sturdy_planks', 'master_shipwright', 'swift_hammer', 'wide_arc', 'grand_engineer'].map(id => `${id}:is-locked`));
  expect(result.fresh.detail).toMatchObject({name: 'Steady aim', button: 'Learn', disabled: true, reason: 'Win new waves to earn skill points.'});
  expect(result.two.points).toBe('Skill points: 2');
  expect(result.two.tab).toBe('Skills (2)');
  expect(result.two.tree.filter(item => item.endsWith('is-ready'))).toEqual(['steady_aim:is-ready', 'cutlass:is-ready', 'quick_fix:is-ready']);
  expect(result.lockedDetail).toMatchObject({name: 'Long barrel', disabled: true, reason: 'Learn Steady aim first.'});
  expect(result.focusKept).toBe('steady_aim');
  expect(result.afterLearn.points).toBe('Skill points: 1');
  expect(result.afterLearn.tree).toContain('steady_aim:is-learned');
  expect(result.afterLearn.toast).toBe('New skill: Steady aim!');
  expect(result.noPoints).toMatchObject({name: 'Long barrel', disabled: true, reason: 'Win new waves to earn skill points.'});
  expect(result.linked).toEqual([false, true, false, false, false]);
  expect(result.refused).toMatchObject({ok: false, status: 409, code: 'locked', message: 'Learn Sweep or Heavy blade first.'});
  expect(result.loadout).toEqual({level: 1, skills: ['steady_aim'], weapon: 'musket', colour: 0});
  expect(result.learned).toEqual(['steady_aim']);
});
