// The class harbor's extras bridge (G29). The online adapter's presence owns the Realtime connection;
// the class demo in the game only needs to send a lamp state or a duel invitation into the class room.
// The presence attaches its sender here while it is connected, and the demo calls sendExtra(). Arriving
// extras reach the game as the bus event live_peer_extra, like every other live event. Display only:
// nothing sent here decides anything on the server.
let sender = null, peers = null;
let classHarbor = false;

// send(event, data) sends into the class room; ids: {resolve(displayId) -> player id or null,
// isMe(playerId) -> boolean}. The screens only know display ids (live-captain-N); a duel invitation
// names its captain by player id, never by name (a browser never sends a name to another, D003).
export function attachExtraSender(send, ids = null) {
  sender = typeof send === 'function' ? send : null;
  peers = sender ? ids : null;
  const mine = sender;
  return () => { if (sender === mine) { sender = null; peers = null; } };
}
export function resolvePeer(displayId) { try { return peers?.resolve?.(displayId) ?? null; } catch { return null; } }
export function isMe(playerId) { try { return peers?.isMe?.(playerId) === true; } catch { return false; } }

// True if the extra will be sent (connected, in the class room, inside the lane's allowance).
export function sendExtra(event, data) {
  try { return sender?.(event, data) === true; } catch { return false; }
}

export const canSendExtra = () => sender !== null;

// Whether the player chose the class harbor; the presence reads it when it starts (no start delay).
export function setClassHarbor(value) { classHarbor = value === true; }
export const wantsClassHarbor = () => classHarbor || readInvite();

function readInvite() {
  try { return globalThis.sessionStorage?.getItem('plot_twist_join_v1') === 'harbor'; } catch { return false; }
}
