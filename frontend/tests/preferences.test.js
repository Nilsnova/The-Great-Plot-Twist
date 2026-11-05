// Preferences reject unknown fields and remain usable when browser storage is denied.
import {describe,it,expect} from 'vitest';
import {defaults,normalizePreferences,loadPreferences,savePreferences,motionReduced} from '../src/settings/logic.js';
describe('preferences',()=>{
  it('saves only the documented fields and clamps volume',()=>{
    let data;const storage={getItem:()=>data,setItem:(key,value)=>{data=value;}};
    expect(savePreferences(storage,{master:8,music:-1,effects:0.4,quality:'low',textSpeed:0,token:'secret'})).toBe(true);
    expect(loadPreferences(storage)).toEqual({...defaults,master:1,music:0,effects:0.4,quality:'low',textSpeed:0});
    expect(data).not.toContain('token');
  });
  it('handles malformed, stale, unavailable and hostile storage',()=>{
    for(const raw of ['bad','{}','{"version":9}','null'])expect(loadPreferences({getItem:()=>raw})).toEqual(defaults);
    const denied={getItem(){throw Error();},setItem(){throw Error();}};
    expect(loadPreferences(denied)).toEqual(defaults);expect(savePreferences(denied,defaults)).toBe(false);
    expect(normalizePreferences({quality:'ultra',master:NaN,textSpeed:999,colourblind:'yes'})).toEqual(defaults);
  });
  it('supports system, explicit reduce and explicit full motion',()=>{
    expect(motionReduced(null,true)).toBe(true);expect(motionReduced(false,true)).toBe(false);expect(motionReduced(true,false)).toBe(true);
  });
});
