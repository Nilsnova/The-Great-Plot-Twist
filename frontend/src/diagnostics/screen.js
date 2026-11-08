// Read only fixed screen selectors and enum values, never headings or user-supplied text.
import {sanitizeScreen} from './context.js';

const overlays = [
  ['.account-modal[open]', 'account'], ['.shell-loading', 'loading'],
  ['.intro-modal[open]', 'intro'], ['.sea-chart[open]', 'chart'],
  ['.cinematic-modal[open]', 'cinematic'],
];
export function readDiagnosticScreen(document) {
  for (const [selector, screen] of overlays) {
    if (document.querySelector(selector)) return screen;
  }
  const shell = document.querySelector('.shell-screen[open]');
  if (shell) return sanitizeScreen(shell.dataset.mode);
  const page = document.querySelector('.case-modal[open] .case-page-picker');
  if (page) return sanitizeScreen(page.value);
  const explicit = document.querySelector('[data-diagnostic-screen]');
  return sanitizeScreen(explicit?.dataset.diagnosticScreen) ?? 'world';
}
