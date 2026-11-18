// The narrator's and the tutorials' key for a game: "ISLE-ABCDE" for an island code, "pirate_point", or
// `fallback`. Its own module so the eager tutorial gate (tutorial/gate.js) does not pull in the narrator.
export function gameKey(code, fallback = 'local') {
  if (typeof code !== 'string') return fallback;
  if (code === 'pirate_point') return code;
  const symbols = code.replace(/[\s-]/g, '').toUpperCase().replace(/^ISLE(?=[A-Z0-9]{5}$)/, '');
  return /^[A-Z0-9]{5}$/.test(symbols) ? `ISLE-${symbols}` : fallback;
}
