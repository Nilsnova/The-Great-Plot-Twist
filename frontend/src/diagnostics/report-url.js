// Serialize an explicit bounded allowlist, never caller objects or player-written content.
import {places} from '../world/places/registry.js';
import {
  isDiagnosticAction, sanitizeAdapterContext, sanitizeBrowser, sanitizePerformanceSummary, sanitizeScreen,
} from './context.js';

const placeIds = new Set([...Object.keys(places), 'not_started']);
const inputTypes = new Set(['touch', 'mouse', 'gamepad']);
const environments = new Set(['preview', 'production']);
const dimension = value => Number.isFinite(value) && value > 0 ? Math.min(16384, Math.floor(value)) : null;

export function sanitizeBuildIdentity(value) {
  const source = typeof value?.sha === 'string' ? value.sha : '';
  const sha = /^(?:[a-f0-9]{7}|dev)(?:-dirty)?$/i.test(source) ? source.toLowerCase() : 'dev';
  const text = typeof value?.builtAt === 'string' ? value.builtAt : '';
  const format = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const valid = format.test(text) && Number.isFinite(Date.parse(text));
  return {
    sha, builtAt: valid ? new Date(text).toISOString() : null,
    environment: environments.has(value?.environment) ? value.environment : null,
  };
}
export function sanitizeProblemReport(input = {}) {
  const value = input && typeof input === 'object' ? input : {};
  const width = dimension(value.viewport?.width);
  const height = dimension(value.viewport?.height);
  const context = sanitizeAdapterContext({mode: value.mode, account: {state: value.accountState}});
  return {
    build: sanitizeBuildIdentity(value.build), placeId: placeIds.has(value.placeId) ? value.placeId : null,
    screen: sanitizeScreen(value.screen), ...context, browser: sanitizeBrowser(value.browser),
    viewport: width && height ? {width, height} : null,
    inputType: inputTypes.has(value.inputType) ? value.inputType : null,
    performance: sanitizePerformanceSummary(value.performance),
    actions: Array.isArray(value.actions) ? value.actions.filter(isDiagnosticAction).slice(-10) : [],
  };
}
function formatContext(value) {
  const viewport = value.viewport ? `${value.viewport.width} × ${value.viewport.height}` : 'Unavailable';
  const browser = value.browser ? `${value.browser.family} ${value.browser.major ?? ''}`.trim() : 'Unavailable';
  return [
    `Build: ${value.build.sha}`, `Built at: ${value.build.builtAt ?? 'Unavailable'}`,
    `Environment: ${value.build.environment ?? 'Unavailable'}`, `Place: ${value.placeId ?? 'Unavailable'}`,
    `Screen: ${value.screen ?? 'Unavailable'}`, `Mode: ${value.mode ?? 'Unavailable'}`,
    `Account state: ${value.accountState ?? 'Unavailable'}`, `Browser: ${browser}`,
    `Viewport: ${viewport}`, `Input: ${value.inputType ?? 'Unavailable'}`,
  ];
}
export function formatProblemBody(value) {
  const performance = value.performance
    ? Object.entries(value.performance).map(([key, number]) => `${key}: ${number}`).join(', ')
    : 'Unavailable (enable perf=1 to include numbers)';
  return [
    'Check this public report before submitting. Remove any private information.',
    ...formatContext(value), `Performance: ${performance}`, '', 'Last UI actions:',
    ...value.actions.map(action => `- ${action}`), '', '## What happened?', '', '## What you expected', '', '',
  ].join('\n');
}
export function createProblemUrl(input) {
  const value = sanitizeProblemReport(input);
  const url = new URL('https://github.com/Nilsnova/The-Great-Plot-Twist/issues/new');
  const location = value.placeId && value.placeId !== 'not_started' ? value.placeId : value.screen;
  url.searchParams.set('title', `[playtest ${value.build.sha}] ${location ?? 'world'}: `);
  url.searchParams.set('body', formatProblemBody(value));
  while (url.href.length >= 7000 && value.actions.length) {
    value.actions.shift();
    url.searchParams.set('body', formatProblemBody(value));
  }
  return url.href;
}
