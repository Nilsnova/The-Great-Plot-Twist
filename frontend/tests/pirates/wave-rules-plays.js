// The rules a new fake wave answers with when the given flagged rules are on: the always-on rules too
// (ALWAYS_ON_RULES, retired flags), in SIM_RULES order.
import { ALWAYS_ON_RULES, SIM_RULES } from '../../src/pirates/fake-rules.js';

export function plays(...flagged) {
  const on = new Set([...ALWAYS_ON_RULES, ...flagged]);
  return SIM_RULES.filter(name => on.has(name));
}
