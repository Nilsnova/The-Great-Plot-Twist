// The wave sim's determinism fingerprint (scenarios in sim-fingerprint.js). Every browser of a wave replays it
// identically, so a pure refactor of sim.js (moving code between files) must leave every hash as it was. A
// deliberate gameplay change updates the fixture:
//   UPDATE_SIM_FINGERPRINT=1 npx vitest run tests/pirates/sim-fingerprint.test.js
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allFingerprints } from './sim-fingerprint.js';

const FIXTURE = new URL('./sim-fingerprint.json', import.meta.url);

describe('wave sim determinism fingerprint', () => {
  it('replays every scenario to the recorded hash', () => {
    const got = allFingerprints();
    if (process.env.UPDATE_SIM_FINGERPRINT) writeFileSync(FIXTURE, `${JSON.stringify(got, null, 1)}\n`);
    const want = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    expect(got).toEqual(want);
  }, 600_000);
});
