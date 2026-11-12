// Full-resolution, smoothly filtered rendering for the clean cartoon art (GAME-V3.md §7): the canvas
// fills the window and draws at the device's pixel ratio, bounded by the quality budget (high 1.5x of
// 1080p pixels, low 1x of 720p) and scaled down by the frame budget on a slow device. The world is
// framed in world units (about 20 units tall, at least 16 wide), whatever the screen's density.
import * as THREE from 'three';
import {pixelViewport, worldViewport, createFrameBudget} from '../pixel/display.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({antialias: false, powerPreference: 'high-performance'});
  renderer.setClearColor('#2a93b5'); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', 'Saltreach Isles. Use WASD to walk, E to interact, M for the sea chart, and the wheel to zoom.');
  canvas.tabIndex = 0; canvas.style.imageRendering = 'auto'; container.append(canvas);
  let quality = 'high', currentCamera = null, dimensions = '';
  const budget = createFrameBudget();
  function resize(camera = currentCamera) {
    if (!camera) return;
    currentCamera = camera;
    const recording = container.classList.contains('recording-frame');
    const frameWidth = recording ? 1920 : window.innerWidth;
    const frameHeight = recording ? 1080 : window.innerHeight;
    const nextDimensions = `${frameWidth}:${frameHeight}:${window.devicePixelRatio}`;
    if (dimensions !== nextDimensions) { dimensions = nextDimensions; budget.reset({restoreDensity: true}); }
    // Recording frames are 1920 x 1080 CSS pixels at 1x; low quality keeps the same framing.
    const pixelRatio = recording ? 1 : window.devicePixelRatio || 1;
    const view = pixelViewport(frameWidth, frameHeight, {quality, pixelRatio, densityScale: budget.scale});
    renderer.setPixelRatio(view.pixelRatio); renderer.setSize(frameWidth, frameHeight, false);
    Object.assign(canvas.style, {width: `${frameWidth}px`, height: `${frameHeight}px`, position: 'absolute', left: '0px', top: '0px'});
    Object.assign(camera, worldViewport(frameWidth, frameHeight, camera.userData.viewHeight ?? 20, 16));
    camera.updateProjectionMatrix();
    renderer.userData = {pixelRatio: view.pixelRatio, drawingWidth: view.drawingWidth, drawingHeight: view.drawingHeight,
      quality, densityScale: budget.scale};
  }
  function setQuality(name) {
    const next = name === 'low' ? 'low' : 'high'; renderer.shadowMap.enabled = false;
    if (next === quality) return;
    quality = next; budget.reset({restoreDensity: true}); resize();
  }
  return {renderer, resize, setQuality, sampleFrame(now, {active = true} = {}) {
    if (!budget.sample(now, active)) return false; resize(); return true;
  }};
}
