// Scene presets and explorer motion remain reusable without adding gameplay rules.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { catalog, assetById } from '../src/assets/catalog.js';
import { studies } from '../src/studies/presets.js';
import { studyArtIds } from '../src/studies/scene.js';
import { createCharacter } from '../src/player/character.js';
import { projectPoint } from '../src/world/art.js';

const materials = () => Object.fromEntries(catalog.filter(item => item.usage !== 'css').map(item => [item.id, new THREE.MeshBasicMaterial()]));
describe('composition and motion contracts', () => {
  it('uses registered selected art and usable routes for every composition', () => {
    for (const study of Object.values(studies)) {
      const ids = studyArtIds(study);
      expect(ids.length).toBe(new Set(ids).size);
      expect(ids.length).toBeLessThan(catalog.length / 2);
      ids.forEach(id => expect(assetById[id], id).toBeTruthy());
      expect(study.route.length).toBeGreaterThan(2);
      study.route.forEach(point => expect(point.every(Number.isFinite)).toBe(true));
      study.placements.forEach(([, x, z, scale]) => { expect([x, z, scale].every(Number.isFinite)).toBe(true); expect(scale).toBeGreaterThan(0); });
    }
  });
  it('shows a side profile horizontally and resets mirroring when turning north', () => {
    const art = materials(), character = createCharacter(art);
    character.face(-1, 0); character.animate(0, 0);
    expect(character.sprite.material).toBe(art['explorer-side']); expect(character.sprite.scale.x).toBe(-1);
    character.face(0, -1); character.animate(0, 0);
    expect(character.sprite.material).toBe(art['explorer-back']); expect(character.sprite.scale.x).toBe(1);
  });
  it('ties gait to distance travelled and tolerates an older art kit', () => {
    const art = materials(), slow = createCharacter(art), fast = createCharacter(art);
    slow.face(1, 0); fast.face(1, 0); slow.animate(.3, 3.2); fast.animate(.16, 6);
    expect(slow.sprite.userData.pose).toBe(fast.sprite.userData.pose);
    const older = { explorer: art.explorer, 'explorer-back': art['explorer-back'] };
    const fallback = createCharacter(older); fallback.face(1, 0); fallback.animate(.4, 3.2);
    expect(fallback.sprite.material).toBe(art.explorer);
  });
  it('omits cosmetic bounce and breathing with reduced motion', () => {
    const art = materials(), character = createCharacter(art, { reducedMotion: true });
    character.group.position.set(2, 19, 5); character.face(1, 0); character.animate(.5, 3.2);
    expect(character.sprite.position.y).toBeCloseTo(projectPoint(2, 5).y);
    expect(character.sprite.scale.y).toBe(1);
    expect(character.sprite.material).toBe(art['explorer-side']);
  });
});
