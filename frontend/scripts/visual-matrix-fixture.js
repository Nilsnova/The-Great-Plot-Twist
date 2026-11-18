// Browser-only art/rendering review fixture. Actual paid gameplay is verified separately.
import * as THREE from 'three';
import {paintIds} from '../src/art/textures.js';
import {getRasterFrame} from '../src/art/village-raster.js';
import {loadWallAtlas, wallAtlasView} from '../src/art/wall-atlas.js';
import {WALL_ATLAS_IDS} from '../src/art/village/walls.js';
import {makeWallConnections} from '../src/island/wall-connections.js';
import {projectGround} from '../src/world/projection.js';
import {defenseCases, buildingCases, wallCases} from './visual-matrix-cases.js';

function check(value, message) { if (!value) throw new Error(message); }
function element(tag, text, parent) {
  const item = document.createElement(tag); if (text) item.textContent = text; parent?.append(item); return item;
}
function reset(title, className) {
  document.body.replaceChildren();
  document.head.querySelector('[data-vis56]')?.remove();
  const style = element('style', '', document.head); style.dataset.vis56 = '';
  style.textContent = `*{box-sizing:border-box}body{margin:0;padding:16px;background:#123d43;color:#fff1ca;font:14px system-ui}
    h1{font-size:22px;margin:0 0 6px}p{margin:0 0 16px;font-size:12px}h2{margin:0;font-size:15px}
    .art{display:grid;grid-template-columns:88px repeat(5,minmax(0,1fr));gap:10px;align-items:center}
    figure{margin:0;background:#345f50;border:1px solid #b99854;border-radius:8px;overflow:hidden}
    .art canvas{display:block;width:100%;height:110px;object-fit:contain}.art figcaption{font-size:12px;padding:4px;text-align:center}
    .walls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.walls h2{padding:8px}
    .walls canvas{display:block;width:100%}.walls p{margin:0;padding:6px 8px}
    @media(max-width:600px){body{padding:12px}h1{font-size:18px}.art{grid-template-columns:58px repeat(5,minmax(0,1fr));gap:4px}
    .art canvas{height:80px}.art figcaption{font-size:9px}.art h2{font-size:11px}.walls{grid-template-columns:1fr}}`;
  element('h1', title, document.body);
  element('p', 'Renderer/art fixture using existing game modules. Not a gameplay, payment or live-health screenshot.', document.body);
  const grid = element('main', '', document.body); grid.className = className; return grid;
}
function alphaCount(canvas) {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let visible = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 128) visible++; return visible;
}
export async function renderArtMatrix(kind) {
  const rows = kind === 'buildings' ? buildingCases() : defenseCases(kind);
  const grid = reset(`${kind}: existing levels and states`, 'art'), painted = new Map();
  await paintIds([...new Set(rows.flatMap(row => row.cells.map(cell => cell.id)))], 4, (id, canvas) => painted.set(id, canvas));
  const result = [];
  for (const row of rows) {
    element('h2', row.label, grid);
    for (const {id, label} of row.cells) {
      const canvas = painted.get(id).cloneNode(), original = painted.get(id), frame = getRasterFrame(id);
      canvas.getContext('2d').drawImage(original, 0, 0);
      check(original.villageArt?.source === 'png' && original.villageArt.file === frame.sheet.file, `${id}: expected compiled PNG binding`);
      const visiblePixels = alphaCount(canvas); check(visiblePixels > 100, `${id}: visible artwork`);
      const card = element('figure', '', grid); card.append(canvas); element('figcaption', label, card);
      result.push({id, state: row.label, label, source: original.villageArt, pixels: [canvas.width, canvas.height], visiblePixels});
    }
    for (let n = row.cells.length; n < 5; n++) element('div', '', grid);
  }
  await document.fonts.ready; return {fixture: 'compiled-art-contact-sheet', kind, frames: result};
}
function ground(scene) {
  const positions = [];
  for (let n = -6; n <= 6; n += 2) for (const points of [[[n,-4],[n,4]],[[-6,n],[6,n]]]) {
    for (const [x,z] of points) { const p = projectGround(x,z); positions.push(p.x,p.y,0); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({color:0x709771,depthTest:false,depthWrite:false}));
  lines.renderOrder = 1; scene.add(lines);
}
export async function renderWallMatrix(level) {
  const grid = reset(`Wall level ${level}: connected forms and real states`, 'walls');
  const atlas = await loadWallAtlas({quality:'high',density:4}); check(atlas, 'complete wall atlas');
  const bindings = atlas.texture.userData.villageArt;
  check(Array.isArray(bindings) && WALL_ATLAS_IDS.every(id => bindings.some(row => row.id === id && row.source === 'png')), 'every wall atlas frame uses compiled PNG artwork');
  const renderer = new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const result = [];
  try {
    for (const row of wallCases(level)) {
      const card = element('figure','',grid); element('h2',row.label,card);
      const width = Math.floor(card.getBoundingClientRect().width - 2), height = Math.round(width / 2.5);
      const canvas = element('canvas','',card); canvas.width = width; canvas.height = height;
      renderer.setSize(width,height,false);
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x345f50); ground(scene);
      const halfHeight = 7 * height / width, camera = new THREE.OrthographicCamera(-7,7,halfHeight+.6,-halfHeight+.6,.1,20);
      camera.position.z = 10;
      const drawing = makeWallConnections(scene), before = JSON.stringify(row.spots);
      try {
        drawing.setArt(wallAtlasView(atlas)); drawing.show(row.spots); drawing.select(row.selected);
        check(JSON.stringify(row.spots) === before, 'rendering preserves every input coordinate and state');
        check(drawing.links.length === (row.label === 'broken' ? 13 : 15), 'actual wall topology retains the declared breach');
        const selected = scene.getObjectByName('island-selected-wall');
        check(row.selected ? selected?.userData.spotId === row.selected : !selected, 'selection uses the actual wall overlay');
        renderer.render(scene,camera); canvas.getContext('2d').drawImage(renderer.domElement,0,0);
        check(renderer.info.render.calls > 0 && renderer.info.render.triangles > 0, 'real WebGL wall geometry rendered');
        const calls = renderer.info.render.calls, triangles = renderer.info.render.triangles, gl = renderer.getContext();
        const drawn = new Uint8Array(width*height*4), absent = new Uint8Array(drawn.length);
        gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,drawn);
        drawing.root.visible = false; if (selected) selected.visible = false; renderer.render(scene,camera);
        gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,absent);
        let visiblePixels = 0;
        for (let i = 0; i < drawn.length; i += 4) if (drawn[i] !== absent[i] || drawn[i+1] !== absent[i+1] || drawn[i+2] !== absent[i+2]) visiblePixels++;
        check(visiblePixels > 100, 'walls visibly change the real native framebuffer');
        element('p',`${drawing.posts.length} posts · ${drawing.links.length} links · ${calls} draws`,card);
        result.push({state:row.label,spots:row.spots,links:drawing.links,posts:drawing.posts,
          selected:row.selected,calls,triangles,visiblePixels,framebuffer:[width,height]});
      } finally {
        drawing.dispose(); scene.traverse(mesh => {mesh.geometry?.dispose();mesh.material?.dispose();});
      }
    }
  } finally {renderer.dispose();atlas.texture.dispose();}
  await document.fonts.ready; return {fixture:'actual-wall-WebGL-renderer',level,bindings,cases:result};
}
