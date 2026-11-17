import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {decorateIsland} from '../../src/island/world.js';
const indicators=vi.hoisted(()=>({locate:null}));
// Pixel painting/Canvas indicators have separate browser checks; exercise actual scene geometry/lifetimes here.
vi.mock('../../src/art/textures.js',async()=>{const THREE=await import('three');return{frameCanvas:()=>({}),smoothTexture:()=>new THREE.Texture(),spriteMaterial:map=>new THREE.MeshBasicMaterial({map})};});
vi.mock('../../src/island/decorations.js',()=>({decorateProgress:()=>({apply(){},dispose(){}})}));
vi.mock('../../src/island/structure-recovery-indicators.js',()=>({createStructureRecoveryIndicators:({locate})=>{indicators.locate=locate;return{setState(){},update(){},dispose(){}};}}));
const paid=(id='wall_13',fields={})=>({id,kind:'wall',built:true,level:3,x:-4,z:-17.5,...fields});
const start=(loaded=false)=>{
  const place={group:new THREE.Group(),colliders:[],zones:[]};
  const loadArt=vi.fn(loaded?async names=>Object.fromEntries(names.map(id=>[id,new THREE.MeshBasicMaterial()])):()=>new Promise(()=>{}));
  const drawing=decorateIsland(place,{loadArt,reducedMotion:true});
  return{drawing,place,loadArt};
};

describe('paid positioned perimeter walls in the village scene',()=>{
  it('renders first/last owned pieces and their pick/zone/indicator anchors, with no empty inventory markers',()=>{
    const {drawing,place}=start();drawing.apply({spots:[paid(),paid('wall_128',{x:-2})]});
    const mesh=drawing.root.getObjectByName('island-wall:wall_13');expect(mesh.visible).toBe(true);
    expect(mesh.userData.ground).toEqual({x:-4,z:-17.5});expect(drawing.pickAt(-4,-17.5)).toBe('wall_13');
    expect(place.zones.find(row=>row.id==='wall_128')).toBeDefined();expect(indicators.locate('wall_128')).toMatchObject({x:-2,z:-17.5});
    expect(drawing.root.getObjectByName('island-marker:wall_13')).toBeUndefined();expect(drawing.wallJoins).toHaveLength(1);
    drawing.dispose();
  });
  it.each([{built:false},{x:NaN},{z:null},{kind:'cannon'}])('does not invent a site or sprite for an unusable paid row: %j',fields=>{
    const{drawing,place}=start();drawing.apply({spots:[paid('wall_128',fields)]});
    expect(drawing.root.getObjectByName('island-wall:wall_128')).toBeUndefined();expect(place.zones.some(z=>z.id==='wall_128')).toBe(false);drawing.dispose();
  });
  it('removes disappeared pieces without disposing a borrowed family texture or double-releasing geometry',()=>{
    const{drawing}=start();drawing.apply({spots:[paid()]});const mesh=drawing.root.getObjectByName('island-wall:wall_13');
    const geometry=vi.spyOn(mesh.geometry,'dispose'),material=vi.spyOn(mesh.material,'dispose'),texture=vi.spyOn(mesh.material.map,'dispose');
    drawing.apply({spots:[]});expect(drawing.root.getObjectByName('island-wall:wall_13')).toBeUndefined();
    expect(geometry).toHaveBeenCalledOnce();expect(material).toHaveBeenCalledOnce();expect(texture).not.toHaveBeenCalled();
    drawing.apply({spots:[]});drawing.dispose();drawing.dispose();expect(geometry).toHaveBeenCalledOnce();
  });
  it('keeps ordinary legacy lane glow and hides it for an accepted free-grid preview',()=>{
    const{drawing}=start();drawing.apply({spots:[paid('wall_1')]});
    drawing.preview({spotId:'wall_1',x:-4,z:-17.5,size:2,ok:true});expect(drawing.wallLanesShown).toBe(true);
    drawing.preview({spotId:'wall_1',x:-4,z:-17.5,size:2,ok:true,wallRuleVersion:1});expect(drawing.wallLanesShown).toBe(false);drawing.dispose();
  });
  it('uses loaded level/ruin art and real breach/restore connection state for new IDs',async()=>{
    const{drawing}=start(true);await Promise.resolve();await Promise.resolve();
    const rows=[paid(),paid('wall_128',{x:-2})];drawing.apply({spots:rows});expect(drawing.wallJoins).toHaveLength(1);
    expect(drawing.root.getObjectByName('island-wall:wall_13').userData.art).toBe('island-wall-l3');
    const state={recoveryVersion:1,islandEpoch:'epoch',displayPhase:'between_waves',structures:[{spot:'wall_13',kind:'wall',level:3,instanceId:'instance',hpUnits:0,maxHP:200}]};
    drawing.setRecoveryState(state);expect(drawing.wallJoins).toHaveLength(0);
    expect(drawing.root.getObjectByName('island-wall:wall_13').userData.art).toBe('island-wall-l3-broken');
    drawing.setRecoveryState({...state,structures:[{...state.structures[0],hpUnits:1_000_000}]});expect(drawing.wallJoins).toHaveLength(1);
    drawing.apply({spots:rows,battle:true});expect(drawing.wallJoins).toHaveLength(0);
    expect(drawing.root.getObjectByName('island-wall:wall_13')).toBeUndefined();drawing.dispose();
  });
  it('requests every canonical wall damage frame for the nonbatch recovery fallback',async()=>{
    const{drawing,loadArt}=start();
    await Promise.resolve();await Promise.resolve();
    const requested=loadArt.mock.calls.flatMap(([ids])=>ids);
    for(let level=1;level<=5;level++)for(const look of ['damaged','broken'])expect(requested).toContain(`island-wall-l${level}-${look}`);
    drawing.dispose();
  });
});

it('releases still-pending added stand-ins once on world disposal while leaving shared texture ownership intact',()=>{
  const{drawing}=start();drawing.apply({spots:[paid()]});const mesh=drawing.root.getObjectByName('island-wall:wall_13');
  const geometry=vi.spyOn(mesh.geometry,'dispose'),texture=vi.spyOn(mesh.material.map,'dispose');
  drawing.dispose();drawing.dispose();expect(geometry).toHaveBeenCalledOnce();expect(texture).not.toHaveBeenCalled();
  expect(drawing.root.getObjectByName('island-wall:wall_13')).toBeUndefined();
});
