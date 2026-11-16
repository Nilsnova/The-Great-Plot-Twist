// Extra Settings sections that a lazily loaded part of the game offers while it runs, like the island's
// "Reset my island" (T53, src/island/reset.js). The Settings page (shell/subpages.js) asks every provider
// for one element each time it opens. A provider returns an Element or null and must not throw; one that
// breaks is skipped, so it can never break Settings.
const providers = new Set();

export function addSettingsSection(provider) {
  if (typeof provider !== 'function') return () => {};
  providers.add(provider);
  return () => providers.delete(provider);
}

export function settingsSections() {
  const sections = [];
  for (const provider of providers) {
    try {
      const element = provider();
      if (element && typeof element === 'object' && element.nodeType === 1) sections.push(element);
    } catch { /* A broken provider cannot break Settings. */ }
  }
  return sections;
}
