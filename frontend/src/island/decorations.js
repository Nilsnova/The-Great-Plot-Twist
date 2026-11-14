// T5: reads existing island progress and draws cosmetic milestones; T45 adds the statue stages.
// Used by world.js.
import * as THREE from 'three';
import {paint} from '../art/paint.js';
import {drawWaveBadge, drawWaveStatue, statueStage, waveRank} from '../art/milestones.js';
import {screenDensity, smoothTexture, spriteMaterial} from '../art/textures.js';

export function decorationState(campaign = null, spots = []) {
  const wave = Number.isSafeInteger(campaign?.wave) && campaign.wave >= 0 ? campaign.wave : 0;
  const houses = new Set(spots.filter(spot => spot?.built === true && spot.kind === 'house'
    && ['house_1', 'house_2'].includes(spot.id)).map(spot => spot.id));
  const stage = statueStage(wave).index;
  return {wave, statue: stage >= 1, statueStage: stage, treeScale: [1, 1.1, 1.2][houses.size]};
}

function milestone(root, name, width, height, x, z) {
  const geometry = new THREE.PlaneGeometry(width / 16, height / 16);
  geometry.translate(0, (height / 2 - 4) / 16, 0);
  const mesh = new THREE.Mesh(geometry, spriteMaterial(null));
  mesh.name = name; mesh.position.set(x, -z * .72, 0);
  mesh.renderOrder = 100 + z; mesh.frustumCulled = false; mesh.visible = false;
  root.add(mesh); return mesh;
}

export function decorateProgress(place) {
  const root = new THREE.Group(); root.name = 'island-progress'; place.group.add(root);
  const flag = milestone(root, 'island-best-wave', 64, 80, -3.5, 2.5);
  const statue = milestone(root, 'island-wave-25', 48, 64, 4, 5.5);
  const trees = [];
  place.group.traverse(mesh => {
    if (['oak', 'pine', 'birch'].includes(mesh.userData.asset)) trees.push({mesh, scale: mesh.scale.clone()});
  });
  let lastWave = null, disposed = false;
  function apply(campaign, spots, known) {
    if (disposed) return;
    const next = decorationState(campaign, spots);
    flag.visible = known; statue.visible = known && next.statue;
    if (!known) return;
    if (next.wave !== lastWave) {
      const texture = smoothTexture(paint(c => drawWaveBadge(c, next.wave), [64, 80], screenDensity()));
      flag.material.map?.dispose(); flag.material.map = texture; flag.material.needsUpdate = true;
      flag.userData.wave = lastWave = next.wave;
      flag.userData.rank = waveRank(next.wave).name;
    }
    // Redraw only when the stage changes (25, 50, 75, 100), never every wave.
    if (next.statue && statue.userData.stage !== next.statueStage) {
      statue.material.map?.dispose();
      statue.material.map = smoothTexture(paint(c => drawWaveStatue(c, next.statueStage), [48, 64], screenDensity()));
      statue.material.needsUpdate = true;
      statue.userData.stage = next.statueStage;
    }
    for (const {mesh, scale} of trees) mesh.scale.copy(scale).multiplyScalar(next.treeScale);
  }
  return {apply, dispose() {
    if (disposed) return; disposed = true;
    for (const {mesh, scale} of trees) mesh.scale.copy(scale);
    for (const mesh of [flag, statue]) {
      mesh.material.map?.dispose(); mesh.material.dispose(); mesh.geometry.dispose();
    }
    root.removeFromParent(); root.clear();
  }};
}
