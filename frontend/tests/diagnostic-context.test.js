// Coarse diagnostic context is selected from fixed values rather than player or device content.
import {afterEach, describe, it, expect, vi} from 'vitest';
import {
  browserInfo, formatIntentOutcome, sanitizeAdapterContext, sanitizePerformanceSummary, sanitizeScreen,
} from '../src/diagnostics/context.js';

describe('diagnostic context', () => {
  it('keeps only contract intent names and outcomes, without arguments or raw errors', () => {
    expect(formatIntentOutcome('setEmote', {accepted: true, args: ['PRIVATE']})).toBe('setEmote → accepted');
    expect(formatIntentOutcome('setEmote', {accepted: false, reason: 'not_ready'})).toBe('setEmote → not_ready');
    expect(formatIntentOutcome('PRIVATE', {accepted: true})).toBeNull();
    expect(formatIntentOutcome('setEmote', {accepted: false, reason: 'PRIVATE'})).toBeNull();
    expect(formatIntentOutcome('setEmote', {accepted: 'true'})).toBeNull();
  });

  it('validates the screen and adapter fields without retaining account content', () => {
    expect(sanitizeScreen('islet')).toBe('islet');
    expect(sanitizeScreen('PRIVATE')).toBeNull();
    expect(sanitizeAdapterContext({mode: 'online', account: {state: 'expired', name: 'PRIVATE'}}))
      .toEqual({mode: 'online', accountState: 'expired'});
    expect(sanitizeAdapterContext({mode: 'PRIVATE', account: {state: 'PRIVATE'}}))
      .toEqual({mode: null, accountState: null});
  });

  it('extracts only a browser family and integer major version', () => {
    expect(browserInfo('Mozilla Chrome/131.0.0.0 Safari/537.36 PRIVATE'))
      .toEqual({family: 'Chrome', major: 131});
    expect(browserInfo('Mozilla Chrome/131.0.0.0 Edg/130.1 PRIVATE'))
      .toEqual({family: 'Edge', major: 130});
    expect(browserInfo('Mozilla Version/18.2 Safari/605.1.15 PRIVATE'))
      .toEqual({family: 'Safari', major: 18});
    expect(browserInfo('Mozilla Firefox/132.0 PRIVATE')).toEqual({family: 'Firefox', major: 132});
    expect(browserInfo('PRIVATE_DEVICE')).toEqual({family: 'Other', major: null});
  });

  it('retains only bounded finite performance metrics', () => {
    expect(sanitizePerformanceSummary({fps: 60, p95Ms: 16.7, heapBytes: 1024, token: 'PRIVATE'}))
      .toEqual({fps: 60, p95Ms: 16.7, heapBytes: 1024});
    expect(sanitizePerformanceSummary({fps: Infinity, calls: -1, textures: 'PRIVATE'})).toBeNull();
    expect(sanitizePerformanceSummary({triangles: Number.MAX_VALUE}).triangles).toBeLessThan(1e16);
  });
});

// Runtime ingestion must discard private adapter/intent content and gate performance collection.
import {readDiagnosticScreen} from '../src/diagnostics/screen.js';
import {
  disposeDiagnostics, noteAdapterView, noteIntentOutcome, notePerformanceSummary, readDiagnostics,
} from '../src/diagnostics/runtime.js';

function stubRuntime(search = '') {
  vi.stubGlobal('document', {addEventListener() {}, removeEventListener() {}, querySelector() { return null; }});
  vi.stubGlobal('location', {search});
  vi.stubGlobal('navigator', {userAgent: 'Chrome/131.0 PRIVATE_UA'});
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 800);
  vi.stubGlobal('__BUILD_STAMP__', {sha: 'dev', builtAt: null, environment: null});
}

afterEach(() => {
  disposeDiagnostics();
  vi.unstubAllGlobals();
});

describe('diagnostic screen detection', () => {
  it('uses safe selectors and validates shell and case enum values', () => {
    const selectors = new Map([['.shell-screen[open]', {dataset: {mode: 'settings'}}]]);
    const document = {querySelector: selector => selectors.get(selector) ?? null};
    expect(readDiagnosticScreen(document)).toBe('settings');
    selectors.set('.account-modal[open]', {});
    expect(readDiagnosticScreen(document)).toBe('account');
    selectors.clear();
    selectors.set('.case-modal[open] .case-page-picker', {value: 'market'});
    expect(readDiagnosticScreen(document)).toBe('market');
    selectors.set('.case-modal[open] .case-page-picker', {value: 'PRIVATE'});
    expect(readDiagnosticScreen(document)).toBeNull();
  });
});

describe('diagnostic runtime', () => {
  it('accepts intent outcomes in Node without browser globals', () => {
    expect(() => noteIntentOutcome('setEmote', {accepted: true})).not.toThrow();
  });
  it('retains only coarse account/mode fields and contract outcomes', () => {
    stubRuntime();
    noteAdapterView({mode: 'online', account: {state: 'signed_in', captainName: 'PRIVATE_NAME'}});
    noteIntentOutcome('setEmote', {accepted: false, reason: 'not_ready', error: 'PRIVATE_ERROR'});
    const result = readDiagnostics();
    expect(result.mode).toBe('online');
    expect(result.accountState).toBe('signed_in');
    expect(result.actions).toEqual(['setEmote → not_ready']);
    expect(result.browser).toEqual({family: 'Chrome', major: 131});
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });

  it('collects no performance numbers without perf=1', () => {
    stubRuntime('?perf=0&token=PRIVATE');
    notePerformanceSummary({fps: 60, heapBytes: 1024});
    expect(readDiagnostics().performance).toBeNull();
  });

  it('includes only safe performance numbers with perf=1 and clears on disposal', () => {
    stubRuntime('?perf=1&token=PRIVATE');
    notePerformanceSummary({fps: 60, heapBytes: 1024, device: 'PRIVATE'});
    expect(readDiagnostics().performance).toEqual({fps: 60, heapBytes: 1024});
    disposeDiagnostics();
    expect(readDiagnostics().performance).toBeNull();
  });
});
