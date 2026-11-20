// Small scene indicators for damaged structures while the island is in its between-wave/preparation view.
import * as THREE from 'three';
import {getStructureHealthBarModel} from './structure-recovery-model.js';
import {projectPoint} from '../world/art.js';
import {RECOVERY_BADGE, paintRecoveryBadge, recoveryBadgeFill, recoveryBadgeLift, recoveryBadgeTone} from '../art/structure-health-badge.js';

const FULL = 1_000_000;
const KINDS = new Set(['wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel']);
const {width, height, units, fillInset, fillHeight} = RECOVERY_BADGE;

export function structureRecoveryIndicatorRows(state) {
  if (!state || state.displayPhase === 'combat' || !Array.isArray(state.structures)) return [];
  return state.structures.filter(row => row && KINDS.has(row.kind) && Number.isInteger(row.hpUnits)
    && row.hpUnits >= 0 && row.hpUnits < FULL && Number.isFinite(row.maxHP) && row.maxHP > 0);
}

export function createStructureRecoveryIndicators({root, locate = () => null} = {}) {
  const indicators = new Map();
  // Spot -> row for the structures that should show a bar now (damaged, outside combat).
  let shown = new Map(), disposed = false;

  function draw(item) {
    const {row, context, canvas, texture} = item;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const view = getStructureHealthBarModel(row.hpUnits, row.maxHP);
    paintRecoveryBadge(context, view.destroyed);
    if (!view.destroyed) {
      context.fillStyle = RECOVERY_BADGE[recoveryBadgeTone(view.fill)];
      context.fillRect(fillInset, fillInset, recoveryBadgeFill(view.fill), fillHeight);
    }
    texture.needsUpdate = true;
  }

  function add(row) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas); texture.minFilter = THREE.NearestFilter; texture.magFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false});
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width / units, height / units), material);
    mesh.name = `structure-recovery:${row.spot}`; mesh.renderOrder = 500; mesh.frustumCulled = false; mesh.visible = false;
    root.add(mesh);
    const item = {row, canvas, context, texture, material, mesh};
    draw(item); indicators.set(row.spot, item);
    return item;
  }

  function setState(next) {
    if (disposed) return;
    shown = new Map(structureRecoveryIndicatorRows(next).map(row => [row.spot, row]));
    const rows = new Map(shown);
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
      const row = shown.get(spot);
      const point = row ? locate(spot) : null;
      item.mesh.visible = !!row && !!point && Number.isFinite(point.x) && Number.isFinite(point.z);
      if (!item.mesh.visible) continue;
      const ground = projectPoint(point.x, point.z);
      item.mesh.position.set(ground.x, ground.y + recoveryBadgeLift(row.kind), .08);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true; shown = new Map();
    for (const {mesh, texture, material} of indicators.values()) {
      root.remove(mesh); mesh.geometry.dispose(); material.dispose(); texture.dispose();
    }
    indicators.clear();
  }

  return {setState, update, dispose, get size() { return indicators.size; }};
}
