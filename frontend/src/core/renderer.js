// Render at useful screen density while keeping simulation coordinates and framing stable.
import * as THREE from 'three';
import {pixelViewport, worldViewport, createFrameBudget} from '../pixel/display.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({antialias: false, powerPreference: 'high-performance'});
  renderer.setClearColor('#3d7371'); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', 'Saltreach Isles. Use WASD to walk, E to interact, M for the sea chart, and the wheel to zoom.');
  canvas.tabIndex = 0; canvas.style.imageRendering = 'auto'; container.append(canvas);
  let quality = 'high', currentCamera = null,dimensions='';
  const budget=createFrameBudget();
  function resize(camera = currentCamera) {
    if (!camera) return;
    currentCamera = camera;
    const recording = container.classList.contains('recording-frame');
    const frameWidth = recording ? 1920 : window.innerWidth;
    const frameHeight = recording ? 1080 : window.innerHeight;
    const nextDimensions=`${frameWidth}:${frameHeight}:${window.devicePixelRatio}`;
    if(dimensions!==nextDimensions){dimensions=nextDimensions;budget.reset();}
    const view = pixelViewport(frameWidth, frameHeight, {quality, pixelRatio: window.devicePixelRatio,densityScale:budget.scale});
    renderer.setPixelRatio(view.pixelRatio); renderer.setSize(view.width, view.height, false);
    Object.assign(canvas.style, {width: `${view.width}px`, height: `${view.height}px`,
      position: 'absolute', left: '0px', top: '0px'});
    Object.assign(camera, worldViewport(view.width, view.height, camera.userData.viewHeight ?? 20));
    camera.updateProjectionMatrix();
    renderer.userData = {pixelScale: 1, nativeWidth: view.drawingWidth, nativeHeight: view.drawingHeight,
      pixelRatio: view.pixelRatio, quality, densityScale:budget.scale};
  }
  function setQuality(name) {
    const next = name === 'low' ? 'low' : 'high'; renderer.shadowMap.enabled = false;
    if (next === quality) return;
    quality = next; budget.reset(); resize();
  }
  return {renderer, resize, setQuality,sampleFrame(now,{active=true}={}){
    if(!budget.sample(now,active))return false;resize();return true;
  }};
}
