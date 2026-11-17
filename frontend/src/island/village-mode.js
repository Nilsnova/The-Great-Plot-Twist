// Optional local selection mode. It never authorizes or submits a server action.
export const isTextEntry = target => target?.isContentEditable === true || (typeof target?.closest === 'function' &&
  !!target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));

export function createVillageMode({context, render = () => {}, onLeave = () => {}}) {
  let active = false, code = null, disposed = false;
  const allowed = value => value?.ready === true && value.own === true && value.reserved !== true;
  function leave() {
    if (!active) return false;
    active = false; code = null; onLeave(); render(false);
    return true;
  }
  function refresh() {
    if (active) {
      const value = context();
      if (!allowed(value) || value.code !== code) leave();
    }
  }
  return {
    enter() {
      if (disposed) return false;
      const value = context();
      if (!allowed(value) || !value.code) return false;
      active = true; code = value.code; render(true);
      return true;
    },
    leave, refresh,
    get active() { refresh(); return active; },
    dispose() { leave(); disposed = true; },
  };
}
