// The captain's own body fires (owner, 12 Nov): a shot or a cutlass blow no longer draws a second captain
// where it was fired. Your character (src/player/character.js) and a teammate's presence figure
// (src/world/others/) switch to the pose frame in their own lobby colour, facing the shot, for the pose's
// time, then walk on. Drawing only: the sim and the room are unchanged. Plain rules, no DOM or Three.js.
//
//   createPoses({now})            -> {note(events), get(by), clear()}: the poses of the wave's captains
//   poseFrame(pose, colour)       -> the art id for {kind, age} in lobby colour 0-9, or null when over
//   figurePoses(poses, matches)   -> Map(presence figure id -> pose) for the figures of src/pirates/figures.js

// Musket: the firing frame (flash) for `fire` seconds, then the aiming frame; the cutlass blow one frame.
export const POSES = Object.freeze({
  musket: Object.freeze({seconds: .6, fire: .25}),
  cutlass: Object.freeze({seconds: .3}),
});
const COLOURS = 10;
// Every pose frame, for the art lists (painted on first use).
export const POSE_IDS = Object.freeze(Array.from({length: COLOURS}, (_, i) => [`captain-${i + 1}-musket-1`, `captain-${i + 1}-musket-2`, `captain-${i + 1}-cutlass`]).flat());

const finite = value => Number.isFinite(value);
// A wave event -> the pose it starts ({kind, flip}), or null.
export function poseOf(event) {
  if (!event || event.by == null) return null;
  if (event.type === 'captain_fired') {
    if (![event.x, event.z, event.toX, event.toZ].every(finite)) return null;
    const dx = event.toX - event.x, dz = event.toZ - event.z;
    if (dx === 0 && dz === 0) return null;
    // Screen depth is compressed by .72 (world/art.js). The sprite mirrors left shots.
    return {kind: 'musket', flip: dx < 0, angle: Math.atan2(dz * .72, Math.abs(dx))};
  }
  if (event.type === 'captain_struck' && finite(event.x) && finite(event.toX)) return {kind: 'cutlass', flip: event.toX < event.x};
  return null;
}

export function poseFrame(pose, colour) {
  const spec = POSES[pose?.kind];
  if (!spec || !finite(pose.age) || pose.age < 0 || pose.age >= spec.seconds) return null;
  const n = Number.isInteger(colour) && colour >= 0 && colour < COLOURS ? colour + 1 : 1;
  if (pose.kind === 'cutlass') return `captain-${n}-cutlass`;
  return `captain-${n}-musket-${pose.age < spec.fire ? 2 : 1}`;
}

// now(): seconds. One pose per captain (the latest wins); get(by) answers {kind, flip, angle, age} while it lasts.
export function createPoses({now = () => performance.now() / 1000} = {}) {
  const started = new Map();
  return {
    note(events) {
      for (const event of Array.isArray(events) ? events : []) {
        const pose = poseOf(event);
        if (pose) started.set(event.by, {...pose, at: now()});
      }
    },
    get(by) {
      const pose = started.get(by);
      if (!pose) return null;
      const age = now() - pose.at;
      if (age >= POSES[pose.kind].seconds) { started.delete(by); return null; }
      const {at, ...drawing} = pose;
      return {...drawing, age};
    },
    clear() { started.clear(); },
  };
}

// matches: Map(sim captain id -> figure {id, colour}) from matchFigures. A shooter with no figure gets no
// pose at all (its flash, tracer and puff still show): never a second body.
export function figurePoses(poses, matches) {
  const out = new Map();
  for (const [by, figure] of matches ?? []) {
    const pose = poses?.get(by);
    if (pose && figure?.id) out.set(figure.id, pose);
  }
  return out;
}
