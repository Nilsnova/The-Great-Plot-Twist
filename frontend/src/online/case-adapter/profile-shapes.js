// Malformed success answers cannot confirm a kit, a name or deletion.
import {kitDisplay} from '../../adapter/shared/kits.js';
export function validIntroReply(data) {
  const kit = data?.kit;
  return ['ending_rescue', 'ending_trapped'].includes(data?.ending)
    && ['warned', 'trusted', 'none'].includes(data.decision) && typeof data.readLog === 'boolean'
    && !!kitDisplay(kit) && typeof kit.startPlace === 'string' && Number.isFinite(kit.coins)
    && typeof kit.item?.id === 'string' && typeof kit.item.name === 'string' && typeof kit.item.text === 'string'
    && Number.isFinite(data.coinsPaid) && typeof data.alreadyGranted === 'boolean';
}
export function validNameReply(data) {
  return typeof data?.captainName === 'string' && !!data.captainName.trim()
    && Number.isInteger(data.rerollsLeft) && data.rerollsLeft >= 0;
}
