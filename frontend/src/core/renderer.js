// Integer upscaling and nearest sampling keep a single crisp pixel grid on any DPR.
import * as THREE from 'three';
import { pixelViewport } from '../pixel/display.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor('#3d7371'); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; renderer.setPixelRatio(1);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', 'Pixel-art Saltreach Isles. Use WASD to walk, E to interact, M for the sea chart, and the wheel to zoom.');
  canvas.tabIndex = 0; canvas.style.imageRendering = 'pixelated'; container.append(canvas);
  function resize(camera) {
    // Recording fixes the output frame; normal play follows the browser viewport.
    const recording=container.classList.contains('recording-frame');
    const frameWidth=recording?1920:window.innerWidth,frameHeight=recording?1080:window.innerHeight;
    const { width, height, scale } = pixelViewport(frameWidth, frameHeight);
    renderer.setSize(width, height, false);
    Object.assign(canvas.style, { width: `${width * scale}px`, height: `${height * scale}px`,
      position: 'absolute', left: `${Math.floor((frameWidth - width * scale) / 2)}px`, top: `${Math.floor((frameHeight - height * scale) / 2)}px` });
    camera.left = -width / 32; camera.right = width / 32; camera.top = height / 32; camera.bottom = -height / 32;
    camera.updateProjectionMatrix(); renderer.userData = { pixelScale: scale, nativeWidth: width, nativeHeight: height };
  }
  function setQuality() { renderer.shadowMap.enabled = false; }
  return { renderer, resize, setQuality };
}
