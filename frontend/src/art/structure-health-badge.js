// Pixel geometry and palette shared by the village scene and the combat atlas.
export const RECOVERY_BADGE = Object.freeze({
  width: 32, height: 10, units: 16,
  fillInset: 2, fillWidth: 28, fillHeight: 6,
  track: '#202b28', broken: '#5d342c',
  green: '#8ad27a', gold: '#f1c76e', red: '#ed8368',
  light: '#fff2c9',
});

export const recoveryBadgeLift = kind => kind === 'wall' ? 3.2 : 4;
export const recoveryBadgeTone = share => share > .5 ? 'green' : share > .25 ? 'gold' : 'red';
export const recoveryBadgeFill = share => Math.max(1, RECOVERY_BADGE.fillWidth * share);

export function paintRecoveryBadge(context, destroyed) {
  context.fillStyle = '#14211e';
  context.fillRect(1, 0, 30, 10);
  context.fillRect(0, 1, 32, 8);
  context.fillStyle = '#6c7868';
  context.fillRect(1, 1, 30, 8);
  context.fillStyle = destroyed ? RECOVERY_BADGE.broken : RECOVERY_BADGE.track;
  context.fillRect(2, 2, 28, 6);
  if (destroyed) {
    // Empty track with a capped amber end and an ivory pixel mark for a ruin.
    context.fillStyle = '#9a563c';
    context.fillRect(24, 2, 6, 6);
    context.fillStyle = RECOVERY_BADGE.light;
    context.fillRect(26, 2, 2, 3);
    context.fillRect(26, 6, 2, 2);
  }
}
