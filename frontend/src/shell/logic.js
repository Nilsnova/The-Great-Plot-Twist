// Menu state. Used by the shell and its pure tests.
export function shellTransition(state, action) {
  if (action === 'play') return 'playing';
  if (action === 'title') return 'title';
  if (action === 'pause' && ['playing','settings','credits'].includes(state)) return 'pause';
  if (['settings', 'credits', 'join', 'invite'].includes(action)) return action;
  return state;
}
