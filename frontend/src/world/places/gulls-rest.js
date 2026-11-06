// Open Gull's Rest loads only after an authorised route reaches it.
import { createSettlement } from './settlement.js';
import { createGullsRestLife } from './gulls-rest-life.js';

const keepsakes = [
  { asset: 'lighthouse-lens', x: -3, z: 4 },
  { asset: 'keepers-star', x: 5, z: 7 },
  { asset: 'lantern', x: -5, z: 9 },
];

function decorate(place, cleanups, ctx) {
  let lanternString;
  place.group.traverse(object => {
    if (object.userData.asset === 'festival-lantern-string') lanternString = object;
  });
  if (lanternString) {
    lanternString.material = lanternString.material.clone();
    lanternString.userData.keepsake = 'festival-lantern-string';
    lanternString.renderOrder = 150;
  }
  for (const item of keepsakes) {
    let mesh;
    place.group.traverse(object => {
      if (object.userData.asset === item.asset && object.userData.ground?.x === item.x && object.userData.ground?.z === item.z) mesh = object;
    });
    if (mesh) {
      mesh.renderOrder = 150 + item.z;
      mesh.userData.keepsake = item.asset;
    }
  }

  const life = createGullsRestLife(place.group, lanternString, {
    reducedMotion: ctx.reducedMotion,
  });
  const update = place.update;
  place.update = (dt, state) => {
    update(dt, state);
    life.update(dt, state?.time);
  };
  cleanups.push(life.dispose);
}

export function createGullsRest(ctx) {
  return createSettlement({
    ...ctx,
    placements: [
      { asset: 'lens-hall-open', x: 0, z: -1, collider: { x: 0, z: -4, width: 7, depth: 5 } },
      { asset: 'festival-lantern-string', x: 0, z: 5 },
      ...keepsakes,
    ],
    decorate(place, art, cleanups) {
      ctx.decorate?.(place, art, cleanups);
      decorate(place, cleanups, ctx);
    },
  });
}
