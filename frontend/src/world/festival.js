// A small native-pixel firework display. Created on demand; owns and releases every allocation.
import * as THREE from 'three';
import {createLifetime} from './places/resources.js';
export function createFestival(scene){
  const group=new THREE.Group();group.name='festival-effects';scene.add(group);
  const positions=new Float32Array(48*3),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const material=new THREE.PointsMaterial({color:'#f3d58c',size:2,sizeAttenuation:false,depthTest:false,depthWrite:false,transparent:true,toneMapped:false});
  const points=new THREE.Points(geometry,material);points.renderOrder=945;points.frustumCulled=false;group.add(points);
  const dispose=createLifetime(group);
  return {update(time,{active,night,reducedMotion,quality,player}){
    group.visible=!!active&&night>.6&&!reducedMotion;if(!group.visible)return;
    const phase=(time%5)/5,cycle=Math.floor(time/5),x=player.x+((cycle%3)-1)*8,y=-player.z*.72+13+(cycle%2)*3;
    const count=quality==='low'?24:48;geometry.setDrawRange(0,count);
    for(let i=0;i<count;i++){const angle=i*Math.PI*2/count,radius=phase*8;positions.set([Math.round((x+Math.sin(angle)*radius)*16)/16,Math.round((y+Math.cos(angle)*radius-phase*phase*5)*16)/16,0],i*3);}geometry.attributes.position.needsUpdate=true;material.opacity=Math.max(0,1-phase);material.color.set(['#f3d58c','#a9d5be','#e9ac94'][cycle%3]);
  },dispose};
}
