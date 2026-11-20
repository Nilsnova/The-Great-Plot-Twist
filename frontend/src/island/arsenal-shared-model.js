// Shared treasury/copy card rules. Used by arsenal-model; money stays exact decimal/BigInt values.
import {WEAPONS, WEAPON_BY_ID} from '../pirates/captain-ids.js';

const coins = value => `🪙 ${BigInt(value).toLocaleString('en-US')}`;

export function sharedArsenalModel({answer, level, skills, filter, busy, message}, {weaponStats, weaponComparison, rackView}) {
  const mine = answer.copies.find(copy => copy.id === answer.mine), carried = mine?.weapon ?? 'musket';
  const full = answer.total >= answer.capacity, closed = answer.waveRunning ? 'A wave is reserved. Use the arsenal between waves.' : '';
  const view = rackView(answer.copies, filter), type = WEAPON_BY_ID[carried];
  const rack = view.copies.map(copy => {
    const row = {id: copy.id, weapon: copy.weapon, label: `${WEAPON_BY_ID[copy.weapon].name} #${copy.no}`,
      stats: weaponStats(copy.weapon, level, skills), comparison: weaponComparison(copy.weapon, carried, level, skills), holder: '', button: null};
    if (copy.pendingReturnWaveId) row.holder = 'Pending return after this wave.';
    else if (copy.you) row.holder = copy.disconnectedUntil ? 'Your copy is reserved during reconnect grace.' : 'You carry it';
    else if (copy.holder) row.holder = `Carried by ${copy.holderName ?? 'a captain'}${copy.disconnectedUntil ? ' (reconnecting)' : ''}`;
    else row.button = {label: busy === copy.id ? 'Taking…' : mine ? 'Swap' : 'Take', disabled: !!closed || busy !== null, reason: closed};
    return row;
  });
  const available = BigInt(answer.economy.treasury.availableCoins);
  const shop = WEAPONS.filter(type => type.price > 0).map(type => {
    const sent = answer.types.find(item => item.id === type.id), price = sent?.priceCoins;
    const comparison = weaponComparison(type.id, carried, level, skills);
    const reason = !sent ? 'Refresh the arsenal to see this weapon.' : !sent.unlocked ? `Opens after wave ${sent.unlockWave}.`
      : closed || (full ? 'The island owns its full weapon inventory.' : available < BigInt(price) ? 'The island has too few available coins.' : '');
    return {id: type.id, name: type.name, line: type.line, mode: comparison.mode, price, priceText: price ? coins(price) : '',
      stats: weaponStats(type.id, level, skills), comparison, locked: !sent?.unlocked,
      button: {label: busy === `buy:${type.id}` ? 'Buying…' : price ? `Buy · ${coins(price)}` : 'Refresh', disabled: !!reason || busy !== null, reason}};
  });
  const filters = [['all', 'All'], ['available', 'Available'], ['carried', 'Carried']]
    .map(([id, label]) => ({id, label, count: view.counts[id], selected: id === view.filter}));
  const groups = WEAPONS.map(type => ({id: type.id, name: type.name, rows: rack.filter(row => row.weapon === type.id)})).filter(group => group.rows.length);
  return {title: 'Arsenal', lead: 'The island owns these weapons. Take one or return it for a crewmate. Every captain always has a free musket.',
    stock: `Weapons: ${answer.total} of ${answer.capacity} · ${answer.stored} stored${full ? ' · Full' : ''}`, full,
    carry: {name: mine ? `${type.name} #${mine.no}` : 'Musket (standard issue)', stats: weaponStats(carried, level, skills), line: type.line},
    back: mine ? {label: busy === 'return' ? 'Returning…' : 'Return to the rack', disabled: !!closed || busy !== null, reason: closed} : null,
    rack, filters, groups, filter: view.filter, empty: view.filter === 'available' ? 'No weapons are available on the rack.' : 'No weapons in this view.',
    shop, shopTitle: 'Buy for the crew (island treasury)', message, coins: `Island available: ${coins(answer.economy.treasury.availableCoins)}`};
}
