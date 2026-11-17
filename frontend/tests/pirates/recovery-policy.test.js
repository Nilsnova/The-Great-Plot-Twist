import { describe, expect, it } from 'vitest';
import { canFreeStructureRepair, readRecoveryPolicy } from '../../src/pirates/recovery-policy.js';

describe('versioned structure recovery policy', () => {
  it('keeps omitted metadata on the complete legacy behavior', () => {
    const policy = readRecoveryPolicy();
    expect(policy).toBe('legacy');
    expect(canFreeStructureRepair(policy)).toBe(true);
  });

  it('recognizes only the approved recovery v1 / wave protocol 2 pair', () => {
    const policy = readRecoveryPolicy({ recoveryVersion: 1, waveProtocol: 2 });
    expect(policy).toBe('structure-recovery-v1');
    expect(canFreeStructureRepair(policy)).toBe(false);
  });

  it('rejects mismatched or unknown versions instead of guessing behavior', () => {
    expect(readRecoveryPolicy({ recoveryVersion: 1, waveProtocol: 1 })).toBeNull();
    expect(readRecoveryPolicy({ recoveryVersion: 0, waveProtocol: 2 })).toBeNull();
    expect(readRecoveryPolicy({ recoveryVersion: 2, waveProtocol: 3 })).toBeNull();
  });
});
