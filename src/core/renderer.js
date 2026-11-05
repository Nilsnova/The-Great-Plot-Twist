// Owns the WebGL canvas, resize handling and quality settings. Main starts it.
import * as THREE from 'three';
import { QUALITY } from '../config.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor('#758a91');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', '3D island. Use WASD to walk and drag to orbit the camera.');
  renderer.domElement.tabIndex = 0; container.append(renderer.domElement);
  function resize(camera) {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  function setQuality(name, scene) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[name].pixelRatio));
    renderer.shadowMap.enabled = QUALITY[name].shadows;
    // Recompile the shadow variants when switching quality at runtime.
    scene.traverse(object => {
      if (object.isMesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => { material.needsUpdate = true; });
      }
    });
  }
  return { renderer, resize, setQuality };
}
