// Issue drafts contain only bounded diagnostic values and leave player descriptions empty.
import {describe, it, expect} from 'vitest';
import {createProblemUrl, sanitizeProblemReport} from '../src/diagnostics/report-url.js';
import {createUiTrace} from '../src/diagnostics/trace.js';
const sample = {
  build: {sha: 'abcdef0-dirty', builtAt: '2026-11-06T16:00:00.000Z', environment: 'preview'},
  placeId: 'lighthouse_isle', screen: 'pause', mode: 'online', accountState: 'signed_in',
  browser: {family: 'Chrome', major: 131}, viewport: {width: 1280, height: 800}, inputType: 'mouse',
  performance: null, actions: ['settings_open', 'setEmote → accepted', 'rerollName → name_reroll_used'],
};

describe('problem reports', () => {
  it('drops planted private fields at every diagnostic boundary', () => {
    const report = sanitizeProblemReport({
      ...sample, playerName: 'PRIVATE_NAME', playerId: 'PRIVATE_ID', token: 'PRIVATE_TOKEN',
      code: 'PRIVATE_CODE', save: {text: 'PRIVATE_SAVE'}, caseState: {secret: 'PRIVATE_CASE'},
      error: 'PRIVATE_ERROR', query: 'PRIVATE_QUERY', deviceId: 'PRIVATE_DEVICE',
      build: {...sample.build, token: 'PRIVATE_NESTED'},
      browser: {...sample.browser, userAgent: 'PRIVATE_UA'},
      viewport: {...sample.viewport, extra: 'PRIVATE_DIMENSION'},
      actions: [...sample.actions, 'setEmote → PRIVATE', 'PRIVATE_ACTION'],
    });
    expect(report).toEqual(sample);
    expect(JSON.stringify(report)).not.toContain('PRIVATE');
  });

  it('drops token-shaped text, crew codes and captain names placed in context', () => {
    const token = [btoa('{"alg":"none"}'), btoa('{"sub":"placeholder"}'), 'not-a-signature'].join('.');
    const input = {
      ...sample, token, crewCode: 'PRIVATE-CREW', captainName: 'Private Captain',
      screen: token, mode: 'PRIVATE-CREW', browser: {family: 'Private Captain', major: token},
      actions: [token, 'PRIVATE-CREW', 'Private Captain'], performance: {fps: token},
    };
    const report = decodeURIComponent(createProblemUrl(input));
    for (const privateText of [token, 'PRIVATE-CREW', 'Private Captain']) {
      expect(report).not.toContain(privateText);
    }
  });

  it('rejects unrecognised context, dimensions, build and environment values', () => {
    const report = sanitizeProblemReport({
      build: {sha: 'private name', builtAt: 'secret', environment: 'PRIVATE'},
      placeId: 'PRIVATE', screen: 'PRIVATE', mode: 'PRIVATE', accountState: 'PRIVATE',
      browser: {family: 'PRIVATE', major: '131'}, inputType: 'PRIVATE',
      viewport: {width: Infinity, height: 'PRIVATE'}, actions: ['PRIVATE'],
    });
    expect(report).toEqual({
      build: {sha: 'dev', builtAt: null, environment: null}, placeId: null, screen: null,
      mode: null, accountState: null, browser: null, viewport: null, inputType: null,
      performance: null, actions: [],
    });
    expect(sanitizeProblemReport({build: {sha: 'dev-dirty'}}).build.sha).toBe('dev-dirty');
    expect(sanitizeProblemReport({build: {sha: 'abcdef0-private'}}).build.sha).toBe('dev');
    expect(sanitizeProblemReport({build: {environment: 'production'}}).build.environment).toBe('production');
  });

  it('creates a bounded draft with public notice, safe title and two empty sections', () => {
    const input = {...sample, title: 'PRIVATE_TITLE', body: 'PRIVATE_BODY'};
    for (let count = 0; count <= 300; count++) {
      const url = new URL(createProblemUrl({...input, actions: Array(count).fill('setEmote → accepted')}));
      expect(url.origin + url.pathname).toBe('https://github.com/Nilsnova/The-Great-Plot-Twist/issues/new');
      expect(url.searchParams.get('title')).toBe('[playtest abcdef0-dirty] lighthouse_isle: ');
      expect(url.searchParams.get('body')).toContain('Screen: pause');
      expect(url.searchParams.get('body')).toContain('Browser: Chrome 131');
      expect(url.searchParams.get('body')).toContain('Check this public report before submitting');
      expect(url.searchParams.get('body')).toContain('## What happened?\n\n## What you expected\n\n');
      expect(url.href).not.toContain('PRIVATE');
      expect(url.href.length).toBeLessThan(7000);
    }
    const url = new URL(createProblemUrl({screen: 'settings'}));
    expect(url.searchParams.get('title')).toBe('[playtest dev] settings: ');
  });

  it('retains only the last ten validated actions and returns copies', () => {
    const trace = createUiTrace();
    for (let index = 0; index < 15; index++) trace.record(index % 2 ? 'setEmote → accepted' : 'resume');
    trace.record('private arbitrary text');
    trace.record('pair → PRIVATE');
    const actions = trace.read();
    expect(actions).toHaveLength(10);
    expect(actions.at(-1)).toBe('resume');
    actions.push('mutation');
    expect(trace.read()).toHaveLength(10);
    trace.clear();
    expect(trace.read()).toEqual([]);
  });
});
