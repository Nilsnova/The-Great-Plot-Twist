import manifest from '../../../backend/content/structure_recovery_v1.json';
import { describe, expect, it } from 'vitest';
import { STRUCTURE_RECOVERY_CONFIG } from '../../src/pirates/structure-recovery-config.js';
import { CONFIG } from '../../src/pirates/sim.js';
import { TOWER_HEALTH } from '../../src/pirates/tower-health.js';

describe('protocol-2 structure recovery configuration', () => {
  it('matches the versioned backend manifest', () => {
    expect(STRUCTURE_RECOVERY_CONFIG.recoveryVersion).toBe(manifest.recoveryVersion);
    expect(STRUCTURE_RECOVERY_CONFIG.waveProtocol).toBe(manifest.waveProtocol);
    expect(STRUCTURE_RECOVERY_CONFIG.fullHpUnits).toBe(manifest.fullHpUnits);
    expect(STRUCTURE_RECOVERY_CONFIG.baseRecoveryMilliseconds).toBe(manifest.baseRecoveryMilliseconds);
    expect(STRUCTURE_RECOVERY_CONFIG.maxHp).toEqual(manifest.structureMaxHp);
    expect(STRUCTURE_RECOVERY_CONFIG.wallSkillMaxHpFactors).toEqual({stone: 2, bastion: 1.5});
    expect(STRUCTURE_RECOVERY_CONFIG.wallResearchMaxHpFactors).toEqual({thick_walls: 1.15});
  });

  it('matches the current simulation wall and tower HP tables', () => {
    expect(STRUCTURE_RECOVERY_CONFIG.maxHp.wall).toEqual(CONFIG.levels.wall.map(item => item.hp));
    for (const [kind, levels] of Object.entries(TOWER_HEALTH.hp)) {
      expect(STRUCTURE_RECOVERY_CONFIG.maxHp[kind]).toEqual(levels);
    }
  });
});
