// MP-ECO-07 personal Captain display contract. Used by cards; island funds never grant personal actions.
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const nullableUuid = value => value === null || uuid(value);
const role = value => value === null || ['medic', 'engineer', 'gunner'].includes(value);
export const declaresPersonalCaptain = value => value?.progressionVersion !== undefined && value.progressionVersion !== 0;

export function readPersonalCaptain(value) {
  if (!value || value.progressionVersion !== 1 || !Number.isSafeInteger(value.level) || value.level < 1
    || !Number.isSafeInteger(value.personalBestWave) || value.personalBestWave < 0 || !role(value.role)
    || typeof value.revision !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value.revision)
    || !nullableUuid(value.assignmentWaveId) || typeof value.canRespec !== 'boolean'
    || ![null, 'captain_assigned'].includes(value.respecBlockedReason)
    || ![null, 'captain_assigned', 'engineer_bound'].includes(value.roleLockedReason)) return null;
  const commitment = value.engineerCommitment;
  if (commitment !== null && (!commitment || !uuid(commitment.id)
    || !['pending', 'attached'].includes(commitment.state) || !nullableUuid(commitment.waveId))) return null;
  if (value.assignmentWaveId !== null && value.canRespec) return null;
  return value;
}

export function personalRespecReason(captain) {
  const profile = readPersonalCaptain(captain);
  if (!profile) return 'Captain progress unavailable. Reload the island.';
  if (profile.assignmentWaveId !== null || profile.respecBlockedReason === 'captain_assigned') return 'Your captain is assigned to a wave.';
  return profile.canRespec ? '' : 'There are no skills or role to reset.';
}

export const engineerCommitmentLine = captain => readPersonalCaptain(captain)?.engineerCommitment
  ? 'Stay Engineer for your next completed wave.' : '';

// Personal revisions order Captain/skill snapshots independently of the treasury revision.
export function preferPersonalSnapshot(previous, next) {
  if (previous?.code !== next?.code) return next;
  const before = readPersonalCaptain(previous?.captain), incoming = readPersonalCaptain(next?.captain);
  if (declaresPersonalCaptain(previous?.captain) && !incoming) {
    return {...next, captain: {progressionVersion: 1}, skills: null};
  }
  if (before && incoming && BigInt(incoming.revision) < BigInt(before.revision)) {
    return {...next, captain: previous.captain, skills: previous.skills};
  }
  return next;
}
