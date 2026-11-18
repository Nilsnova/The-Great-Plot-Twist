// One reusable shot texture per captain: repaint only when weapon, aim, color or firing frame changes.
// The body stays upright; the weapon follows the exact projected target angle. No saved state.
import {paint} from '../art/paint.js';
import {CAPTAIN_PALETTES, weaponPose} from '../art/people.js';
import {screenDensity, smoothTexture, spriteMaterial} from '../art/textures.js';
import {POSES} from './poses.js';

export function createShotArt() {
  let material = null, previous = null;
  // Keep texture dimensions fixed while reusing its GPU allocation, as loadArt does.
  const density = screenDensity();
  return {
    material(pose, colour) {
      if (!POSES[pose?.kind]?.fire || !Number.isFinite(pose.angle)) return null;
      const index = Number.isInteger(colour) && colour >= 0 && colour < 10 ? colour : 0;
      const firing = pose.age < POSES[pose.kind].fire;
      const key = `${pose.kind}:${index}:${pose.angle}:${firing}`;
      if (key !== previous) {
        const canvas = paint(weaponPose(CAPTAIN_PALETTES[index], pose.kind, firing, pose.angle), [48, 32], density);
        if (!material) material = spriteMaterial(smoothTexture(canvas));
        else { material.map.image = canvas; material.map.needsUpdate = true; }
        material.userData.shotAngle = pose.angle;
        previous = key;
      }
      return material;
    },
    dispose() { material?.map.dispose(); material?.dispose(); material = null; previous = null; },
  };
}
