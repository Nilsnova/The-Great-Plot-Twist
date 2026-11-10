// Only coarse, bounded context and contract vocabulary may enter an issue draft.
import {adapterMethods} from '../adapter/contract.js';
import {adapterReasons} from '../adapter/reasons.js';
import {allowedUiActions} from './ui-actions.js';

export const diagnosticScreens = Object.freeze([
  'title', 'pause', 'settings', 'credits', 'account', 'intro', 'chart',
  'islet', 'market', 'predictions', 'duels', 'cinematic', 'world', 'loading',
]);
const screens = new Set(diagnosticScreens);
const methods = new Set(adapterMethods);
const reasons = new Set(adapterReasons);
const modes = new Set(['online', 'unavailable', 'local']);
const accountStates = new Set(['signed_out', 'signing_in', 'signed_in', 'expired', 'error']);
const browserFamilies = new Set(['Chrome', 'Firefox', 'Safari', 'Edge', 'Other']);
const performanceKeys = ['fps', 'p95Ms', 'calls', 'triangles', 'geometries', 'textures', 'heapBytes'];

export const sanitizeScreen = value => screens.has(value) ? value : null;
export function sanitizeAdapterContext(view) {
  return {
    mode: modes.has(view?.mode) ? view.mode : null,
    accountState: accountStates.has(view?.account?.state) ? view.account.state : null,
  };
}
export function formatIntentOutcome(name, result) {
  if (!methods.has(name)) return null;
  if (result?.accepted === true) return `${name} → accepted`;
  if (result?.accepted === false && reasons.has(result.reason)) return `${name} → ${result.reason}`;
  return null;
}
export function isDiagnosticAction(value) {
  if (allowedUiActions.has(value)) return true;
  if (typeof value !== 'string' || value.length > 100) return false;
  const parts = value.split(' → ');
  if (parts.length !== 2) return false;
  const [name, outcome] = parts;
  return methods.has(name) && (outcome === 'accepted' || reasons.has(outcome));
}
export function sanitizeBrowser(value) {
  if (!browserFamilies.has(value?.family)) return null;
  const major = Number.isInteger(value.major) && value.major > 0 && value.major <= 9999 ? value.major : null;
  return {family: value.family, major};
}
export function browserInfo(userAgent) {
  const text = typeof userAgent === 'string' ? userAgent.slice(0, 2048) : '';
  const patterns = [
    ['Edge', /(?:Edg|EdgA|EdgiOS)\/(\d+)/], ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+)/], ['Safari', /Version\/(\d+).*Safari\//],
  ];
  for (const [family, pattern] of patterns) {
    const match = text.match(pattern);
    if (match) return sanitizeBrowser({family, major: Number(match[1])});
  }
  return {family: 'Other', major: null};
}
export function sanitizePerformanceSummary(value) {
  if (!value || typeof value !== 'object') return null;
  const summary = {};
  for (const key of performanceKeys) {
    const number = value[key];
    if (Number.isFinite(number) && number >= 0) summary[key] = Math.min(1e15, number);
  }
  return Object.keys(summary).length ? summary : null;
}
