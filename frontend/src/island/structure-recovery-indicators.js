// Small scene indicators for damaged structures while the island is in its between-wave/preparation view.
import * as THREE from 'three';
import {getStructureHealthBarModel} from './structure-recovery-model.js';
import {projectPoint} from '../world/art.js';

const FULL = 1_000_000;
const KINDS = new Set(['wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel']);
const BAR_WIDTH = 32, BAR_HEIGHT = 10, UNIT = 16;
const COLORS = {green: '#54b96a', gold: '#efc84c', red: '#d65343'};

export function structureRecoveryIndicatorRows(state) {
  if (!state || state.displayPhase === 'combat' || !Array.isArray(state.structures)) return [];
  return state.structures.filter(row => row && KINDS.has(row.kind) && Number.isInteger(row.hpUnits)
    && row.hpUnits >= 0 && row.hpUnits < FULL && Number.isFinite(row.maxHP) && row.maxHP > 0);
}

export function createStructureRecoveryIndicators({root, locate = () => null} = {}) {
  const indicators = new Map();
  let state = null, disposed = false;

  function draw(item) {
    const {row, context, canvas, texture} = item;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#18241e'; context.fillRect(0, 0, BAR_WIDTH, BAR_HEIGHT);
    context.strokeStyle = '#455247'; context.lineWidth = 1; context.strokeRect(.5, .5, BAR_WIDTH - 1, BAR_HEIGHT - 1);
    const view = getStructureHealthBarModel(row.hpUnits, row.maxHP);
    const innerWidth = BAR_WIDTH - 2;
    const fillWidth = row.hpUnits > 0 ? Math.max(1, Math.round(view.fill * innerWidth)) : 0;
    if (fillWidth) {
      context.fillStyle = COLORS[view.color]; context.fillRect(1, 1, Math.min(innerWidth, fillWidth), BAR_HEIGHT - 2);
    }
    if (view.destroyed) {
      context.fillStyle = '#fff4d5'; context.font = 'bold 8px monospace'; context.textAlign = 'right';
      context.textBaseline = 'middle'; context.fillText('!', BAR_WIDTH - 2, BAR_HEIGHT / 2);
    }
    texture.needsUpdate = true;
  }

  function add(row) {
    const canvas = document.createElement('canvas'); canvas.width = BAR_WIDTH; canvas.height = BAR_HEIGHT;
    const context = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas); texture.minFilter = THREE.NearestFilter; texture.magFilter = THREE.NearestFilter;
    const material = new THREE.MeshBasicMaterial({map: texture, transparent: true, depthTest: false, depthWrite: false});
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(BAR_WIDTH / UNIT, BAR_HEIGHT / UNIT), material);
    mesh.name = `structure-recovery:${row.spot}`; mesh.renderOrder = 500; mesh.frustumCulled = false; mesh.visible = false;
    root.add(mesh);
    const item = {row, canvas, context, texture, material, mesh};
    draw(item); indicators.set(row.spot, item);
    return item;
  }

  function setState(next) {
    if (disposed) return;
    state = next && structureRecoveryIndicatorRows(next).length ? next : null;
    const rows = new Map(structureRecoveryIndicatorRows(state).map(row => [row.spot, row]));
    for (const [spot, item] of indicators) {
      const row = rows.get(spot);
      if (!row) { item.mesh.visible = false; continue; }
      if (item.row.hpUnits !== row.hpUnits || item.row.maxHP !== row.maxHP || item.row.kind !== row.kind) {
        item.row = row; draw(item);
      }
      rows.delete(spot);
    }
    for (const row of rows.values()) add(row);
  }

  function update() {
    if (disposed) return;
    for (const [spot, item] of indicators) {
      const row = state?.structures?.find(entry => entry.spot === spot);
      const point = row ? locate(spot) : null;
      item.mesh.visible = !!row && !!point && Number.isFinite(point.x) && Number.isFinite(point.z);
      if (!item.mesh.visible) continue;
      const ground = projectPoint(point.x, point.z);
      const lift = row.kind === 'wall' ? 2.2 : 4.0;
      item.mesh.position.set(ground.x, ground.y + lift, .08);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true; state = null;
    for (const {mesh, texture, material} of indicators.values()) {
      root.remove(mesh); mesh.geometry.dispose(); material.dispose(); texture.dispose();
    }
    indicators.clear();
  }

  return {setState, update, dispose, get size() { return indicators.size; }};
}
