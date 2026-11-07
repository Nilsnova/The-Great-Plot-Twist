// Build outcomes retain the server receipt, authoritative readback and original held click ID.
import {MESSAGES, alreadyAppliedNotice, builtNotice, failureNotice, makeNotice, validBuildReceipt} from './view.js';
const isRefusal = result => result.status >= 400 && result.status < 500;

export function createBuildOutcomes(ctx) {
  const {keptIds, loadIslet, current, expired, syncRetryFlags, publish, refused} = ctx;
  async function confirmed(spot, code, receipt, owner) {
    keptIds.delete(spot.plot);
    const refreshed = await loadIslet(true, owner), reloaded = refreshed.accepted && !refreshed.stale;
    if (!current(owner)) return expired();
    ctx.view.notice = code === 'built' ? builtNotice(spot, receipt, reloaded) : alreadyAppliedNotice(reloaded);
    return {accepted: true, code, message: ctx.view.notice.message};
  }
  async function rejected(spot, result, owner) {
    // Held IDs belong only to earlier unknown outcomes; a refused resend does not settle that write.
    await loadIslet(true, owner);
    if (!current(owner)) return expired();
    ctx.view.notice = failureNotice(result);
    return refused(ctx.view.notice.code, ctx.view.notice.message);
  }
  // No answer, or a server error: keep the click id, check the islet, and let the player retry safely.
  async function unknownOutcome(spot, actionUid, owner) {
    keptIds.set(spot.plot, actionUid);
    syncRetryFlags();
    ctx.view.notice = makeNotice('info', 'checking', MESSAGES.checking);
    publish();
    const refreshed = await loadIslet(true, owner), reloaded = refreshed.accepted && !refreshed.stale;
    if (!current(owner)) return expired();
    if (ctx.view.spots.find(item => item.plot === spot.plot)?.state === 'built') {
      ctx.view.notice = makeNotice('success', 'confirmed', MESSAGES.confirmed);
      return {accepted: true, code: 'confirmed', message: MESSAGES.confirmed};
    }
    ctx.view.notice = reloaded ? makeNotice('info', 'not_done', MESSAGES.notDone) : makeNotice('error', 'unconfirmed', MESSAGES.unconfirmed);
    return refused('unconfirmed', ctx.view.notice.message);
  }
  function settle(spot, actionUid, result, owner) {
    if (result.ok && validBuildReceipt(result.data, spot)) return confirmed(spot, 'built', result.data, owner);
    if (result.status === 409 && result.code === 'already_applied') return confirmed(spot, 'already_applied', null, owner);
    if (isRefusal(result)) return rejected(spot, result, owner);
    return unknownOutcome(spot, actionUid, owner);
  }
  return settle;
}
