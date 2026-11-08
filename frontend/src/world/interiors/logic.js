// Small room movement rules; no story progress, account state or island coordinates change.
export const floor = {left: .07, right: .93, top: .29, bottom: .94};
const radius = .025;
const finite = value => typeof value === 'number' && Number.isFinite(value);

function blocked(x, y, objects) {
  return objects.some(object => x + radius > object.x && x - radius < object.x + object.w &&
    y + radius > object.y && y - radius < object.y + object.h);
}

export function canStandInRoom(x, y, objects = []) {
  return finite(x)&&finite(y)&&x>=floor.left+radius&&x<=floor.right-radius
    &&y>=floor.top+radius&&y<=floor.bottom-radius&&!blocked(x,y,objects);
}

export function moveInRoom(position, vector, delta, objects = [], aspect = 1) {
  if (![position?.x, position?.y, vector?.x, vector?.y, delta, aspect].every(finite)) return {...position};
  const length = Math.hypot(vector.x, vector.y);
  if (!length || delta <= 0) return {...position};
  const distance = Math.min(delta, .05) * .28, scale = Math.max(1, length);
  const dx = vector.x / scale * distance, dy = vector.y / scale * distance * Math.max(.5, Math.min(2, aspect));
  const next = {...position};
  // Axis sliding lets a captain walk along a desk edge without sticking or crossing furniture.
  const x = Math.max(floor.left + radius, Math.min(floor.right - radius, next.x + dx));
  if (!blocked(x, next.y, objects)) next.x = x;
  const y = Math.max(floor.top + radius, Math.min(floor.bottom - radius, next.y + dy));
  if (!blocked(next.x, y, objects)) next.y = y;
  return next;
}

export function nearestHotspot(room, position) {
  let selected = null, distance = Infinity;
  for (const hotspot of room?.hotspots ?? []) {
    const current = Math.hypot(hotspot.x - position.x, hotspot.y - position.y);
    if (current <= hotspot.radius && current < distance) { selected = hotspot; distance = current; }
  }
  return selected;
}

export function atExit(position) {
  return finite(position?.x) && finite(position?.y) && Math.abs(position.x - .5) < .085 && position.y > .905;
}
