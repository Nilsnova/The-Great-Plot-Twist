// Memory-only diagnostic ingestion discards account, intent and renderer payloads immediately.
import {on} from '../core/events.js';
import {places} from '../world/places/registry.js';
import {actionForControl} from './ui-actions.js';
import {createUiTrace} from './trace.js';
import {
  browserInfo, formatIntentOutcome, sanitizeAdapterContext, sanitizePerformanceSummary,
} from './context.js';
import {readDiagnosticScreen} from './screen.js';
import {sanitizeProblemReport} from './report-url.js';

const trace = createUiTrace();
let active = false;
let placeId = 'not_started';
let inputType = 'mouse';
let adapterContext = {mode: null, accountState: null};
let performanceSummary = null;
let stops = [];
function clicked(event) {
  const control = event.target?.closest?.('button,a,summary');
  if (!control) return;
  if (control.hasAttribute('data-choice')) {
    trace.record('dialogue_choice');
    return;
  }
  const label = control.getAttribute('aria-label') ?? control.textContent.trim();
  trace.record(actionForControl({label, focus: control.dataset.focus}));
}
function pointed(event) {
  inputType = event.pointerType === 'touch' ? 'touch' : 'mouse';
}
function changed(event) {
  if (event.target?.matches?.('[data-preference]')) trace.record('settings_change');
}
function keyed(event) {
  if (!event.isTrusted || event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
  const action = {KeyE: 'interact', KeyM: 'chart_open', Escape: 'back'}[event.code];
  if (action) trace.record(action);
}
export function startDiagnostics() {
  if (active || !globalThis.document?.addEventListener) return;
  active = true;
  document.addEventListener('click', clicked, true);
  document.addEventListener('pointerdown', pointed, true);
  document.addEventListener('change', changed, true);
  document.addEventListener('keydown', keyed, true);
  stops = [
    on('arrived', event => {
      if (Object.hasOwn(places, event.place)) placeId = event.place;
    }),
    on('app_disposed', disposeDiagnostics),
  ];
}
export function noteUiAction(action) {
  startDiagnostics();
  trace.record(action);
}
export function noteInputType(type) {
  startDiagnostics();
  if (['touch', 'mouse', 'gamepad'].includes(type)) inputType = type;
}
export function noteIntentOutcome(name, result) {
  startDiagnostics();
  trace.record(formatIntentOutcome(name, result));
}
export function noteAdapterView(view) {
  startDiagnostics();
  adapterContext = sanitizeAdapterContext(view);
}
function performanceEnabled() {
  return new URLSearchParams(globalThis.location?.search ?? '').get('perf') === '1';
}
export function notePerformanceSummary(summary) {
  startDiagnostics();
  performanceSummary = performanceEnabled() ? sanitizePerformanceSummary(summary) : null;
}
export function readDiagnostics() {
  return sanitizeProblemReport({
    build: typeof __BUILD_STAMP__ === 'undefined' ? null : __BUILD_STAMP__, placeId,
    screen: readDiagnosticScreen(document), ...adapterContext,
    browser: browserInfo(globalThis.navigator?.userAgent),
    viewport: {width: innerWidth, height: innerHeight}, inputType,
    performance: performanceEnabled() ? performanceSummary : null, actions: trace.read(),
  });
}
export function disposeDiagnostics() {
  if (active) {
    document.removeEventListener('click', clicked, true);
    document.removeEventListener('pointerdown', pointed, true);
    document.removeEventListener('change', changed, true);
    document.removeEventListener('keydown', keyed, true);
  }
  active = false;
  stops.forEach(stop => stop());
  stops = [];
  trace.clear();
  placeId = 'not_started';
  inputType = 'mouse';
  adapterContext = {mode: null, accountState: null};
  performanceSummary = null;
}
if (import.meta.hot) import.meta.hot.dispose(disposeDiagnostics);
