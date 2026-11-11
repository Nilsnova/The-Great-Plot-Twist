// Crisp pixel rendering (td-clean): the world draws 1:1 at 16 native pixels per unit into a small
// buffer that the browser magnifies by a whole number of device pixels (image-rendering: pixelated),
// so every art pixel is the same sharp square at 1280 x 720, 1440 x 900, 1080p, retina and phones.
// The camera's zoom arrives already stepped (player/camera.js); a new step resizes the buffer here.
import * as THREE from 'three';
import {nativeViewport, pixelStep, createFrameBudget} from '../pixel/display.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({antialias: false, powerPreference: 'high-performance'});
  renderer.setClearColor('#3d7371'); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', 'Saltreach Isles. Use WASD to walk, E to interact, M for the sea chart, and the wheel to zoom.');
  canvas.tabIndex = 0; canvas.style.imageRendering = 'pixelated'; container.append(canvas);
  let quality = 'high', currentCamera = null,dimensions='';
  const budget=createFrameBudget();
  let step = 0;
  function resize(camera = currentCamera) {
    if (!camera) return;
    currentCamera = camera;
    const recording = container.classList.contains('recording-frame');
    const frameWidth = recording ? 1920 : window.innerWidth;
    const frameHeight = recording ? 1080 : window.innerHeight;
    const nextDimensions=`${frameWidth}:${frameHeight}:${window.devicePixelRatio}`;
    if(dimensions!==nextDimensions){dimensions=nextDimensions;budget.reset({restoreDensity:true});}
    // Recording frames are 1920 x 1080 CSS pixels at 1x; low quality keeps the same framing.
    const pixelRatio = recording ? 1 : window.devicePixelRatio || 1;
    const view = nativeViewport(frameWidth, frameHeight, {pixelRatio, zoom: camera.zoom});
    step = view.step;
    renderer.setPixelRatio(1); renderer.setSize(view.nativeWidth, view.nativeHeight, false);
    Object.assign(canvas.style, {width: `${view.cssWidth}px`, height: `${view.cssHeight}px`,
      position: 'absolute', left: '0px', top: '0px'});
    camera.userData.pixelScale = view.scale;
    Object.assign(camera, {left: view.left, right: view.right, top: view.top, bottom: view.bottom});
    camera.updateProjectionMatrix();
    renderer.userData = {pixelScale: view.step, nativeWidth: view.nativeWidth, nativeHeight: view.nativeHeight,
      pixelRatio, quality, densityScale:budget.scale};
  }
  // A camera that stepped its zoom gets a buffer of the matching size before it draws.
  const draw = renderer.render.bind(renderer);
  renderer.render = (scene, camera) => {
    if (camera === currentCamera && camera.userData.pixelScale
      && pixelStep(camera.userData.pixelScale, camera.zoom) !== step) resize(camera);
    draw(scene, camera);
  };
  function setQuality(name) {
    const next = name === 'low' ? 'low' : 'high'; renderer.shadowMap.enabled = false;
    if (next === quality) return;
    quality = next; budget.reset({restoreDensity:true}); resize();
  }
  return {renderer, resize, setQuality,sampleFrame(now,{active=true}={}){
    if(!budget.sample(now,active))return false;resize();return true;
  }};
}
