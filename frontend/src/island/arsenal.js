// The arsenal building's controller (T41, D042): the island on screen's arsenal answer, its card and the
// weapon your captain carries there. index.js makes one and calls it; the server decides every move.
//   const arsenal = createArsenal({api, ui, emit, enabled, code, level, onCoins});
//   arsenal.open()       the card (walk up and press E, or tap: index.js pick)
//   arsenal.refresh()    read the arsenal of the island on screen again (landing, before a wave, a crewmate's move)
//   arsenal.weapon()     what you shoot with here: the copy you carry, else 'musket'; null while the flag is off
//   arsenal.redraw()     draw the open card again
// After a move it emits island_spots_changed {place, spot: 'island_arsenal'}, so the wave wiring tells the
// room and every crewmate reads the arsenal again (a copy taken here is shown as taken there).
import {arsenalModel} from './arsenal-model.js';
import {readWeapon, WEAPON_BY_ID} from '../pirates/captain-ids.js';
import {ARSENAL} from './spots.js';

const REFRESH_ON = new Set(['taken', 'arsenal_full', 'no_such_copy', 'wave_running', 'insufficient_funds', 'locked', 'nothing_held', 'action_used']);
const nameOf = (data, id) => { const copy = data.copies.find(item => item.id === id); return copy ? `${WEAPON_BY_ID[copy.weapon].name} #${copy.no}` : 'The weapon'; };

export function createArsenal({api, ui, emit = () => {}, enabled = () => false, code = () => null, place = () => 'own',
  level = () => 1, onCoins = () => {}} = {}) {
  let answer = null, answeredFor = null, busy = null, message = '', loading = false, ticket = 0, rackFilter = 'all';
  // loadFailed: the message is the arsenal's own read failing (a later good read clears it). A refused move's
  // reason stays until the card opens again or the next move, also through a crewmate's change (island_changed).
  let loadFailed = false;
  const key = () => code() ?? 'own';
  const current = () => (answer && answeredFor === key() ? answer : null);
  const model = () => arsenalModel({answer: current(), level: level(), filter: rackFilter, busy, message, loading: loading && !current()});
  const handlers = {take: id => void move(id, () => api.take({copy: id, code: code()}), took(id)),
    giveBack: () => void move('return', () => api.giveBack({code: code()}), data => `${nameOf(answer ?? data, current()?.mine)} is back on the rack. You carry the musket.`),
    buy: id => void move(`buy:${id}`, () => api.buy({weapon: id, code: code()}), bought(id)),
    filter: id => { if (['all', 'available', 'carried'].includes(id)) { rackFilter = id; redraw(); } }};
  function took(id) {
    return data => (data.mine === id && answer?.mine && answer.mine !== id ? `Swapped: you carry ${nameOf(data, id)} now.` : `You carry ${nameOf(data, id)} now.`);
  }
  function bought(id) {
    return data => {
      const newest = data.copies.filter(copy => copy.weapon === id).sort((a, b) => b.no - a.no)[0];
      return newest?.you ? `${WEAPON_BY_ID[id].name} #${newest.no} bought: you carry it now.` : `${WEAPON_BY_ID[id].name} #${newest?.no ?? '?'} bought and stored on the rack.`;
    };
  }
  function redraw() { if (ui.open === 'arsenal') ui.arsenalCard(model(), handlers); }
  function take(data) { answer = data; answeredFor = key(); onCoins(data.coins); }
  async function refresh() {
    if (!enabled()) { answer = null; answeredFor = null; return null; }
    const mine = ++ticket, asked = key();
    loading = true; redraw();
    const result = await api.state(code());
    if (mine !== ticket) return result;
    loading = false;
    if (result.ok && asked === key()) { take(result.data); if (loadFailed) { message = ''; loadFailed = false; } }
    else if (!result.ok && !current()) { message = result.message; loadFailed = true; }
    redraw();
    return result;
  }
  async function move(kind, send, success) {
    if (busy || !enabled()) return;
    busy = kind; message = ''; loadFailed = false; redraw();
    const before = answer, result = await send();
    busy = null;
    if (result.ok) {
      const text = success(result.data); take(result.data);
      emit({type: 'island_spots_changed', place: place(), spot: ARSENAL.id});
      emit({type: 'arsenal_changed', carried: readWeapon(result.data.carried)});
      ui.toast(text, 'success');
    } else {
      answer = before;
      if (REFRESH_ON.has(result.code)) await refresh();
      message = result.message; loadFailed = false;
    }
    redraw();
  }
  return {
    open() { message = ''; loadFailed = false; ui.arsenalCard(model(), handlers); void refresh(); },
    refresh, redraw,
    weapon() {
      if (!enabled()) return null;
      return readWeapon(current()?.carried);
    },
    get answer() { return current() ? structuredClone(current()) : null; },
    get handlers() { return handlers; },
  };
}
