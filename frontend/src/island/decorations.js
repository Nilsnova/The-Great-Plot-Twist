// T5: reads existing island progress and draws cosmetic milestones; T45 adds the statue stages.
// Used by world.js.
import * as THREE from 'three';
import {paint} from '../art/paint.js';
import {STATUE_STAGES, statueStage, waveRank} from '../art/milestones.js';
import {paintIds, screenDensity, smoothTexture, spriteMaterial} from '../art/textures.js';
import {projectGround} from '../world/projection.js';

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
  const foot = projectGround(x, z); mesh.name = name; mesh.position.set(foot.x, foot.y, 0);
  mesh.userData.ground = {x, z};
  mesh.renderOrder = 100 + z; mesh.frustumCulled = false; mesh.visible = false;
  root.add(mesh); return mesh;
}

const IDS = ['island_record', ...[1, 2, 3, 4].map(stage => `island_statue_${stage}`)];
function recordArt(c, canvas, wave) {
  c.drawImage(canvas, 0, 0, 40, 48);
  c.fillStyle = '#fff2ce'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = 'bold 3.2px sans-serif'; c.fillText('BEST WAVE', 20, 18);
  c.font = `bold ${wave >= 1000 ? 7 : 9}px sans-serif`; c.fillText(String(wave), 20, 24);
  c.font = 'bold 2.8px sans-serif'; c.fillText(waveRank(wave).name.toUpperCase(), 20, 29);
}
function statueArt(c, canvas, stage) {
  c.drawImage(canvas, 0, 0, 40, 56);
  c.fillStyle = '#382414'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = 'bold 3.6px sans-serif'; c.fillText(String(STATUE_STAGES[stage - 1].wave), 20, 47.7);
}
export function decorateProgress(place, {prepare = paintIds, density = screenDensity()} = {}) {
  const root = new THREE.Group(); root.name = 'island-progress'; place.group.add(root);
  const flag = milestone(root, 'island-best-wave', 40, 48, -3.5, 2.5);
  const statue = milestone(root, 'island-wave-25', 40, 56, 4, 5.5);
  const trees = [];
  place.group.traverse(mesh => {
    if (['oak', 'pine', 'birch'].includes(mesh.userData.asset)) trees.push({mesh, scale: mesh.scale.clone()});
  });
  let lastWave = null, disposed = false, art = null, pending = null, latest = null;
  function apply(campaign, spots, known) {
    if (disposed) return;
    latest = {campaign, spots, known};
    const next = decorationState(campaign, spots);
    flag.visible = known && !!art; statue.visible = known && next.statue && !!art;
    flag.userData.wave = next.wave; flag.userData.rank = waveRank(next.wave).name;
    if (!known) return;
    if (art && next.wave !== lastWave) {
      const texture = smoothTexture(paint(c => recordArt(c, art.island_record, next.wave), [40, 48], density, {outline: 0}));
      flag.material.map?.dispose(); flag.material.map = texture; flag.material.needsUpdate = true;
      lastWave = next.wave;
    }
    // Redraw only when the stage changes (25, 50, 75, 100), never every wave.
    if (art && next.statue && statue.userData.stage !== next.statueStage) {
      statue.material.map?.dispose();
      statue.material.map = smoothTexture(paint(c => statueArt(c, art[`island_statue_${next.statueStage}`], next.statueStage), [40, 56], density, {outline: 0}));
      statue.material.needsUpdate = true;
      statue.userData.stage = next.statueStage;
    }
    for (const {mesh, scale} of trees) mesh.scale.copy(scale).multiplyScalar(next.treeScale);
  }
  function retryArt() {
    if (disposed || art) return Promise.resolve();
    if (pending) return pending;
    const prepared = {};
    pending = Promise.resolve().then(() => prepare(IDS, density, (id, canvas) => {
      if (!canvas || !IDS.includes(id)) throw new Error('Progress artwork could not be prepared.');
      prepared[id] = canvas;
    })).then(() => {
      if (IDS.some(id => !prepared[id])) throw new Error('Progress artwork is not registered.');
      if (disposed) return;
      art = prepared;
      if (latest) apply(latest.campaign, latest.spots, latest.known);
    }).finally(() => { pending = null; });
    return pending;
  }
  return {apply, retryArt, dispose() {
    if (disposed) return; disposed = true;
    for (const {mesh, scale} of trees) mesh.scale.copy(scale);
    for (const mesh of [flag, statue]) {
      mesh.material.map?.dispose(); mesh.material.dispose(); mesh.geometry.dispose();
    }
    art = latest = null; root.removeFromParent(); root.clear();
  }};
}
