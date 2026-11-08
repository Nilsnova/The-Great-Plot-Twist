// A bounded memory-only trace stores validated UI names and contract intent outcomes.
import {isDiagnosticAction} from './context.js';

export function createUiTrace() {
  let actions = [];
  return {
    record(action) {
      if (isDiagnosticAction(action)) actions = [...actions, action].slice(-10);
    },
    read() {
      return [...actions];
    },
    clear() {
      actions = [];
    },
  };
}
