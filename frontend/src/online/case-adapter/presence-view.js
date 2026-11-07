// Pure live-presence display data. Identity translation is supplied by the private controller.
import {kitDisplay, kitArchetype} from '../../adapter/shared/kits.js';

export const ONLINE_EMOTES = ['wave', 'cheer', 'point', 'lantern', 'shrug'];
export const peerFacing = value => ({up: 'back', down: 'front', left: 'left', right: 'right'})[value] ?? 'front';
export const wireFacing = value => ({back: 'up', front: 'down', left: 'left', right: 'right'})[value] ?? 'down';
export const presenceStatus = value => ({connecting: 'reconnecting', slow: 'reconnecting',
  live: 'live', offline: 'offline', off: 'off'})[value] ?? 'off';

const captainName = value => typeof value === 'string' && value.trim() ? value.slice(0, 24) : 'Captain';
const displayKit = value => kitDisplay(value) ?? {id: 'captain', name: 'Captain'};

function crewView({crew, memberSeats, onlineCrew, me, place, opaqueId}) {
  const members = new Map(memberSeats.map(member => [member.seatNo, member.playerId]));
  const online = new Map(onlineCrew.map(member => [member.id, member]));
  return (crew?.seats ?? []).filter(seat => seat.holder !== 'open').slice(0, 4).map(seat => {
    const isYou = seat.isMe === true || seat.seatNo === crew.mySeat;
    const playerId = isYou ? me?.id : members.get(seat.seatNo);
    const seen = online.get(playerId);
    return {id: playerId ? opaqueId(playerId) : `crew-seat-${seat.seatNo}`,
      seat: seat.seatNo, name: captainName(seat.name), kit: kitDisplay(seat.kit),
      online: isYou || !!seen, place: isYou ? place : seen?.place ?? null,
      isPartner: seat.holder === 'partner'};
  });
}

export function projectOnlinePresence({status = 'off', place = null, shown = [], positions = new Map(),
  hiddenCount = 0, onlineCrew = [], memberSeats = [], crew = null, me = null,
  localEmote = null, cooldownUntil = 0, now = 0, opaqueId} = {}) {
  if (status === 'off') return {status, place: null, others: [], hiddenCount: 0, crew: [], sampledAt: now,
    localEmote: null, canEmote: false, cooldown: 0, emotes: []};
  const unique = [...new Map(shown.map(peer => [peer.id, peer])).values()];
  const visible = unique.filter(peer => {
    const sample = positions.get(peer.id);
    return sample && Number.isFinite(sample.x) && Number.isFinite(sample.y);
  }).slice(0, 8);
  const others = visible.map(peer => {
    const sample = positions.get(peer.id), kit = displayKit(peer.kit);
    return {id: opaqueId(peer.id), name: captainName(peer.name), kit, archetype: kitArchetype(kit),
      place, x: sample.x, y: sample.y, facing: peerFacing(sample.facing), moving: sample.moving === true,
      emote: sample.emoteUntil > now && ONLINE_EMOTES.includes(sample.emote) ? sample.emote : null,
      isCrew: peer.crewmate === true, at: sample.at};
  });
  const cooldown = Math.max(0, cooldownUntil - now), canEmote = status === 'live' && cooldown === 0;
  return {status, place, others, hiddenCount: Math.max(0, Math.floor(hiddenCount)) + unique.length - others.length,
    crew: crewView({crew, memberSeats, onlineCrew, me, place, opaqueId}), sampledAt: now,
    localEmote: localEmote?.until > now ? {...localEmote} : null, canEmote, cooldown,
    emotes: ONLINE_EMOTES.map(id => ({id, label: id[0].toUpperCase() + id.slice(1), available: canEmote}))};
}
