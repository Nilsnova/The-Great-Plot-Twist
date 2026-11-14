// The host console "Game" section: the new overview counts in plain words, and no panel before the migration.
import { expect, it } from 'vitest';
import { gameLines } from '../src/host/panels.js';
import { browserHarness } from './g20-browser.js';
const evaluate = browserHarness();

const game = {
  islands: { total: 9, createdToday: 2 }, games: { withMembers: 3, maxMembers: 6 },
  waves: { runningNow: 1, finishedToday: 5, bestWave: 14 }, demo: { codeActive: true, guestsToday: 21 },
};

it('lists every new count in plain words', () => {
  expect(Object.fromEntries(gameLines(game))).toEqual({
    Islands:'9', 'Islands opened today (UTC)':'2', 'Games with friends aboard':'3',
    'Most players in one game':'6', 'Waves running now':'1', 'Waves finished today (UTC)':'5',
    'Best wave reached':'14', 'Class code active':'Yes', 'Class guests admitted today (UTC)':'21',
  });
  expect(gameLines(null)).toBeNull();
});
it('shows No for an inactive class code and Unknown for unreadable counts', () => {
  const lines = Object.fromEntries(gameLines({ ...game, islands:{ total:'x' }, demo:{ codeActive:false, guestsToday:-1 } }));
  expect(lines['Class code active']).toBe('No');
  expect(lines.Islands).toBe('Unknown');
  expect(lines['Class guests admitted today (UTC)']).toBe('Unknown');
});
it('draws a Game panel after the overview and none when the server sends no game key', async () => {
  const result = await evaluate(async (game) => {
    const { overviewPanels } = await window.g20Import('/src/host/panels.js');
    const base = { players:1, crews:{ forming:0, active:0, finished:0 }, openPositions:0, realtimeConnections:null,
      build:{ version:'1', commit:'x' }, weather:{ source:'s', origin:'o', fetchedAt:null }, day:'2026-11-13',
      walletToday:[], expectedMigrations:[] };
    const withGame = overviewPanels({ ...base, game }), without = overviewPanels({ ...base, game:null });
    const panel = withGame[1];
    return { order:withGame.map(p => p.dataset.panel || ''), rows:panel.querySelectorAll('dt').length,
      text:panel.textContent, noGame:without.some(p => p.dataset.panel === 'game') };
  }, game);
  expect(result.order.slice(0, 2)).toEqual(['', 'game']);
  expect(result.rows).toBe(9);
  expect(result.text).toContain('Best wave reached');
  expect(result.noGame).toBe(false);
});
