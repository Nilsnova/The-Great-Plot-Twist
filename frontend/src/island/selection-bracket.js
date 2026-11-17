// A selected structure keeps its own ground bracket; it never enters or changes paid Move state.
import * as THREE from 'three';
import {projectGround} from '../world/projection.js';
export function makeSelectionBracket(root) {
  const vertices = [], half = 1.08, arm = .36;
  for (const x of [-half, half]) for (const z of [-half, half]) {
    for (const [a,b] of [[[x-Math.sign(x)*arm,z],[x,z]],[[x,z],[x,z-Math.sign(z)*arm]]]) {
      for (const [px,pz] of [a,b]) { const p=projectGround(px,pz);vertices.push(p.x,p.y,0); }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  const material=new THREE.LineBasicMaterial({color:0xc7f88c,depthTest:false,depthWrite:false,transparent:true,opacity:.95});
  const mesh=new THREE.LineSegments(geometry,material);mesh.name='island-selection-bracket';mesh.renderOrder=99;mesh.frustumCulled=false;mesh.visible=false;root.add(mesh);
  return {show(anchor){
    mesh.visible=!!anchor&&Number.isFinite(anchor.x)&&Number.isFinite(anchor.z);
    if(!mesh.visible)return;const p=projectGround(anchor.x,anchor.z);mesh.position.set(p.x,p.y,0);mesh.userData.spotId=anchor.spotId;
  },dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();}};
}
