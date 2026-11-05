// Pixel explorer motion preserves facing, distance-based cadence and reduced motion.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pixelArt } from '../src/pixel/catalog.js';
import { createCharacter } from '../src/player/character.js';
import { projectPoint } from '../src/world/art.js';

const materials = () => Object.fromEntries(pixelArt.map(item => [item.id, new THREE.MeshBasicMaterial()]));
describe('composition and motion contracts', () => {
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
    expect(Math.abs(character.sprite.position.y - projectPoint(2, 5).y)).toBeLessThanOrEqual(1 / 32);
    expect(character.sprite.scale.y).toBe(1);
    expect(character.sprite.material).toBe(art['explorer-side']);
  });
});
