// The practice ring's starting position, so that every part of the panel shows something:
// a named challenge from Brave Puffin 17 (3 rounds, friendly), an open challenge from
// Captain-7c41d2 (5 rounds, stake 25), a past win (the worked example, 3 to 1, +90 coins) and a
// challenge of the player's that nobody answered in time. Signals nobody has revealed yet are
// drawn from the seeded random, so the same seed always starts the same way.
// Used by: fake-ring.js.
import { ANSWER_HOURS, allValidSequences, resolve } from './logic.js';

export const RIVALS = ['Brave Puffin 17', 'Captain-7c41d2', 'Captain-3fa85f'];
const HOUR = 3600 * 1000;
const WORKED_CHALLENGER = ['flash', 'shade', 'shade', 'mirror', 'shade'];
const WORKED_ANSWERER = ['mirror', 'flash', 'shade', 'shade', 'mirror'];

export const sealedBy = (name, signals, uid = `${name}-seal`) => ({ [name]: { signals, uid } });

// A uniformly chosen sequence that fits the oil of a duel with this many rounds.
export function secretSequence(random, rounds) {
  const sequences = allValidSequences(rounds);
  return sequences[Math.floor(random() * sequences.length)];
}

// The duel records the ring starts with. `me` is the practice captain's name.
export function startingDuels({ now, random, me }) {
  const waiting = (fields, hoursAgo) => ({
    createdAt: now - hoursAgo * HOUR, expiresAt: now + (ANSWER_HOURS - hoursAgo) * HOUR, ...fields,
  });
  const result = resolve(WORKED_CHALLENGER, WORKED_ANSWERER);
  const decidedAt = now - 30 * HOUR;
  return [
    waiting({ challenger: RIVALS[0], opponent: me, rounds: 3, stake: 0, moves: sealedBy(RIVALS[0], secretSequence(random, 3)) }, 1),
    waiting({ challenger: RIVALS[1], isOpen: true, rounds: 5, stake: 25, moves: sealedBy(RIVALS[1], secretSequence(random, 5)) }, 2),
    {
      challenger: RIVALS[2], opponent: me, rounds: 5, stake: 100, status: 'finished', outcome: result.outcome, roundResults: result.roundResults,
      createdAt: decidedAt - HOUR, expiresAt: decidedAt + 23 * HOUR, answeredAt: decidedAt, closedAt: decidedAt,
      moves: { ...sealedBy(RIVALS[2], WORKED_CHALLENGER), ...sealedBy(me, WORKED_ANSWERER) },
    },
    {
      challenger: me, opponent: RIVALS[1], rounds: 3, stake: 10, status: 'expired', createdAt: now - 52 * HOUR,
      expiresAt: now - 28 * HOUR, closedAt: now - 28 * HOUR, moves: sealedBy(me, ['flash', 'shade', 'shade']),
    },
  ];
}
