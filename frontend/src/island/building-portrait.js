// Shared real-frame portrait for Move and selected-building controls; no independent thumbnail art.
import {node} from '../ui/kit/dom.js';
import {buildingArt} from './world.js';
import * as textures from '../art/textures.js';

async function sharedPortrait(id) {
  // The approved PNG pipeline prepares sources asynchronously; the pinned procedural baseline has
  // frameCanvas only. Both paths use the renderer's actual frame, never a separate thumbnail.
  const paint = Reflect.get(textures, 'paintIds');
  if (!paint) return textures.frameCanvas(id, 2);
  let frame = null;
  await paint([id], 2, (_id, canvas) => { frame = canvas; });
  return frame;
}

export function createBuildingPortrait({className, loadPortrait = sharedPortrait} = {}) {
  const portrait = node('div', className); portrait.setAttribute('aria-hidden', 'true');
  const neutral = () => portrait.replaceChildren(node('span', '', '◇'));
  neutral();
  let requested = '', cachedId = '', cachedFrame = null, selection = 0;
  function showPortrait(value) {
    const id = value ? buildingArt(value.kind, value.level, value.spec) : null;
    if (id === requested) return;
    requested = id; const token = ++selection; neutral();
    if (!id) return;
    if (id === cachedId) { portrait.replaceChildren(cachedFrame); return; }
    Promise.resolve().then(() => loadPortrait(id)).then(frame => {
      if (token !== selection || !frame) return;
      cachedId = id; cachedFrame = frame; portrait.replaceChildren(frame);
    }).catch(() => { if (token === selection) neutral(); });
  }
  return {element: portrait, render: showPortrait, dispose() { selection++; cachedFrame = null; neutral(); }};
}
