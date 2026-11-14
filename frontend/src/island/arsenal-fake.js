// The island arsenal of the fake server (T40, D042): the rules of supabase/migrations/20261114120000_arsenal.sql
// in memory, with the same answers as backend/server/routes/arsenal.py. Used by src/pirates/fake-api.js (the
// dev fake and the tests). Plain objects only, so a shared fake world (two tabs) can store it.
//   createFakeArsenal({world, playerId, ownCode, islandOf, isMember, nameOf, unlockWave, coins, pay, waveRunning, refuse})
//     .state(code) / .buy({weapon, actionUid, code}) / .take({copy, actionUid, code}) / .giveBack({actionUid, code})
import {WEAPONS, WEAPON_BY_ID} from '../pirates/captain-ids.js';

export const CAPACITY = 20;
const UID = /^[A-Za-z0-9_-]{8,64}$/;

export function createFakeArsenal({world, playerId, ownCode, islandOf, isMember, nameOf, unlockWave, coins, pay, waveRunning, refuse}) {
  const shelf = island => {
    world.arsenals ??= {};
    return (world.arsenals[island.code] ??= {next: 1, copies: [], moves: {}});
  };
  const storedOf = rack => rack.copies.filter(copy => copy.holder === null).length;
  const mineOf = rack => rack.copies.find(copy => copy.holder === playerId) ?? null;
  const member = (island, id) => isMember(island, id);
  // A captain who left the game: the copy goes back on the rack while there is room (the SQL sweep).
  function sweep(island, rack) {
    for (const copy of [...rack.copies].sort((a, b) => a.no - b.no)) {
      if (copy.holder !== null && !member(island, copy.holder) && storedOf(rack) < CAPACITY) copy.holder = null;
    }
  }
  function opened(code, action) {
    const island = islandOf(code);
    if (!member(island, playerId)) refuse(403, 'not_member', 'Join this game first: open its link or type its code.');
    const rack = shelf(island);
    if (action !== 'look' && waveRunning(island)) refuse(409, 'wave_running', 'A wave is under way. Use the arsenal between waves.');
    sweep(island, rack);
    return {island, rack};
  }
  const view = (island, rack) => {
    const mine = mineOf(rack), unlock = unlockWave();
    return {code: `ISLE-${island.code}`, capacity: CAPACITY, stored: storedOf(rack), mine: mine?.id ?? null,
      carried: mine?.weapon ?? 'musket', waveRunning: waveRunning(island), coins: coins(), unlockWave: unlock,
      copies: rack.copies.map(copy => ({id: copy.id, no: copy.no, weapon: copy.weapon, name: WEAPON_BY_ID[copy.weapon].name,
        holder: copy.holder, holderName: copy.holder ? nameOf(copy.holder) : null, away: copy.holder !== null && !member(island, copy.holder),
        you: copy.holder === playerId})),
      types: WEAPONS.map(type => ({id: type.id, name: type.name, price: type.price, unlockWave: type.unlockWave, unlocked: type.unlockWave <= unlock}))};
  };
  // A repeated click answers the arsenal as it is now; a click id used for something else is refused.
  function repeat(rack, actionUid, kind) {
    if (!UID.test(String(actionUid))) refuse(422, 'validation_error', 'Send an action id.');
    const done = rack.moves[`${playerId}:${actionUid}`];
    if (done && done !== kind) refuse(409, 'action_used', 'That click was used for something else. Try again.');
    return !!done;
  }
  const record = (rack, actionUid, kind) => { rack.moves[`${playerId}:${actionUid}`] = kind; };
  const fullRack = () => refuse(409, 'arsenal_full', `The arsenal is full: ${CAPACITY} weapons are stored already.`);
  const newId = () => `00000000-0000-4000-8000-${String(world.arsenalSeq = (world.arsenalSeq ?? 0) + 1).padStart(12, '0')}`;

  return {
    state(code = null) { const {island, rack} = opened(code ?? ownCode(), 'look'); return view(island, rack); },
    buy({weapon, actionUid, code = null} = {}) {
      const type = WEAPON_BY_ID[weapon ?? ''];
      if (!type) refuse(400, 'bad_weapon', 'There is no such weapon.');
      if (type.price === 0) refuse(409, 'standard_weapon', 'The musket is standard issue: every captain carries one.');
      if (type.unlockWave > unlockWave()) refuse(409, 'locked', `Opens after wave ${type.unlockWave}.`);
      const {island, rack} = opened(code ?? ownCode(), 'buy');
      if (repeat(rack, actionUid, 'buy')) return view(island, rack);
      const carries = !!mineOf(rack);
      if (carries && storedOf(rack) >= CAPACITY) fullRack();
      if (coins() < type.price) refuse(409, 'insufficient_funds', `The ${type.name.toLowerCase()} costs ${type.price} coins. You need more coins.`);
      pay(type.price);
      rack.copies.push({id: newId(), no: rack.next++, weapon: type.id, holder: carries ? null : playerId});
      record(rack, actionUid, 'buy');
      return view(island, rack);
    },
    take({copy, actionUid, code = null} = {}) {
      const {island, rack} = opened(code ?? ownCode(), 'take');
      if (repeat(rack, actionUid, 'take')) return view(island, rack);
      const wanted = rack.copies.find(item => item.id === copy);
      if (!wanted) refuse(404, 'no_such_copy', 'That weapon is not in this arsenal.');
      if (wanted.holder === playerId) return view(island, rack);
      if (wanted.holder !== null) refuse(409, 'taken', 'Another captain took that weapon just now.');
      const mine = mineOf(rack);
      if (mine) mine.holder = null; // a swap: the carried copy goes back in the same step
      wanted.holder = playerId;
      record(rack, actionUid, 'take');
      return view(island, rack);
    },
    giveBack({actionUid, code = null} = {}) {
      const {island, rack} = opened(code ?? ownCode(), 'return');
      if (repeat(rack, actionUid, 'return')) return view(island, rack);
      const mine = mineOf(rack);
      if (!mine) refuse(409, 'nothing_held', 'You carry only the musket. Take a weapon first.');
      if (storedOf(rack) >= CAPACITY) fullRack();
      mine.holder = null;
      record(rack, actionUid, 'return');
      return view(island, rack);
    },
  };
}
