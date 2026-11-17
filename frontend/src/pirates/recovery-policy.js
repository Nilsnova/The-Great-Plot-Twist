// Version-aware recovery gates for the pirate simulation. Used by sim.js and replay transport.

export const LEGACY_RECOVERY_VERSION = 0;
export const LEGACY_WAVE_PROTOCOL = 1;
export const STRUCTURE_RECOVERY_VERSION = 1;
export const STRUCTURE_WAVE_PROTOCOL = 2;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A server-issued per-wave identity; never substitute a profile or account id. */
export function isParticipantToken(value) {
  return typeof value === 'string' && UUID_V4.test(value);
}

/** Read only an explicitly supported version pair; omitted fields preserve the frozen legacy path. */
export function readRecoveryPolicy({ recoveryVersion = LEGACY_RECOVERY_VERSION, waveProtocol = LEGACY_WAVE_PROTOCOL } = {}) {
  if (recoveryVersion === LEGACY_RECOVERY_VERSION && waveProtocol === LEGACY_WAVE_PROTOCOL) return 'legacy';
  if (recoveryVersion === STRUCTURE_RECOVERY_VERSION && waveProtocol === STRUCTURE_WAVE_PROTOCOL) return 'structure-recovery-v1';
  return null;
}

/** Legacy Captain and automatic repair remain unchanged; recovery v1 reserves all free structure HP. */
export function canFreeStructureRepair(policy) {
  return policy === 'legacy';
}
