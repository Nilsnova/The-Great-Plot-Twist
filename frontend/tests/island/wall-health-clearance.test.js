import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';
import {createStructureRecoveryIndicators} from '../../src/island/structure-recovery-indicators.js';
import {createBattleGuide} from '../../src/pirates/battle-guide.js';
import {projectPoint} from '../../src/world/art.js';
import {getRasterFrame} from '../../src/art/village-raster.js';

const frame = getRasterFrame('island-wall'), postTop = (frame.logical[1]-frame.logical[2])/16;
describe('health labels above upright wall art', () => {
  it('clears the actual registered post in preparation and retains hiding, HP and owned cleanup', () => {
    const context = {clearRect(){},fillRect(){},strokeRect(){},fillText(){}};
    vi.stubGlobal('document',{createElement:()=>({getContext:()=>context})});
    const root = new THREE.Group(), point = {x:4,z:3}, ground = projectPoint(point.x,point.z);
    const indicators = createStructureRecoveryIndicators({root,locate:()=>point});
    const state = {displayPhase:'preparing',structures:[{spot:'wall_1',kind:'wall',hpUnits:1,maxHP:60},
      {spot:'wall_2',kind:'wall',hpUnits:0,maxHP:60},{spot:'wall_3',kind:'wall',hpUnits:1_000_000,maxHP:60},
      {spot:'cannon_1',kind:'cannon',hpUnits:500_000,maxHP:80}]};
    const before = structuredClone(state);
    try {
      indicators.setState(state); indicators.update(); expect(root.children).toHaveLength(3);
      for (const mesh of root.children.filter(row=>row.name.includes('wall_'))) {
        expect(mesh.position.x).toBe(ground.x); expect(mesh.position.y-ground.y).toBeCloseTo(3.2,12);
        expect(mesh.position.y-ground.y-mesh.geometry.parameters.height/2).toBeGreaterThan(postTop);
      }
      expect(root.getObjectByName('structure-recovery:cannon_1').position.y-ground.y).toBe(4);
      indicators.setState({...state,displayPhase:'combat'}); indicators.update();
      expect(root.children.every(mesh=>!mesh.visible)).toBe(true); expect(state).toEqual(before);
      const disposals = root.children.map(mesh=>[vi.spyOn(mesh.geometry,'dispose'),vi.spyOn(mesh.material,'dispose'),vi.spyOn(mesh.material.map,'dispose')]);
      indicators.dispose(); indicators.dispose();
      expect(root.children).toEqual([]); disposals.flat().forEach(spy=>expect(spy).toHaveBeenCalledOnce());
    } finally {indicators.dispose();vi.unstubAllGlobals();}
  });

  it.each([1,1.5,2])('clears the registered post in legacy combat at character scale %s without changing state', scale => {
    const scene = new THREE.Scene(), guide = createBattleGuide({scene,characterScale:()=>scale,reducedMotion:()=>true});
    const state = {mode:'wave',defenses:[{id:'wall_1',kind:'wall',level:5,x:0,z:0}],
      stateWalls:[{id:'wall_1',hp:40,maxHp:100}],boarders:[],wave:1,dt:0,heart:{x:0,z:2}};
    const before = structuredClone(state);
    try {
      guide.update(state);
      const mesh = scene.getObjectByName('battle-guide:air'), positions = mesh.geometry.getAttribute('iPos'), sizes = mesh.geometry.getAttribute('iSize');
      const bars = Array.from({length:mesh.geometry.instanceCount},(_,i)=>i).filter(i=>positions.getW(i)===4);
      expect(bars).toHaveLength(2);
      for(const i of bars) {
        expect(positions.getY(i)).toBeCloseTo(2.9*scale,6);
        expect(positions.getY(i)-sizes.getY(i)/2).toBeGreaterThan(postTop);
      }
      guide.update({...state,stateWalls:[{id:'wall_1',hp:100,maxHp:100}]});
      expect(Array.from({length:mesh.geometry.instanceCount},(_,i)=>positions.getW(i)).filter(shape=>shape===4)).toEqual([]);
      expect(state).toEqual(before);
    } finally {guide.dispose();}
  });
});
