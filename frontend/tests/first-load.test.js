// The first load (title → island): independent downloads run side by side, and a slow /api/config
// never locks a player out of the island game for the rest of the visit.
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const main=read('../src/main.js'),game=read('../src/game.js');

describe('first load',()=>{
  it('downloads the motion setting beside the world chunk, and starts both when Play is chosen',()=>{
    expect(main).toMatch(/Promise\.all\(\[loadWorld\(\)\.then\(module=>module\.loadGameModule\(\)\),ensureMotion\(\)\]\)/);
    expect(main).not.toMatch(/await ensureMotion\(\);loading=true/);
    expect(main).toMatch(/onStart:\(\)=>\{prefetchGame\(\);/);
    expect(main).toMatch(/onReplay:\(\)=>\{prefetchGame\(\);/);
  });
  it('loads the motion module once even when Play and Settings ask together',()=>{
    expect(main).toMatch(/return motionLoad\?\?=import\('\.\/settings\/preferences\.js'\)/);
  });
  it('starts the island game chunks with the harbor art when the flags already say islands',()=>{
    const start=game.indexOf('export async function startGame'),prefetch=game.indexOf("()=>import('./island/index.js')"),harbor=game.indexOf("await world.goTo('saltreach_harbor')");
    expect(start).toBeGreaterThan(-1);
    expect(prefetch).toBeGreaterThan(start);
    expect(prefetch).toBeLessThan(harbor);
    expect(game).toMatch(/quickIslandsMode\(\{search:location\.search,dev:import\.meta\.env\.DEV,flags:currentFlags\(\)\}\)==='live'/);
  });
  it('waits longer than the API timeout for the flags, shows the wait, and keeps only a real answer',()=>{
    const wait=Number(game.match(/FLAGS_WAIT_MS=(\d+)/)?.[1]),api=Number(read('../src/online/api.js').match(/REQUEST_TIMEOUT_MS = (\d+)/)?.[1]);
    expect(wait).toBeGreaterThan(api);
    expect(game).toContain('Waiting for the island server…');
    expect(game).toMatch(/if\(!online\|\|mode!=='off'\|\|currentFlags\(\)!==null\)islandsMode=mode;/);
    expect(game).not.toMatch(/islandsMode\?\?=await resolveIslandsMode/);
  });
});
