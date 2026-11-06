import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {fakeHook,hookView,setHookScenario} from '../src/adapter/fake/hook.js';
import {advanceFlash,initialFlashState,MIN_FLASH_SECONDS,normalizeHook,patternWords} from '../src/world/hook/logic.js';
import {createHookWorld} from '../src/world/hook/index.js';

const signal=fakeHook();
describe('chapter hook signal data',()=>{
  it('clamps coordinates and pulse durations while preserving the supplied pattern',()=>{
    const unsafe={...signal,beam:{...signal.beam,chart:{x:900,y:-4},pattern:Array(16).fill('short'),flash:{shortSeconds:.01,longSeconds:20,gapSeconds:-4,pauseSeconds:12}}};
    const safe=normalizeHook(unsafe);expect(safe.beam.chart).toEqual({x:447,y:0});expect(safe.beam.pattern).toHaveLength(12);
    expect(safe.beam.flash).toEqual({shortSeconds:MIN_FLASH_SECONDS,longSeconds:10,gapSeconds:0,pauseSeconds:10});
    expect(patternWords(signal)).toBe('short, short, long');
  });
  it('keeps short flashes at or below three starts in a one second interval',()=>{
    const dense={...signal,beam:{...signal.beam,pattern:Array(12).fill('short'),flash:{shortSeconds:.001,longSeconds:.001,gapSeconds:.02,pauseSeconds:.01}}};
    let state=initialFlashState(),lastLit=false,starts=0;
    for(let frame=0;frame<1000;frame++){state=advanceFlash(state,.001,dense);if(state.lit&&!lastLit)starts++;lastLit=state.lit;}
    expect(starts).toBeLessThanOrEqual(3);expect(normalizeHook(dense).beam.flash.shortSeconds).toBe(MIN_FLASH_SECONDS);
  });
  it('returns placeholder hook content only after the fake scenario is enabled',()=>{
    const state={};expect(hookView(state)).toBeNull();setHookScenario(state);expect(hookView(state).notice.text).toBe('[notice supplied by the server]');setHookScenario(state,false);expect(hookView(state)).toBeNull();
  });
});

describe('hook world layer',()=>{
  it('flashes under a live reduced-motion getter, holds still when reduced, and disposes safely',()=>{
    const scene=new THREE.Scene();let reduce=false;const layer=createHookWorld({scene,reducedMotion:()=>reduce});
    expect(layer.setHook(signal)).toBe(true);layer.update(.5,{night:1,place:'saltreach_harbor',active:true});expect(layer.stats.lit).toBe(false);
    reduce=true;layer.update(.1,{night:1,place:'saltreach_harbor',active:true});expect(layer.stats.lit).toBe(true);
    expect(layer.stats.chart).toEqual({x:440,y:12});layer.dispose();layer.dispose();expect(scene.children).toHaveLength(0);
  });
});
