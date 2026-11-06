// A far-shore signal is placed from the chart bearing and flashes only from supplied timings.
import * as THREE from 'three';
import {places} from '../places/registry.js';
import {projectPoint} from '../art.js';
import {snapPixel} from '../../pixel/catalog.js';
import {surfaceClass} from '../places/surfaces.js';
import {advanceFlash,initialFlashState,normalizeHook} from './logic.js';

const CHART_UNITS=.14;
function offshorePosition(placeId,chart){
  const place=places[placeId];if(!place)return null;
  const [spawnX,spawnZ]=place.spawn??[0,12],[centerX,centerY]=place.chart;
  let dx=(chart.x-centerX)*CHART_UNITS,dz=(chart.y-centerY)*CHART_UNITS;
  const length=Math.hypot(dx,dz)||1;dx/=length;dz/=length;
  let distance=Math.hypot((chart.x-centerX)*CHART_UNITS,(chart.y-centerY)*CHART_UNITS);
  let x=spawnX+(chart.x-centerX)*CHART_UNITS,z=spawnZ+(chart.y-centerY)*CHART_UNITS;
  for(let i=0;i<24&&surfaceClass(placeId,x,z)!==0;i++){distance+=2;x=spawnX+dx*distance;z=spawnZ+dz*distance;}
  return {x,z};
}
function material(color){return new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthTest:false,depthWrite:false,toneMapped:false});}
export function createHookWorld({scene,reducedMotion=false}={}){
  const root=new THREE.Group();root.name='chapter-two-distant-signal';root.visible=false;scene?.add(root);
  const glow=new THREE.Mesh(new THREE.CircleGeometry(.3,8),material('#f3d58c'));glow.position.z=.01;glow.renderOrder=935;
  const core=new THREE.Mesh(new THREE.PlaneGeometry(.125,.125),material('#fff0c5'));core.position.z=.02;core.renderOrder=936;
  const crossH=new THREE.Mesh(new THREE.PlaneGeometry(.5,.0625),material('#f3d58c'));crossH.position.z=.03;crossH.renderOrder=937;
  const crossV=new THREE.Mesh(new THREE.PlaneGeometry(.0625,.5),material('#f3d58c'));crossV.position.z=.03;crossV.renderOrder=937;
  root.add(glow,core,crossH,crossV);
  let hook=null,key='',flash=initialFlashState(),position=null,disposed=false,lit=false;
  const reduced=()=>typeof reducedMotion==='function'?!!reducedMotion():!!reducedMotion;
  function setHook(value){
    if(disposed)return false;const next=normalizeHook(value);
    if(!next){hook=null;key='';root.visible=false;position=null;flash=initialFlashState();lit=false;return false;}
    const signature=JSON.stringify([next.id,next.beam.chart,next.beam.pattern,next.beam.flash]);
    hook=next;if(signature!==key){key=signature;flash=initialFlashState();lit=false;position=null;}
    return true;
  }
  function update(dt,{night=0,place=null,active=true}={}){
    if(disposed||!hook||!active||!place){root.visible=false;lit=false;return stats();}
    if(!position||position.place!==place){const point=offshorePosition(place,hook.beam.chart);position=point?{...point,place}:null;
      if(!position){root.visible=false;return stats();}const projected=projectPoint(position.x,position.z);root.position.set(snapPixel(projected.x),snapPixel(projected.y),0);}
    const visible=night>.03;root.visible=visible;
    if(!visible){lit=false;return stats();}
    if(reduced())lit=true;else {flash=advanceFlash(flash,dt,hook);lit=flash.lit;}
    for(const mesh of [glow,core,crossH,crossV])mesh.material.opacity=lit?(mesh===glow?0.72:1):0;
    return stats();
  }
  function stats(){return {visible:root.visible,lit,place:position?.place??null,logical:position?{x:position.x,z:position.z}:null,chart:hook?{...hook.beam.chart}:null};}
  return {setHook,update,get stats(){return stats();},dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const mesh of [glow,core,crossH,crossV]){mesh.geometry.dispose();mesh.material.dispose();}root.clear();}};
}
