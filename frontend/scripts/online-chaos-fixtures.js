// Fault metadata and route interception contain no credentials, response grants or live services.
export const onlineChaosFaults = Object.freeze([
  {id: 'offline', status: 0, phase: 'offline', words: /offline/i},
  {id: 'expired', status: 401, code: 'unauthorized', phase: 'expired', words: /session expired|sign in again/i},
  {id: 'feature_off', status: 404, code: 'feature_off', phase: 'error', words: /feature.*(?:later|unavailable)/i},
  {id: 'stale_save', status: 409, code: 'stale_save', phase: 'error', words: /save changed|which copy|conflict/i},
  {id: 'rate_limited', status: 429, code: 'too_many_requests', phase: 'rate_limited', words: /try again in \d+ s/i},
  {id: 'gateway', status: 502, code: 'server_error', phase: 'error', words: /could not complete|could not be completed/i},
  {id: 'unavailable', status: 503, code: 'unavailable', phase: 'error', words: /service unavailable/i},
]);

// Later G9 streams provide real UI journeys for these groups. A missing journey is never a pass.
export const onlineChaosRouteGroups = Object.freeze([
  'account', 'intro', 'save', 'crew', 'presence', 'islet', 'market',
  'predictions', 'arena', 'bulletin', 'case', 'partners', 'finale',
]);

export function createOnlineChaosFaults(page) {
  let selected = null;
  const requests = [];
  const handler = async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!selected || request.method() !== selected.method || !selected.paths.includes(path)) {
      return route.fallback();
    }
    const {fault} = selected;
    requests.push({group: selected.group, fault: fault.id, path, method: request.method()});
    if (fault.status === 0) return route.abort('failed');
    return route.fulfill({status: fault.status,
      headers: fault.status === 429 ? {'Retry-After': String(selected.cooldownSeconds)} : {},
      json: {error: {code: fault.code, message: 'Recorded service failure.'}}});
  };
  return {
    requests,
    async install() { await page.route('**/api/**', handler); },
    set({group, paths, method = 'POST', cooldownSeconds = 3}, fault) {
      selected = {group, paths: [...paths], method, cooldownSeconds, fault};
    },
    clear() { selected = null; },
    async dispose() { selected = null; await page.unroute('**/api/**', handler); },
  };
}
