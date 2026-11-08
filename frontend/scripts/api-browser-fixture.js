// Baseline browser checks never contact an API: later route fixtures override these closed services.
export async function stubOfflineApi(page) {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const config = {flags: Object.fromEntries([
      'sign_in', 'live_presence', 'market', 'predictions', 'arena', 'case', 'bulletin', 'islet',
    ].map(flag => [flag, false])), auth: {provider: 'github'}};
    return route.fulfill({status: path === '/api/config' ? 200 : 503,
      contentType: 'application/json', body: JSON.stringify(path === '/api/config' ? config
        : {error: {code: 'unavailable', message: 'Recorded offline service.'}})});
  });
}
