import {expect, it} from 'vitest';
import {weaponComparison, arsenalModel} from '../../src/island/arsenal-model.js';
import {captainStats} from '../../src/pirates/captain-stats.js';

it.each([
  ['musket','6','No change','14','No change','1.2 s','No change'],
  ['pistols','3','3 less','10','4 less','0.48 s','0.72 s faster'],
  ['blunderbuss','4.8','1.2 less','9','5 less','1.92 s','0.72 s slower'],
  ['long_rifle','10.8','4.8 more','22','8 more','2.16 s','0.96 s slower'],
  ['fire_bombs','9','3 more','14','No change','2.88 s','1.68 s slower'],
])('compares %s against a level-one musket without ranking firing modes', (id,damage,damageChange,range,rangeChange,reload,reloadChange) => {
  const view = weaponComparison(id);
  expect(view.reference).toBe('Musket');
  expect(view.rows).toEqual([
    {label:'Damage per hit',value:damage,change:damageChange},
    {label:'Range',value:range,change:rangeChange},
    {label:'Reload',value:reload,change:reloadChange},
  ]);
  expect(view.currentMode).toBe('One ship per shot.');
  expect(view.mode).toBeTruthy();
});
it('uses learned skills, captain level and role in both sides of the comparison', () => {
  const skills = ['steady_aim','quick_hands','gunner'];
  const view = weaponComparison('long_rifle','pistols',4,skills);
  expect(view.reference).toBe('Pistols');
  expect(Number(view.rows[0].value)).toBe(captainStats(4,skills,'long_rifle').damage);
  expect(view.rows[0].value).not.toBe(weaponComparison('long_rifle','pistols',4).rows[0].value);
  expect(view.rows[2].value).toBe(`${captainStats(4,skills,'long_rifle').reload} s`);
  expect(view.rows[0].change).not.toMatch(/000000|999999/);
});
it('same-type, invalid ids and reload-floor boundaries stay readable', () => {
  expect(weaponComparison('pistols','pistols',5,['quick_hands','snap_shot','gunner']).rows.map(row=>row.change)).toEqual(['No change','No change','No change']);
  expect(weaponComparison('unknown','unknown').rows).toEqual(weaponComparison('musket').rows);
  expect(weaponComparison('pistols','musket',5,['quick_hands','snap_shot','gunner']).rows[2].value).toBe('0.3 s');
});
it('rack and shop compare against the carried copy, using the same skill-aware stats', () => {
  const answer = {code:'ISLE-K7Q2M',capacity:20,stored:1,waveRunning:false,coins:1000,
    copies:[{id:'mine',no:1,weapon:'pistols',holder:'me',away:false,you:true},
      {id:'free',no:2,weapon:'long_rifle',holder:null,away:false,you:false}]};
  const original = structuredClone(answer);
  const view = arsenalModel({answer,level:3,skills:['steady_aim']});
  expect(view.rack[1].comparison.reference).toBe('Pistols');
  expect(view.shop.find(row=>row.id==='long_rifle').comparison).toEqual(view.rack[1].comparison);
  expect(view.carry.stats).toContain(`Damage ${captainStats(3,['steady_aim'],'pistols').damage}`);
  expect(answer).toEqual(original);
});
