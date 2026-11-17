// Actual Three.js water/terrain component. No game transport, fake victory or painted screenshot.
import * as THREE from 'three';
import {createWater, seaGlsl} from '../src/world/water.js';
import {pixelGlsl, toScreen} from '../src/world/pixel-glsl.js';
import {loadBackdrop, backdrop} from '../src/world/places/resources.js';
import {cliffProfile} from '../src/art/coast-cliffs.js';
import {surfaces} from '../src/world/places/surfaces.js';

const hash = async data => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(v => v.toString(16).padStart(2, '0')).join('');
export async function createWaterFixture({width, height}) {
  const scene = new THREE.Scene(), water = createWater(scene), group = new THREE.Group();
  const texture = await loadBackdrop('places/home_islet.png', {quality: 'high'}), ground = backdrop(group, texture);
  scene.add(group); water.setCoast(group);
  const renderer = new THREE.WebGLRenderer({alpha: true, antialias: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(1); renderer.setSize(width, height); renderer.setClearColor(0x000000, 0);
  const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
  const backend = {renderer: gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
    vendor: gl.getParameter(info?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR), version: gl.getParameter(gl.VERSION)};
  document.body.style.cssText = 'margin:0;background:#092e37'; document.body.append(renderer.domElement);
  const label = document.createElement('div'); label.style.cssText = 'position:absolute;top:12px;left:12px;right:12px;padding:8px 12px;background:#123b3eee;border:1px solid #e9bf5b;border-radius:8px;color:#fff1cf;font:14px system-ui;pointer-events:none';
  document.body.append(label);
  ground.updateWorldMatrix(true, false);
  const envelope = cliffProfile(surfaces.home_islet).flatMap(p => [p.y, p.baseY].map(y => ground.localToWorld(new THREE.Vector3(p.x, -y, 0))));
  const bounds = new THREE.Box3().setFromPoints(envelope), size = bounds.getSize(new THREE.Vector3()), centre = bounds.getCenter(new THREE.Vector3());
  const span = Math.max(size.y * 1.22, size.x * 1.22 / (width / height));
  const camera = new THREE.OrthographicCamera(-span * width / height / 2, span * width / height / 2, span / 2, -span / 2, .1, 100);
  camera.position.set(centre.x, centre.y, 10);
  const shaderErrors = [];
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => shaderErrors.push([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\n'));
  const candidate = water.mesh.material.fragmentShader;
  const palette = Object.fromEntries(['uDeep', 'uMid', 'uLight', 'uShallow', 'uShallow2', 'uFoam', 'uGlint', 'uStroke'].map(key => [key, water.mesh.material.uniforms[key].value.clone()]));
  const render = () => {renderer.render(scene, camera); renderer.getContext().finish();};
  const pixels = () => {
    const gl = renderer.getContext(), data = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data); return data;
  };
  const alphaAt = (data, x, y) => {
    const point = new THREE.Vector3(x, y, 0).project(camera);
    const px = Math.floor((point.x + 1) * width / 2), py = Math.floor((point.y + 1) * height / 2);
    if (px < 0 || px >= width || py < 0 || py >= height) throw new Error('Water mask probe left viewport.');
    return data[(py * width + px) * 4 + 3];
  };
  return {
    async frame({name, baseline, quality = 'high', reduced = false, rain = 0}) {
      const material = water.mesh.material;
      material.fragmentShader = baseline ? baseline.fragment.replaceAll('${pixelGlsl}', pixelGlsl).replaceAll('${seaGlsl}', seaGlsl).replaceAll('${toScreen}', toScreen) : candidate;
      for (const key of Object.keys(palette)) if (baseline) material.uniforms[key].value.set(baseline.colours[key]); else material.uniforms[key].value.copy(palette[key]);
      material.needsUpdate = true; water.setQuality(quality); water.update(0, {wind: .35, rain}); water.update(reduced ? 0 : 12, {wind: .35, rain});
      for (let i = 0; i < 3; i++) render();
      const times = [];
      for (let i = 0; i < 8; i++) {const start = performance.now(); render(); times.push(performance.now() - start);}
      label.textContent = `SEA COMPONENT · ${name} · ${width}×${height} · same candidate terrain`;
      const first = pixels(), firstHash = await hash(first);
      water.update(reduced ? 0 : 14, {wind: .35, rain}); render();
      const laterHash = await hash(pixels());
      water.update(0, {wind: .35, rain}); water.update(reduced ? 0 : 12, {wind: .35, rain}); render();
      times.sort((a, b) => a - b);
      return {name, quality, reduced, rain, hash: firstHash, laterHash, unchangedWhenReduced: reduced ? firstHash === laterHash : null,
        drawCalls: renderer.info.render.calls, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
        gpuSynchronizedMilliseconds: {median: (times[3] + times[4]) / 2, max: times.at(-1)}, backend, shaderErrors: [...shaderErrors]};
    },
    mask() {
      group.visible = false; render(); const data = pixels(), hidden = [];
      for (const [x, z] of [[0, 0], [-8, 0], [8, 0], [0, -8], [0, 8]]) {
        const point = ground.localToWorld(new THREE.Vector3(x, -z * .72, 0));
        if (alphaAt(data, point.x, point.y) !== 0) hidden.push({x, z});
      }
      const source = texture.image.getContext('2d'), density = texture.image.width / 64;
      let rockSamples = 0;
      for (const index of [15, 30, 60, 75]) {
        const p = cliffProfile(surfaces.home_islet)[index], y = p.y + p.depth * .7;
        if (source.getImageData(Math.round((p.x + 32) * density), Math.round((y + 24) * density), 1, 1).data[3] < 250) continue;
        const point = ground.localToWorld(new THREE.Vector3(p.x, -y, 0));
        rockSamples++; if (alphaAt(data, point.x, point.y) !== 0) hidden.push({x: p.x, cliffY: y});
      }
      water.setCoast(new THREE.Group()); render(); const fallback = pixels();
      let transparentFallback = 0; for (let i = 3; i < fallback.length; i += 4) if (fallback[i] < 255) transparentFallback++;
      water.setCoast(group); group.visible = true; render();
      return {waterDrawnInsideOpaqueTerrain: hidden, rockSamples, transparentFallback, shaderErrors: [...shaderErrors]};
    },
    dispose() {water.dispose(); ground.geometry.dispose(); ground.material.dispose(); texture.dispose(); group.removeFromParent(); renderer.dispose(); renderer.forceContextLoss();},
  };
}
