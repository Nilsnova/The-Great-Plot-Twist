// Versioned base HP values for persistent structure recovery. Keep in parity with
// backend/content/structure_recovery_v1.json. Used by future protocol-2 snapshots.
export const STRUCTURE_RECOVERY_CONFIG = Object.freeze({
  recoveryVersion: 1,
  waveProtocol: 2,
  fullHpUnits: 1_000_000,
  baseRecoveryMilliseconds: 600_000,
  maxHp: Object.freeze({
    wall: Object.freeze([60, 120, 200, 300, 420]),
    cannon: Object.freeze([80, 130, 200, 290, 400]),
    mortar: Object.freeze([70, 115, 180, 260, 360]),
    harpoon: Object.freeze([60, 100, 155, 230, 320]),
    culverin: Object.freeze([56, 91, 140, 203, 280]),
    swivel: Object.freeze([72, 117, 180, 261, 360]),
  }),
  wallSkillMaxHpFactors: Object.freeze({ stone: 2, bastion: 1.5 }),
  wallResearchMaxHpFactors: Object.freeze({ thick_walls: 1.15 }),
});
