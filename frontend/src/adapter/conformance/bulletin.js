// Route-shaped bulletin validation, reusable by fake and real-adapter tests.
import {expect} from 'vitest';
const nullableObject=value=>expect(value===null||typeof value==='object').toBe(true);
// Public request metadata contains no server body, private identity or authentication action.
function validateRequest(bulletin){
  if(!('request' in bulletin)||bulletin.request===null)return;
  const request=bulletin.request,optional=['status','retryUntil'];
  expect(Object.keys(request).sort()).toEqual(['reason','message',...optional.filter(key=>key in request)].sort());
  expect(['offline','not_connected','internal_error','rate_limited','feature_off']).toContain(request.reason);
  expect(typeof request.message==='string'&&request.message.length>0).toBe(true);
  if('status' in request)expect(Number.isInteger(request.status)&&request.status>=0&&request.status<=599).toBe(true);
  if(request.status===401||request.status===409)expect(request.reason).toBe('internal_error');
  if('retryUntil' in request)expect(request.reason==='rate_limited'&&Number.isFinite(request.retryUntil)
    &&request.retryUntil>=0&&request.retryUntil<=Number.MAX_SAFE_INTEGER).toBe(true);
  if(request.reason==='rate_limited')expect('retryUntil' in request).toBe(true);
  if(request.reason==='feature_off'){
    expect(bulletin.status).toBe('off');expect(bulletin.lines).toEqual([]);
    for(const key of ['day','weather','exchange','chapterTwoHook'])expect(bulletin[key]).toBeNull();
  }
}
export function validateBulletin(bulletin){
  expect(bulletin).toBeTruthy();
  validateRequest(bulletin);
  expect(Object.keys(bulletin)).toEqual(expect.arrayContaining(['status','day','lines','weather','exchange','chapterTwoHook']));
  expect(['off','loading','ready','unavailable']).toContain(bulletin.status);
  expect(Array.isArray(bulletin.lines)).toBe(true);
  for(const line of bulletin.lines){
    expect(typeof line.kind).toBe('string');
    expect(typeof line.text).toBe('string');
  }
  for(const key of ['day','weather','exchange','chapterTwoHook'])nullableObject(bulletin[key]);
  if(bulletin.day){
    expect(Array.isArray(bulletin.day.resets)).toBe(true);
    for(const key of ['id','startedAt','nextDayAt','bulletinDay','publishedAt','nextBulletinAt','harborWeek','nextHarborWeekAt'])expect(typeof bulletin.day[key]).toBe('string');
    for(const reset of bulletin.day.resets)expect(reset).toMatchObject({when:expect.any(String),what:expect.any(String)});
  }
  const tonight=bulletin.weather?.tonight;
  if(tonight){
    for(const key of ['date','startsAt','endsAt'])expect(typeof tonight[key]).toBe('string');
    expect([null,'calm','fog','rain','storm']).toContain(tonight.state);
    expect(typeof tonight.isNow).toBe('boolean');expect(typeof tonight.isFogNight).toBe('boolean');
    expect([null,'real','almanac']).toContain(tonight.fogNightKind);
  }
  if(bulletin.weather){expect(bulletin.weather.attribution===null||typeof bulletin.weather.attribution==='string').toBe(true);}
  if(bulletin.exchange){expect(['live','cache','stale','replay']).toContain(bulletin.exchange.feed);expect(Array.isArray(bulletin.exchange.pausedCompanies)).toBe(true);}
  const hook=bulletin.chapterTwoHook;
  if(hook){
    expect(hook).toMatchObject({id:expect.any(String),notice:{title:expect.any(String),text:expect.any(String)}});
    const {beam}=hook;expect(Number.isFinite(beam.chart.x)&&Number.isFinite(beam.chart.y)).toBe(true);
    expect(Array.isArray(beam.pattern)).toBe(true);for(const pulse of beam.pattern)expect(['short','long']).toContain(pulse);
    for(const key of ['shortSeconds','longSeconds','gapSeconds','pauseSeconds'])expect(Number.isFinite(beam.flash[key])).toBe(true);
  }
}
