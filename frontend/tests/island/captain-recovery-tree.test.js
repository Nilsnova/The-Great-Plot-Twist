// The new Captain tree never leaves a retired skill selected as an invisible purchase.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const evaluate = browserHarness();

it('switches a saved retired skill selection to a visible new-policy choice', async () => {
  const result = await evaluate(async () => {
    const {skillsModel} = await window.g20Import('/src/island/card-model.js');
    const {drawSkills} = await window.g20Import('/src/island/skill-tree.js');
    const model = skillsModel({skills: {known: ['quick_fix'], points: 2, role: 'engineer'}, wonWave: 10, picked: 'quick_fix', pickedRole: 'engineer'});
    const click = [];
    const kit = {
      line(className, text) {
        const element = document.createElement('p'); element.className = className; element.textContent = text; return element;
      },
      button(label, onClick) {
        const element = document.createElement('button'); element.textContent = label; element.addEventListener('click', onClick); return element;
      },
    };
    const legacy = drawSkills({...model, recoveryVersion: 0}, {learn: id => click.push(id)}, kit);
    const legacyPicked = legacy.querySelector('.island-node.is-picked')?.dataset.skill;
    const legacyRoleLine = legacy.querySelector('.island-role-line')?.textContent;
    const legacyCapstone = legacy.querySelector('.island-role-capstone')?.textContent;
    const current = drawSkills({...model, recoveryVersion: 1}, {learn: id => click.push(id)}, kit);
    const currentPicked = current.querySelector('.island-node.is-picked')?.dataset.skill;
    const currentDetail = current.querySelector('.island-skill-detail strong')?.textContent;
    const currentRoleLine = current.querySelector('.island-role-line')?.textContent;
    const currentCapstone = current.querySelector('.island-role-capstone')?.textContent ?? '';
    current.querySelector('[data-focus="learn"]').click();
    return {legacyPicked, currentPicked, currentDetail, click, legacyRoleLine, legacyCapstone, currentRoleLine, currentCapstone,
      retiredVisible: [...current.querySelectorAll('.island-skill')].some(button => button.dataset.skill === 'quick_fix')};
  });
  expect(result).toEqual({
    legacyPicked: 'quick_fix',
    currentPicked: 'steady_aim',
    currentDetail: 'Steady aim',
    click: ['steady_aim'],
    legacyRoleLine: 'Walls you repair or rebuild get 25% more hp, and buildings and upgrades cost you 10% less.',
    legacyCapstone: 'Unlocks Grand engineer (top of Shipwright).',
    currentRoleLine: 'Buildings and upgrades cost you 10% less.',
    currentCapstone: '',
    retiredVisible: false,
  });
});
