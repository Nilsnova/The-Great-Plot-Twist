// Extra parts of Settings › Account that a lazily loaded part of the game offers while it runs (the island's
// "Start fresh", D054). The Settings page asks every provider when it opens:
//   addAccountExtras(({view, play}) => element | null)   -> a function that removes the provider
//   accountExtras({view, play})                           -> the elements to show, in order
// view is the adapter view (view.account: state, guest, ...); play() closes the menu and returns to the game.
// A provider must not throw; a broken one cannot break the Settings page.
const providers = new Set();

export function addAccountExtras(provider) {
  providers.add(provider);
  return () => providers.delete(provider);
}

export function accountExtras(context = {}) {
  const elements = [];
  for (const provider of providers) {
    try {
      const element = provider(context);
      if (element && typeof element === 'object' && element.nodeType === 1) elements.push(element);
    } catch { /* A broken provider cannot break Settings. */ }
  }
  return elements;
}
