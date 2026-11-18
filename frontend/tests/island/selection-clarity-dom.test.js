// Native component proof, explicitly separate from final composed-game visual acceptance.
import {expect, it} from 'vitest';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

it('draws real-tier segment pixels and readable outlined GPU corners at desktop and phone sizes', async () => {
  await browser.withPage(async page => {
    for (const [width, height] of [[1280, 720], [375, 812]]) {
      await page.setViewportSize({width, height});
      await page.evaluate(async () => {
        const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
        const {createIslandUi} = await window.g20Import('/src/island/ui.js');
        const {buildCardModel} = await window.g20Import('/src/island/card-model.js');
        const {makeSelectionBracket} = await window.g20Import('/src/island/selection-bracket.js');
        await window.g20Import('/src/ui/kit/kit.css');
        const ui = createIslandUi({container: document.body});
        const model = buildCardModel({spotId: 'wall_1', slot: 'wall', coins: 1000, movable: true,
          spot: {id: 'wall_1', kind: 'wall', built: true, level: 3, upgradeCost: 80}});
        ui.buildCard(model, {move() {}, upgrade() {}}, {dock: true});
        const scene = new THREE.Scene(); scene.background = new THREE.Color('#81511c');
        const camera = new THREE.OrthographicCamera(-2.1, 2.1, 1.4, -1.4, .1, 10); camera.position.z = 3;
        const renderer = new THREE.WebGLRenderer({alpha: false, antialias: false, preserveDrawingBuffer: true});
        renderer.setSize(300, 200); renderer.domElement.style.cssText = 'display:block;margin:100px auto 0'; document.body.append(renderer.domElement);
        const base = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.5), new THREE.MeshBasicMaterial({color: '#9c6b25', depthTest: false}));
        base.renderOrder = 125; scene.add(base);
        const bracket = makeSelectionBracket(scene); bracket.show({spotId: 'wall_1', x: 0, z: 0}); renderer.render(scene, camera);
        window.clarityFixture = {ui, renderer, bracket, base, cleanup() { ui.dispose(); bracket.dispose(); base.geometry.dispose(); base.material.dispose(); renderer.dispose(); renderer.domElement.remove(); }};
      });
      await page.waitForFunction(() => document.querySelector('.island-selection-portrait canvas')?.villageArt?.composition === 'wall-segment');
      const result = await page.evaluate(async () => {
        const {getRasterFrame} = await window.g20Import('/src/art/village-raster.js');
        const portrait = document.querySelector('.island-selection-portrait canvas'), receipt = portrait.villageArt;
        const pixels = portrait.getContext('2d').getImageData(0, 0, portrait.width, portrait.height).data;
        let minX = portrait.width, maxX = -1, opaque = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 128) { const x = ((i - 3) / 4) % portrait.width; minX = Math.min(minX, x); maxX = Math.max(maxX, x); opaque++; }
        const {renderer} = window.clarityFixture, copy = document.createElement('canvas'); copy.width = 300; copy.height = 200;
        const c = copy.getContext('2d'); c.drawImage(renderer.domElement, 0, 0); const gpu = c.getImageData(0, 0, 300, 200).data;
        let green = 0, dark = 0;
        for (let i = 0; i < gpu.length; i += 4) { if (gpu[i + 1] > 180 && gpu[i] < 170 && gpu[i + 2] < 150) green++; if (gpu[i] < 50 && gpu[i + 1] < 100 && gpu[i + 2] < 70) dark++; }
        return {receipt, filesMatch: receipt.components.every(source => source.file === getRasterFrame(source.id).sheet.file && source.source === 'png'),
          opaque, span: maxX - minX + 1, width: portrait.width, gpuGreen: green, gpuOutline: dark, calls: renderer.info.render.calls};
      });
      expect(result.receipt).toMatchObject({id: 'island-wall-l3', source: 'png', composition: 'wall-segment'});
      expect(result.receipt.components.map(source => source.id)).toEqual(['island-wall-l3', 'village-wall-front-l3', 'village-wall-top-l3', 'village-wall-side-l3']);
      expect(result.filesMatch).toBe(true); expect(result.opaque).toBeGreaterThan(5000); expect(result.span).toBeGreaterThan(result.width * .6);
      expect(result.gpuGreen).toBeGreaterThan(200); expect(result.gpuOutline).toBeGreaterThan(200); expect(result.calls).toBe(3);
      if (process.env.VIS38_SHOTS) {
        await mkdir(process.env.VIS38_SHOTS, {recursive: true});
        await page.screenshot({path: join(process.env.VIS38_SHOTS, `vis38-component-${width}x${height}.png`)});
      }
      await page.evaluate(() => window.clarityFixture.cleanup());
    }
  });
});
