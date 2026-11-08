import {describe,it,expect} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {bulletinView,canonicalBulletinCopy,initialBulletinState,setBulletinScenario as chooseScenario,bulletinScenarioIds} from '../src/adapter/fake/bulletin.js';
import {durationUntil,lisbonDateTime,tonightLabel} from '../src/screens/bulletin/logic.js';
import {teaserShouldShow,stormFlagShouldShow} from '../src/world/places/settlement.js';

const FIXED_NOW=Date.parse('2026-11-06T12:00:00Z');
const state=()=>({...initialBulletinState(FIXED_NOW)});
const setBulletinScenario=(state,id,nowMs=FIXED_NOW)=>chooseScenario(state,id,nowMs);
describe('bulletin fake view',()=>{
  it('starts off and accepts only known rehearsal scenarios',()=>{
    const s=state();expect(bulletinView(s)).toMatchObject({status:'off',lines:[],weather:null,exchange:null,chapterTwoHook:null});
    expect(setBulletinScenario(s,'loading')).toBe(true);expect(bulletinView(s).status).toBe('loading');expect(setBulletinScenario(s,'unknown')).toBe(false);
  });
  it('returns authoritative fog kinds and keeps hook wording private',()=>{
    const s=state();setBulletinScenario(s,'real');expect(bulletinView(s).weather.tonight).toMatchObject({state:'fog',isFogNight:true,fogNightKind:'real'});
    setBulletinScenario(s,'almanac');expect(bulletinView(s).weather.tonight.fogNightKind).toBe('almanac');
    setBulletinScenario(s,'hook');const view=bulletinView(s);expect(view.chapterTwoHook.notice.text).toBe('[notice supplied by the server]');expect(view.lines.find(line=>line.kind==='hook').text).toBe('[bulletin line supplied by the server]');
  });
  it('keeps a ready bulletin without tonight data distinct from an inferred forecast',()=>{
    const s=state();setBulletinScenario(s,'missing-tonight',Date.parse('2026-11-06T12:00:00Z'));
    const view=bulletinView(s);expect(view.status).toBe('ready');expect(view.weather.tonight).toBeNull();
    expect(view.lines[0].text).toBe('Tonight: no forecast. Tomorrow: calm and clear.');expect(view.chapterTwoHook).toBeNull();
  });
  it('shows lines in server order and maps exchange failure state as data',()=>{
    const s=state();setBulletinScenario(s,'stale',Date.parse('2026-11-06T12:00:00Z'));const view=bulletinView(s);
    expect(view.lines.map(line=>line.kind)).toEqual(['weather','exchange']);expect(view.exchange).toMatchObject({feed:'stale',pausedCompanies:[{id:'harbor-trust'}]});
    setBulletinScenario(s,'calm',Date.parse('2026-11-06T12:00:00Z'));
    expect(bulletinView(s).lines.map(line=>line.kind)).toEqual(['weather','exchange']);
    setBulletinScenario(s,'relit',Date.parse('2026-11-06T12:00:00Z'));expect(bulletinView(s).lines.map(line=>line.kind)).toEqual(['weather','relit']);
    expect(bulletinScenarioIds).toContain('unavailable');
  });
  it('pins a stable Lisbon-local rehearsal clock and uses short fake countdowns',()=>{
    const base=Date.parse('2026-11-16T12:00:00Z'),s=initialBulletinState(base);setBulletinScenario(s,'calm',base);
    const view=bulletinView(s),again=bulletinView(s);
    expect(view).toEqual(again);expect(view.day.id).toBe('2026-11-16');expect(view.day.bulletinDay).toBe('2026-11-16');
    expect(view.lines.map(line=>line.kind)).toEqual(['weather','exchange','calendar']);
    expect(Date.parse(view.weather.tonight.startsAt)-base).toBe(7*60_000);
    expect(Date.parse(view.day.nextBulletinAt)-base).toBe(15*60_000);
    setBulletinScenario(s,'real',base);expect(bulletinView(s).weather.tonight.isNow).toBe(true);
    setBulletinScenario(s,'storm',base);expect(bulletinView(s).weather.tonight.isNow).toBe(true);
  });
  const canonicalPath=resolve(process.cwd(),'../backend/content/bulletin.json');
  it.skipIf(!existsSync(canonicalPath))('keeps copied normal bulletin text in parity with canonical checkout content',()=>{
    const source=JSON.parse(readFileSync(canonicalPath,'utf8'));
    expect(canonicalBulletinCopy).toEqual({stateWords:source.stateWords,noForecast:source.noForecast,weatherLine:source.weatherLine,
      fogNightLines:source.fogNightLines,exchange:source.exchange,relitLine:source.relitLine,relitLineHours:source.relitLineHours,calendar:source.calendar,resets:source.resets});
  });
});

describe('Lisbon time display and world signals',()=>{
  it('formats the supplied time in Lisbon and computes a presentation-only countdown',()=>{
    expect(lisbonDateTime('2027-03-28T07:00:00Z')).toContain('08:00');
    expect(durationUntil('2026-11-16T18:00:00Z',Date.parse('2026-11-16T17:55:00Z'))).toBe('in 5 min');
    expect(tonightLabel({state:'fog',isNow:false,isFogNight:true,fogNightKind:'almanac',startsAt:'2026-11-16T18:00:00Z'},Date.parse('2026-11-16T17:55:00Z')).fog).toContain("harbor's almanac");
  });
  it('uses authoritative tonight when present, falls back only when absent, and stops after relighting',()=>{
    expect(teaserShouldShow({night:.8,weather:{fog:0},bulletin:{status:'ready',weather:{tonight:{isFogNight:true}}}})).toBe(true);
    expect(teaserShouldShow({night:.8,weather:{fog:1},bulletin:{status:'ready',weather:{tonight:{isFogNight:false}}}})).toBe(false);
    expect(teaserShouldShow({night:.8,weather:{fog:.8},bulletin:{status:'off'}})).toBe(true);
    expect(teaserShouldShow({night:.8,weather:{fog:1},relit:true})).toBe(false);
    expect(stormFlagShouldShow({bulletin:{status:'off'},weatherAnswer:{state:'storm'}})).toBe(false);
    expect(stormFlagShouldShow({bulletin:{status:'ready',weather:{tonight:{state:'storm',isNow:false}}}})).toBe(false);
    expect(stormFlagShouldShow({bulletin:{status:'ready',weather:{tonight:{state:'storm',isNow:true}}},weatherAnswer:{state:'calm'}})).toBe(false);
    expect(stormFlagShouldShow({bulletin:{status:'ready',weather:{tonight:{state:'storm',isNow:true}}}})).toBe(true);
  });
});
