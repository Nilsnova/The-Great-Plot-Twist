// Paint the title before loading its richer account summary; no network starts here.
import {node} from '../ui/kit/dom.js';

export function createLazyAccountSummary(ctx) {
  const element = node('div', 'account-summary-host');
  let component = null;
  let pending = null;
  let latest = null;
  let frame = null;
  let disposed = false;

  async function load() {
    frame = null;
    if (disposed || !element.isConnected || component || pending) return;
    pending = import('../screens/account/summary.js');
    try {
      const {createAccountSummary} = await pending;
      if (disposed) return;
      component = createAccountSummary(ctx);
      element.replaceChildren(component.element);
      if (latest) component.update(latest);
    } catch {
      if (disposed) return;
      const control = node('button', 'kit-button kit-quiet', 'Account and saves');
      control.type = 'button';
      control.onclick = () => ctx.openAccount?.();
      element.replaceChildren(control);
    } finally { pending = null; }
  }

  function start() {
    if (!disposed && !component && frame === null) {
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(load); });
    }
  }

  return {
    element,
    start,
    update(view) { latest = view; component?.update(view); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      component?.dispose();
      element.remove();
    },
  };
}
