// The How to play host selects recovery copy from the saved island policy version.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const evaluate = browserHarness();

it('keeps legacy repair help at version zero and selects wave-end repair help at version one', async () => {
  const result = await evaluate(async () => {
    const {createTutorialHost} = await window.g20Import('/src/tutorial/host.js');
    const container = document.createElement('main'); document.body.append(container);
    let recoveryVersion = 0;
    const host = createTutorialHost(container, {one: () => true, recoveryVersion: () => recoveryVersion});
    const page = () => {
      const card = container.querySelector('.tutorial-card[open]');
      return {id: card.dataset.page, text: card.querySelector('.tutorial-text').textContent};
    };
    const advance = () => container.querySelector('.tutorial-next').click();

    await host.open();
    for (let index = 0; index < 4; index++) advance();
    const legacyAshore = page();
    host.close();
    recoveryVersion = 1;
    await host.open();
    for (let index = 0; index < 4; index++) advance();
    const currentAshore = page();
    for (let index = 0; index < 7; index++) advance();
    const recovery = page();
    host.dispose();
    return {legacyAshore, currentAshore, recovery};
  });

  expect(result.legacyAshore.text).toContain('press E at a damaged wall to repair it');
  expect(result.currentAshore.id).toBe('ashore');
  expect(result.currentAshore.text).toContain('At wave end every wall and tower returns to full health.');
  expect(result.currentAshore.text).not.toMatch(/mend between waves|repair rate|ETA/i);
  expect(result.recovery.id).toBe('repair');
  expect(result.recovery.text).toContain('Every wall and tower returns to full health as soon as a wave ends.');
  expect(result.recovery.text).not.toMatch(/mend between waves|repair rate|ETA/i);
  expect(result.recovery.text).toContain('up to three successful Repair now uses across the island for that wave');
});
