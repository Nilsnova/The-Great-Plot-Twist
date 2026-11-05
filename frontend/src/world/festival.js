// A small native-pixel firework display. Created on demand; owns and releases every allocation.
import * as THREE from 'three';
import {createLifetime} from './places/resources.js';
export function createFestival(scene){
  const group=new THREE.Group();group.name='festival-effects';scene.add(group);
  const positions=new Float32Array(48*3),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const material=new THREE.PointsMaterial({color:'#f3d58c',size:2,sizeAttenuation:false,depthTest:false,depthWrite:false,transparent:true,toneMapped:false});
  const points=new THREE.Points(geometry,material);points.name='coastal-fireworks';points.renderOrder=945;points.frustumCulled=false;group.add(points);
  const lanternGeometry=new THREE.BufferGeometry();lanternGeometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3));
  const lanternMaterial=new THREE.PointsMaterial({color:'#f3d58c',size:3,sizeAttenuation:false,depthTest:false,depthWrite:false,transparent:true,toneMapped:false});
  const lantern=new THREE.Points(lanternGeometry,lanternMaterial);lantern.name='captain-festival-lantern';lantern.renderOrder=926;lantern.frustumCulled=false;group.add(lantern);
  const dispose=createLifetime(group);
  return {update(time,{active,night,reducedMotion,quality,player,lanternColour}){
    points.visible=!!active&&night>.6&&!reducedMotion;const colours={gold:'#f3d58c',sea:'#a9d5be',rose:'#e9ac94'};lantern.visible=night>.5&&Object.hasOwn(colours,lanternColour??'');if(lantern.visible){lanternMaterial.color.set(colours[lanternColour]);lantern.position.set(Math.round((player.x+.5)*16)/16,Math.round((-player.z*.72+.7)*16)/16,0);}
    group.visible=points.visible||lantern.visible;if(!points.visible)return;
    const phase=(time%5)/5,cycle=Math.floor(time/5),x=player.x+((cycle%3)-1)*3,y=-player.z*.72+7+(cycle%2)*2;
    const count=quality==='low'?24:48;geometry.setDrawRange(0,count);
    for(let i=0;i<count;i++){const spoke=Math.floor(i/3),tail=i%3,angle=spoke*Math.PI*2/(count/3),radius=Math.max(0,phase-tail*.09)*(3+(spoke%4)*.25);positions.set([Math.round((x+Math.sin(angle)*radius)*16)/16,Math.round((y+Math.cos(angle)*radius-phase*phase*3)*16)/16,0],i*3);}geometry.attributes.position.needsUpdate=true;material.opacity=Math.max(0,1-phase);material.color.set(['#f3d58c','#a9d5be','#e9ac94'][cycle%3]);
  },dispose};
}
