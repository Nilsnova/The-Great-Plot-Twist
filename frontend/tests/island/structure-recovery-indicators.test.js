// Scene indicators use exact canonical HP outside combat and leave v1 combat bars to the wave renderer.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it('shows damaged and tiny-positive rows in preparation, hides full HP and defers combat to replay renderer', async () => {
  const result = await browser.withPage(page => page.evaluate(async () => {
    const {createStructureRecoveryIndicators, structureRecoveryIndicatorRows} = await window.g20Import('/src/island/structure-recovery-indicators.js');
    const root = {children: [], add(item) { this.children.push(item); }, remove(item) { this.children = this.children.filter(child => child !== item); }};
    const positions = {wall_1: {x: 1, z: 2}, wall_2: {x: 3, z: 4}, cannon_1: {x: 5, z: 6}};
    const indicators = createStructureRecoveryIndicators({root, locate: spot => positions[spot]});
    const rows = [
      {spot: 'wall_1', kind: 'wall', hpUnits: 0, maxHP: 60},
      {spot: 'wall_2', kind: 'wall', hpUnits: 1, maxHP: 60},
      {spot: 'cannon_1', kind: 'cannon', hpUnits: 1_000_000, maxHP: 80},
    ];
    indicators.setState({displayPhase: 'preparing', structures: rows}); indicators.update();
    const visible = root.children.filter(item => item.visible).map(item => item.name).sort();
    const tinyTexture = root.children.find(item => item.name === 'structure-recovery:wall_2').material.map.image;
    const tinyPixel = [...tinyTexture.getContext('2d').getImageData(1, 1, 1, 1).data];
    const zeroTexture = root.children.find(item => item.name === 'structure-recovery:wall_1').material.map.image;
    const zeroContext = zeroTexture.getContext('2d');
    let brightMarkerPixels = 0;
    for (let x = 26; x < 30; x++) for (let y = 2; y < 9; y++) {
      const [red, green, blue] = zeroContext.getImageData(x, y, 1, 1).data;
      if (red > 180 && green > 180 && blue > 150) brightMarkerPixels++;
    }
    indicators.setState({displayPhase: 'combat', structures: rows}); indicators.update();
    const combatVisible = root.children.filter(item => item.visible).length;
    indicators.dispose();
    return {visible, tinyPixel, brightMarkerPixels, combatVisible, filtered: structureRecoveryIndicatorRows({displayPhase: 'combat', structures: rows}).length};
  }));
  expect(result.visible).toEqual(['structure-recovery:wall_1', 'structure-recovery:wall_2']);
  expect(result.tinyPixel[3]).toBe(255);
  expect(result.brightMarkerPixels).toBeGreaterThan(0);
  expect(result.combatVisible).toBe(0);
  expect(result.filtered).toBe(0);
});
