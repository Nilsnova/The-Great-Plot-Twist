// Rehearsal content remains an unchanged public intro and a traceable recorded-weather subset.
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import story from '../src/demo/intro-story.json';
import weather from '../src/demo/recorded-weather.json';
describe('local demo content provenance',()=>{
  it('matches the current public story source exactly',()=>{expect(story).toEqual(JSON.parse(readFileSync('../backend/content/story.json','utf8')));});
  it('retains the credited recorded sample and its explicit adaptations',()=>{
    const source=JSON.parse(readFileSync('../backend/content/weather/recorded-fallback.json','utf8'));
    expect(weather.recordedAt).toBe(source.recordedAt);expect(weather.cloudCover).toBe(source.answer.current.cloud_cover/100);expect(weather.wind).toBeCloseTo(source.answer.current.wind_speed_10m/72);
    expect(weather.source).toBe('recorded');expect(weather.licence).toBe('CC BY 4.0');
  });
});
