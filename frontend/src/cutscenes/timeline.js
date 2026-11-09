// Pure cutscene timing: scripts, voice manifest and shots become one list of timed lines.
// No DOM, no audio and no timers here, so Vitest checks every rule without a browser.
const LINE_ID = /^[a-z0-9_]{1,60}$/;
const FILE = /^[a-z0-9_]{1,60}\.(mp3|ogg|m4a|wav)$/;
export const VOICE_TAIL = 0.4; // seconds of quiet after a recorded line before the next one
export const FADE = 0.6;

export function findScript(data, id) {
  const script = data?.scripts?.find(item => item?.id === id);
  if (!script || !Array.isArray(script.lines) || script.lines.length === 0) return null;
  return script;
}

// Accept only {version: 1, lines: {id: {file, seconds}}}; anything else means "no voices yet".
export function normalizeManifest(value) {
  const lines = {};
  if (!value || value.version !== 1 || !value.lines || typeof value.lines !== 'object') return lines;
  for (const [id, entry] of Object.entries(value.lines)) {
    if (!LINE_ID.test(id) || !entry || typeof entry.file !== 'string' || !FILE.test(entry.file)) continue;
    const seconds = Number.isFinite(entry.seconds) && entry.seconds > 0 && entry.seconds < 60 ? entry.seconds : null;
    lines[id] = {file: entry.file, seconds};
  }
  return lines;
}

// Each line lasts its target time, or longer when its recording needs it. Shots name line ranges.
export function buildTimeline(script, voices = {}, shots = []) {
  let start = 0;
  const lines = script.lines.map((line, index) => {
    const voice = voices[line.id] ?? null;
    const target = Number.isFinite(line.seconds) && line.seconds > 0 ? line.seconds : 3;
    const duration = Math.max(target, voice?.seconds ? voice.seconds + VOICE_TAIL : 0);
    const item = {index, id: line.id, text: String(line.text ?? ''), start, end: start + duration, voice};
    start += duration;
    return item;
  });
  const total = start;
  const timedShots = shots.map((shot, index) => {
    const first = lines[Math.min(shot.from ?? 0, lines.length - 1)];
    const last = lines[Math.min(shot.to ?? shot.from ?? 0, lines.length - 1)];
    return {...shot, index, start: first.start, end: index === shots.length - 1 ? total : last.end};
  });
  return {id: script.id, title: script.title ?? '', lines, shots: timedShots, total};
}

export function lineAt(timeline, time) {
  if (time < 0 || time >= timeline.total) return null;
  return timeline.lines.find(line => time >= line.start && time < line.end) ?? null;
}

// Opacity of a shot at a time: fades in and out over FADE seconds, or cuts when motion is reduced.
export function shotOpacity(shot, time, {reduced = false, total = Infinity} = {}) {
  if (time < shot.start || time >= shot.end) return 0;
  if (reduced) return 1;
  const fadeIn = shot.start === 0 ? 1 : Math.min(1, (time - shot.start) / FADE);
  const fadeOut = shot.end >= total ? Math.min(1, (total - time) / FADE) : 1;
  return Math.max(0, Math.min(fadeIn, fadeOut));
}

// 0..1 progress through a shot, used for slow pans; a reduced-motion player holds the first frame.
export function shotProgress(shot, time, {reduced = false} = {}) {
  if (reduced) return 0;
  const length = Math.max(.001, shot.end - shot.start);
  return Math.max(0, Math.min(1, (time - shot.start) / length));
}
