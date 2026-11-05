// WebGL draws unlit original illustrations. Resize preserves orthographic proportions.
import * as THREE from 'three';
import { QUALITY, colors } from '../config.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(colors.water);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
  renderer.domElement.setAttribute('aria-label', 'Illustrated island. Use WASD to walk, E to interact, and the wheel to zoom.');
  renderer.domElement.tabIndex = 0; container.append(renderer.domElement);
  function resize(camera) {
    renderer.setSize(window.innerWidth, window.innerHeight);
    const aspect = window.innerWidth / window.innerHeight;
    const height = Math.max(camera.userData.viewHeight, 68 / aspect);
    camera.left = -height * aspect / 2; camera.right = height * aspect / 2;
    camera.top = height / 2; camera.bottom = -height / 2; camera.updateProjectionMatrix();
  }
  function setQuality(name) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[name].pixelRatio));
    renderer.shadowMap.enabled = false;
  }
  return { renderer, resize, setQuality };
}
