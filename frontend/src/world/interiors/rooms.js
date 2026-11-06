// Client-only rooms retain their parent island and the existing story interaction IDs.
export const rooms = {
  cottage: {
    title: 'Keeper’s cottage', objective: 'Look at the writing desk.', palette: 'cottage',
    placeId: 'lighthouse_isle', entrance: {x: -7, z: 5.1, radius: .82}, outside: {x: -7, z: 7},
    spawn: {x: .5, y: .81},
    objects: [
      {kind: 'shelf', x: .11, y: .3, w: .28, h: .14},
      {kind: 'bed', x: .1, y: .5, w: .2, h: .27},
      {kind: 'desk', x: .64, y: .38, w: .24, h: .18},
      {kind: 'stove', x: .82, y: .67, w: .1, h: .13},
    ],
    hotspots: [{id: 'desk', label: 'Writing desk', x: .73, y: .56, radius: .17}],
  },
  boathouse: {
    title: 'The boathouse', objective: 'Inspect the lantern rack.', palette: 'boathouse',
    placeId: 'lighthouse_isle', entrance: {x: -7, z: 17.3, radius: .82}, outside: {x: -7, z: 18.7},
    spawn: {x: .5, y: .81},
    objects: [
      {kind: 'boat', x: .11, y: .36, w: .29, h: .38},
      {kind: 'rack', x: .61, y: .3, w: .27, h: .14},
      {kind: 'barrels', x: .73, y: .65, w: .16, h: .17},
    ],
    hotspots: [{id: 'shore', label: 'Lantern rack', x: .72, y: .48, radius: .18}],
  },
  lighthouse: {
    title: 'Inside the lighthouse', objective: 'Explore the stairs and lamp.', palette: 'lighthouse',
    placeId: 'lighthouse_isle', entrance: {x: 9, z: -5.2, radius: .85}, outside: {x: 9, z: -3.7},
    requiresOpenedDoor: true, spawn: {x: .5, y: .82},
    objects: [
      {kind: 'stairs', x: .1, y: .36, w: .22, h: .36},
      {kind: 'lens', x: .6, y: .33, w: .27, h: .29},
      {kind: 'cabinet', x: .73, y: .73, w: .16, h: .1},
    ],
    hotspots: [{id: 'tower_door', label: 'Stairs and lamp', x: .53, y: .56, radius: .2, resume: true}],
  },
};

export function entranceFor(placeId, player) {
  if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return null;
  for (const [roomId, room] of Object.entries(rooms)) {
    if (room.placeId !== placeId) continue;
    if (Math.hypot(player.x - room.entrance.x, player.z - room.entrance.z) <= room.entrance.radius) {
      return {roomId, placeId, requiresOpenedDoor: !!room.requiresOpenedDoor};
    }
  }
  return null;
}

export function canEnterRoom(roomId, introState) {
  const room = Object.hasOwn(rooms,roomId)?rooms[roomId]:null;
  return !!room && (!room.requiresOpenedDoor || introState?.ended === true ||
    ['stairwell', 'lamp_room'].includes(introState?.scene));
}
