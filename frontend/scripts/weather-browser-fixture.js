// Deterministic weather keeps graphics tests independent of the live data provider.
import {DEFAULT_ATTRIBUTION} from '../src/net/weather.js';
export async function stubWeather(page,overrides={}) {
  await page.route('**/api/weather',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    cloudCover:.05,rain:0,fog:.02,wind:.18,isDay:true,summary:'Clear skies',place:'Coastal test station',
    source:'fallback',fetchedAt:'2026-11-05T00:00:00Z',attribution:DEFAULT_ATTRIBUTION,...overrides,
  })}));
}
