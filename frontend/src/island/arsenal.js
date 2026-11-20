// The arsenal building's controller (T41, D042): the island on screen's arsenal answer, its card and the
// weapon your captain carries there. index.js makes one and calls it; the server decides every move.
//   const arsenal = createArsenal({api, ui, emit, enabled, code, level, onCoins, asking});
// asking() is called as a read or move is sent and gives a check that onCoins(coins, fresh) gets with the
// answer's coins: fresh() is false when a newer island answer has been shown meanwhile.
//   arsenal.open()       the card (walk up and press E, or tap: index.js pick)
//   arsenal.refresh()    read the arsenal of the island on screen again (landing, before a wave, a crewmate's move)
//   arsenal.weapon()     what you shoot with here: the copy you carry, else 'musket'; null while the flag is off
//   arsenal.redraw()     draw the open card again
// After a move it emits island_spots_changed {place, spot: 'island_arsenal'}, so the wave wiring tells the
// room and every crewmate reads the arsenal again (a copy taken here is shown as taken there).
import {arsenalModel} from './arsenal-model.js';
import {readWeapon, WEAPON_BY_ID} from '../pirates/captain-ids.js';
import {ARSENAL} from './spots.js';
import {arsenalOrigin, isArsenalEconomy, isArsenalLegacyContext, readSharedArsenal, sameArsenalOrigin} from './arsenal-shared-state.js';

const REFRESH_ON = new Set(['taken', 'arsenal_full', 'no_such_copy', 'wave_running', 'insufficient_funds', 'locked', 'nothing_held', 'action_used', 'stale_holder', 'economy_epoch_mismatch']);
const nameOf = (data, id) => { const copy = data.copies.find(item => item.id === id); return copy ? `${WEAPON_BY_ID[copy.weapon].name} #${copy.no}` : 'The weapon'; };

// Only an exact duplicate READ may avoid invalidating otherwise coherent construction quotes.
const redundantSharedRead = (before, next, known) => readSharedArsenal(before) && isArsenalEconomy(known)
  && sameArsenalOrigin(before.economy, next.economy) && sameArsenalOrigin(known, next.economy)
  && before.arsenalRevision === next.arsenalRevision && known.revision === next.economy.revision
  && ['balanceCoins', 'committedCoins', 'availableCoins'].every(key => known.treasury[key] === next.economy.treasury[key])
  && JSON.stringify({...before, economy: null}) === JSON.stringify({...next, economy: null});

export function createArsenal(options = {}) {
  const {api, ui, emit = () => {}, enabled = () => false, readEnabled = enabled, code = () => null, place = () => 'own',
    level = () => 1, skills = () => [], onCoins = () => {}, asking = () => () => true,
    getEconomy, getActorId = () => null, onEconomy = () => {}} = options;
  const legacyFactory = !('getEconomy' in options);
  const selectedEconomy = () => typeof getEconomy === 'function' ? getEconomy() : null;
  let answer = null, answeredFor = null, busy = null, message = '', loading = false, ticket = 0, rackFilter = 'all';
  // loadFailed: the message is the arsenal's own read failing (a later good read clears it). A refused move's
  // reason stays until the card opens again or the next move, also through a crewmate's change (island_changed).
  let loadFailed = false;
  const key = () => JSON.stringify([getActorId(), code() ?? 'own', arsenalOrigin(selectedEconomy())]);
  const current = () => (answer && answeredFor === key() ? answer : null);
  const model = () => arsenalModel({answer: current(), level: level(), skills: skills(), filter: rackFilter, busy, message, loading: loading && !current()});
  const copyIntent = id => ({copy: id, holderGeneration: current()?.copies.find(copy => copy.id === id)?.holderGeneration, code: code()});
  const handlers = {take: id => void move(id, () => api.take(copyIntent(id)), took(id)),
    giveBack: () => void move('return', () => api.giveBack(copyIntent(current()?.mine)), data => `${nameOf(answer ?? data, current()?.mine)} is back on the rack. You carry the musket.`),
    buy: id => void move(`buy:${id}`, () => api.buy({weapon: id, code: code()}), bought(id)),
    retry: () => { if (!loading) { message = ''; loadFailed = false; void refresh(); } },
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
  function take(data, fresh, expectedOrigin, readOnly = false) {
    if (readSharedArsenal(data)) {
      if (expectedOrigin && !sameArsenalOrigin(data.economy, expectedOrigin)) return false;
      if (readSharedArsenal(current()) && sameArsenalOrigin(current().economy, data.economy)
        && BigInt(data.arsenalRevision) < BigInt(current().arsenalRevision)) return false;
      if (!readOnly || !redundantSharedRead(current(), data, selectedEconomy()))
        onEconomy(data.economy, expectedOrigin ?? arsenalOrigin(data.economy));
      const known = selectedEconomy();
      answer = sameArsenalOrigin(known, data.economy) && BigInt(known.revision) >= BigInt(data.economy.revision)
        ? {...data, economy: known} : data;
    } else {
      if (!legacyFactory && !isArsenalLegacyContext(selectedEconomy())) return false;
      answer = data; onCoins(data.coins, fresh);
    }
    answeredFor = key();
    return true;
  }
  async function refresh() {
    if (!readEnabled()) { answer = null; answeredFor = null; return null; }
    const mine = ++ticket, asked = key(), fresh = asking();
    loading = true; redraw();
    const result = await api.state(code());
    if (mine !== ticket) return result;
    loading = false;
    if (asked !== key() || !readEnabled()) return result;
    if (result.ok) { if (enabled()) take(result.data, fresh, result.expectedOrigin, true); if (loadFailed) { message = ''; loadFailed = false; } }
    else if (!result.ok && !current()) { message = result.message; loadFailed = true; }
    redraw();
    return result;
  }
  async function move(kind, send, success) {
    if (busy || !enabled()) return;
    const economy = selectedEconomy();
    if (!legacyFactory && !isArsenalLegacyContext(economy) && !isArsenalEconomy(economy)) {
      message = 'Wait for your island to load and try again.'; redraw(); return;
    }
    const asked = key();
    busy = kind; message = ''; loadFailed = false; redraw();
    const before = answer, fresh = asking(), result = await send();
    busy = null;
    // A completed server move stays valid, but its answer must not become another island's inventory.
    if (asked !== key() || !enabled()) { redraw(); return; }
    if (result.ok) {
      const shared = !!result.receipt;
      const text = shared ? (result.repeat ? 'Your previous arsenal action is confirmed.' : 'Your arsenal action is confirmed.') : success(result.data);
      if (result.data && !take(result.data, fresh, result.expectedOrigin)) { redraw(); return; }
      if (!result.data) { answer = null; answeredFor = null; await refresh(); }
      if (asked !== key() || !enabled()) { redraw(); return; }
      emit({type: 'island_spots_changed', place: place(), spot: ARSENAL.id});
      if (current()) emit({type: 'arsenal_changed', carried: readWeapon(current().carried)});
      ui.toast(text, 'success');
    } else {
      answer = before;
      if (REFRESH_ON.has(result.code)) await refresh();
      if (asked !== key() || !enabled()) return;
      message = result.message; loadFailed = false;
    }
    redraw();
  }
  return {
    open() { message = ''; loadFailed = false; loading = true; ui.arsenalCard(model(), handlers); void refresh(); },
    refresh, redraw,
    weapon() {
      if (!enabled()) return null;
      return readWeapon(current()?.carried);
    },
    get answer() { return current() ? structuredClone(current()) : null; },
    get handlers() { return handlers; },
  };
}
