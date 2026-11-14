// T45: plain text for the Leaderboard card's "This island" panel and crew column.
// Reads only the best won wave the server already sent (campaign.wave); it awards nothing (D046).
// Used by: island/index.js (builds the summary) and island/ui.js (draws the lines).
import {STATUE_STAGES, statueStage, waveRank} from '../art/milestones.js';

const TOP_SHIELD_WAVE = 100; // waveRank: the crowned shield, the last design
const MAX_CREW = 10; // a game holds at most 10 players (routes/games.py)

export function progressSummary(wave) {
  const best = Number.isSafeInteger(wave) && wave >= 0 ? wave : 0;
  const shieldWave = best < 1 ? 1 : (Math.floor(best / 10) + 1) * 10;
  const nextShield = best >= TOP_SHIELD_WAVE ? null : {wave: shieldWave, name: waveRank(shieldWave).name};
  const statue = STATUE_STAGES.find(stage => stage.wave > best);
  return {wave: best, shield: waveRank(best).name, statue: statueStage(best).name, nextShield,
    nextStatue: statue ? {wave: statue.wave, name: statue.name} : null};
}

const title = name => name[0].toUpperCase() + name.slice(1);

export function progressLines(summary) {
  const statue = summary.statue === 'none' ? 'No statue yet' : `${title(summary.statue)} statue`;
  const next = [];
  if (summary.nextShield) next.push(`${title(summary.nextShield.name)} shield at wave ${summary.nextShield.wave}`);
  if (summary.nextStatue) next.push(`${title(summary.nextStatue.name)} statue at wave ${summary.nextStatue.wave}`);
  return {
    headline: `Best wave ${summary.wave}`,
    detail: `${title(summary.shield)} shield · ${statue}`,
    next: next.length ? `Next: ${next.join(' · ')}` : 'Every milestone reached.',
  };
}

// Solo and crews share one ranking; the label only tells them apart. Unknown counts show nothing.
export function crewLabel(crew) {
  if (!Number.isInteger(crew) || crew < 1 || crew > MAX_CREW) return '';
  return crew === 1 ? 'Solo' : `Crew of ${crew}`;
}
