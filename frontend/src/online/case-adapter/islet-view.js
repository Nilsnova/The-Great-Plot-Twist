// L2 display only: this projection never supplies case readiness, positions, jobs or outcomes.
import {readIsletAnswer} from '../../screens/islet/view.js';
import {cardLabels} from '../../screens/islet/labels.js';

const STATION = 'islet_signal_station';
const REMINDER = 'Build your signal station before nightfall: it is your crew’s third light';
const isSeat = value => Number.isInteger(value) && value >= 1 && value <= 4;

function activeOwnCrew(crew) {
  if (crew?.status !== 'active' || !isSeat(crew.mySeat) || !Array.isArray(crew.seats) || crew.seats.length !== 4) return false;
  const numbers = new Set();
  let mine = null;
  for (const seat of crew.seats) {
    if (!seat || !isSeat(seat.seat) || numbers.has(seat.seat) || typeof seat.isYou !== 'boolean'
      || !['player', 'npc', 'open'].includes(seat.kind)) return false;
    numbers.add(seat.seat);
    if (seat.isYou) {
      if (mine || seat.kind !== 'player' || seat.seat !== crew.mySeat) return false;
      mine = seat;
    }
  }
  return mine !== null;
}

export function projectIsletDisplay(snapshot, {signedIn, crew} = {}) {
  const unknown = {station: null, reminder: null};
  if (signedIn !== true || snapshot?.mode !== 'live' || snapshot.status !== 'ready'
    || typeof snapshot.signalStationBuilt !== 'boolean') return unknown;
  // Use the same published-catalogue and station-flag validation as the L2 panel.
  const answer = readIsletAnswer(snapshot);
  if (!answer) return unknown;
  const spot = answer.spots.find(item => item?.plot === STATION);
  if (!spot || spot.type !== 'signal_station' || snapshot.signalStationBuilt !== (spot.state === 'built')) return unknown;
  const source = snapshot.spots.find(item => item?.plot === STATION);
  const built = spot.state === 'built';
  // Accepted readbacks can retain busyPlot until their write finishes. The engine and root UI own
  // that pending guard; neither it nor wallet amounts decide what this server-authorized card says.
  const labels = cardLabels({...spot, retry: source.retry === true, missing: [], level: null, builtAt: null}, {busyPlot: null});
  const caption = built ? labels.badge : [labels.cost, spot.state === 'locked' ? labels.note : null].filter(Boolean).join(' ') || labels.badge;
  return {
    station: {id: STATION, name: spot.name, built, canBuild: labels.button?.disabled === false,
      buildLabel: labels.button?.label ?? null, caption},
    reminder: !built && activeOwnCrew(crew) ? {message: REMINDER, actionLabel: 'Open your islet'} : null,
  };
}
