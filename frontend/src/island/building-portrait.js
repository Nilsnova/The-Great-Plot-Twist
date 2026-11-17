// Shared real-frame portrait for Move and selected-building controls; no independent thumbnail art.
import {node} from '../ui/kit/dom.js';
import {buildingArt} from './world.js';
import * as textures from '../art/textures.js';
import {wallSurfaceFrame} from '../art/village/walls.js';

function wallSegment(id, level, images) {
  const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 128;
  const context = canvas.getContext('2d'); context.scale(2, 2);
  function face(name, x, y, ax, ay, bx, by) {
    const image = images[wallSurfaceFrame(level, name)];
    context.save(); context.transform(ax / image.width, ay / image.width, bx / image.height, by / image.height, x, y);
    context.drawImage(image, 0, 0); context.restore();
  }
  // The same normalized post and material patches as world wall batches, shown as one short segment.
  face('front', 20, 24, 50, 0, 0, 25); face('side', 70, 24, 8, -7, 0, 25); face('top', 20, 24, 50, 0, 8, -7);
  context.drawImage(images[id], -4, 23, 48, 32); context.drawImage(images[id], 46, 23, 48, 32);
  const components = Object.values(images).map(image => image.villageArt).filter(Boolean);
  if (components.length) canvas.villageArt = {...images[id].villageArt, id, composition: 'wall-segment', components,
    source: components.length === 4 && components.every(source => source.source === 'png') ? 'png' : 'mixed'};
  return canvas;
}

async function sharedPortrait(id) {
  // The approved PNG pipeline prepares sources asynchronously; the pinned procedural baseline has
  // frameCanvas only. Both paths use the renderer's actual frame, never a separate thumbnail.
  const paint = Reflect.get(textures, 'paintIds');
  if (!paint) return textures.frameCanvas(id, 2);
  const wall = /^island-wall(?:-l([1-5]))?$/.exec(id);
  if (wall) {
    const level = Number(wall[1] ?? 1), ids = [id, ...['front', 'top', 'side'].map(face => wallSurfaceFrame(level, face))], images = {};
    await paint(ids, 2, (name, canvas) => { if (canvas) images[name] = canvas; });
    if (ids.some(name => !images[name])) throw new Error('Wall portrait artwork is unavailable.');
    return wallSegment(id, level, images);
  }
  let frame = null;
  await paint([id], 2, (_id, canvas) => { frame = canvas; });
  return frame;
}

export function createBuildingPortrait({className, loadPortrait = sharedPortrait} = {}) {
  const portrait = node('div', className); portrait.setAttribute('aria-hidden', 'true');
  const neutral = () => portrait.replaceChildren(node('span', '', '◇'));
  neutral();
  let requested = '', cachedId = '', cachedFrame = null, selection = 0, disposed = false;
  function showPortrait(value) {
    if (disposed) return;
    const id = value ? buildingArt(value.kind, value.level, value.spec) : null;
    if (id === requested) return;
    requested = id; const token = ++selection; neutral();
    if (!id) return;
    if (id === cachedId) { portrait.replaceChildren(cachedFrame); return; }
    Promise.resolve().then(() => loadPortrait(id)).then(frame => {
      if (token !== selection) return;
      if (!frame) { requested = ''; return; }
      cachedId = id; cachedFrame = frame; portrait.replaceChildren(frame);
    }).catch(() => { if (token === selection) { requested = ''; neutral(); } });
  }
  return {element: portrait, render: showPortrait, dispose() { if (disposed) return; disposed = true; selection++; cachedFrame = null; neutral(); }};
}
