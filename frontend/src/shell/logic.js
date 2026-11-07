// Menu state and local-save availability. Used by the shell and its pure tests.
export function hasLocalIntro(value) {
  try {
    const saved = JSON.parse(value);
    return saved?.version === 1 && Array.isArray(saved.actions) && saved.actions.length <= 1000 && saved.actions.every(id => typeof id === 'string');
  } catch { return false; }
}
export function shellTransition(state, action) {
  if (action === 'play') return 'playing';
  if (action === 'title') return 'title';
  if (action === 'pause' && ['playing','settings','credits'].includes(state)) return 'pause';
  if (['settings', 'credits', 'friends'].includes(action)) return action;
  return state;
}
