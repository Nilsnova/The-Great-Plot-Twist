// UI kit factories on native DOM: safe text, disabled controls, tab semantics and focus.
import { expect, it } from 'vitest';
import { browserHarness } from './g20-browser.js';
const evaluate = browserHarness();

it('keeps supplied button labels literal, honors disabled state and removes listeners on dispose', async () => {
  const result = await evaluate(async () => {
    const { createButton } = await window.g20Import('/src/ui/kit/button.js'); let clicks = 0;
    const button = createButton({ label: '<b>Untrusted label</b>', disabled: true, onClick: () => clicks++ }); document.body.append(button.element);
    button.element.click(); const disabledClicks = clicks, label = button.element.textContent, tags = button.element.children.length;
    button.update({ disabled: false, label: 'Continue' }); button.element.click(); button.dispose(); button.element.click();
    return { disabledClicks, clicks, label, tags, connected: button.element.isConnected };
  });
  expect(result).toEqual({ disabledClicks: 0, clicks: 1, label: '<b>Untrusted label</b>', tags: 0, connected: false });
});

it('tabs keep focus, selection, tab order and labelled panels aligned across wraparound', async () => {
  const result = await evaluate(async () => {
    const { createTabs } = await window.g20Import('/src/ui/kit/tabs.js');
    const tabs = createTabs({ items: [{ id: 'a', label: 'First', body: 'One' }, { id: 'b', label: 'Second', body: 'Two' }] }); document.body.append(tabs.element);
    const buttons = [...document.querySelectorAll('[role=tab]')], panels = [...document.querySelectorAll('[role=tabpanel]')];
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
    const result = { focus: document.activeElement === buttons[1], selected: buttons.map(b => b.getAttribute('aria-selected')),
      order: buttons.map(b => b.tabIndex), hidden: panels.map(p => p.hidden), labels: panels.every((p, i) => p.getAttribute('aria-labelledby') === buttons[i].id && buttons[i].getAttribute('aria-controls') === p.id) };
    tabs.dispose(); return result;
  });
  expect(result).toEqual({ focus: true, selected: ['false', 'true'], order: [-1, 0], hidden: [true, false], labels: true });
});

it('modal Escape closes with a reason and restores the invoking focus', async () => {
  const result = await evaluate(async () => {
    const { createModal } = await window.g20Import('/src/ui/kit/modal.js');
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    const reasons = [], modal = createModal({ title: 'Details', body: '<img src=x>', onClose: reason => reasons.push(reason) }); modal.open();
    const literal = modal.body.textContent, tags = modal.body.children.length;
    const closed = new Promise(resolve => modal.element.addEventListener('close', resolve, { once: true }));
    modal.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await closed;
    const restored = document.activeElement === opener; modal.dispose(); return { literal, tags, reasons, restored, connected: modal.element.isConnected };
  });
  expect(result).toEqual({ literal: '<img src=x>', tags: 0, reasons: ['escape'], restored: true, connected: false });
});
