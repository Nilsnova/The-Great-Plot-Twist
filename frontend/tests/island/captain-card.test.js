// Menu › Captain and skills in real Chromium with the fake server (TOWER-DEFENSE.md §10, §14, §15): the
// three tabs, the skill tree's states and points, learning a skill, the tier order, and the weapon shop
// (locked, buy, equip). The same shapes the real server answers.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('the skill tree: points from won waves, learn, tier order, no points; the weapon shop: locked, buy, equip', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const learned = [], equipped = [];
    on('captain_skill_learned', event => learned.push(event.skill));
    on('captain_weapon_equipped', event => equipped.push(event.weapon));
    const transport = createFakeIslandTransport();
    const entries = [];
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      menu: provider => { entries.push(...provider().map(item => item.label)); return () => {}; }});
    await island.load();
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const card = () => document.querySelector('.island-card[open]');
    const tab = id => card().querySelector(`[data-focus="tab-${id}"]`);
    const skill = id => card().querySelector(`[data-skill="${id}"]`);
    const tree = () => [...card().querySelectorAll('.island-skill')].map(item => `${item.dataset.skill}:${[...item.classList].find(name => /^is-(learned|ready|locked)$/.test(name))}`);
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

    // The weapon shop.
    tab('weapons').click();
    const rows = () => [...card().querySelectorAll('.island-weapon')].map(row => `${row.dataset.weapon}:${row.querySelector('.kit-button').textContent}:${row.querySelector('.kit-button').disabled}`);
    const shop = rows();
    card().querySelector('[data-weapon="pistols"] .kit-button').click(); await wait(40);
    const bought = {rows: rows(), toast: island.ui.toastText, coins: island.island.coins, loadout: island.captainLoadout()};
    card().querySelector('[data-weapon="musket"] .kit-button').click(); await wait(40);
    const back = {rows: rows(), toast: island.ui.toastText, loadout: island.captainLoadout()};
    island.dispose();
    return {title, tabs, fresh, two, lockedDetail, focusKept, afterLearn, noPoints, linked, refused, shop, bought, back, learned, equipped, entries};
  });
  expect(result.entries).toContain('Captain and skills');
  expect(result.title).toBe('Captain and skills');
  expect(result.tabs).toEqual(['Captain', 'Skills', 'Weapons']);
  expect(result.fresh.points).toBe('Skill points: 0');
  expect(result.fresh.heads).toEqual(['Marksman', 'Brawler', 'Shipwright']);
  expect(result.fresh.tree).toEqual(['steady_aim:is-locked', 'long_barrel:is-locked', 'quick_hands:is-locked', 'cutlass:is-locked', 'sweep:is-locked',
    'second_wind:is-locked', 'quick_fix:is-locked', 'long_reach:is-locked', 'master_shipwright:is-locked']);
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
  expect(result.linked).toEqual([false, true, false]);
  expect(result.refused).toMatchObject({ok: false, status: 409, code: 'locked', message: 'Learn Sweep first.'});
  expect(result.shop).toEqual(['musket:Equipped:true', 'pistols:Buy · 🪙 60:false', 'blunderbuss:Buy · 🪙 120:true', 'long_rifle:Locked:true', 'fire_bombs:Locked:true']);
  expect(result.bought.toast).toBe('Pistols bought and equipped! You have 🪙 40.');
  expect(result.bought.coins).toBe(40);
  expect(result.bought.rows.slice(0, 2)).toEqual(['musket:Equip:false', 'pistols:Equipped:true']);
  expect(result.bought.loadout).toEqual({level: 1, skills: ['steady_aim'], weapon: 'pistols', colour: 0});
  expect(result.back.toast).toBe('Musket equipped. Your captain shoots with it now.');
  expect(result.back.loadout.weapon).toBe('musket');
  expect(result.learned).toEqual(['steady_aim']);
  expect(result.equipped).toEqual(['musket']);
});
