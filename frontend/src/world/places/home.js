// Four visual build plots. Selections are events only; the backend owns future saving.
import * as THREE from 'three';
import { placeArt } from '../art.js';
import { homeBuildings } from './layouts.js';
export function decorateHome(place, art, cleanups, ctx) {
  for (const plot of homeBuildings) {
    const mesh = placeArt(place.group, art, 'build-plot', plot.x, plot.z + .5);
    mesh.renderOrder = 6; mesh.userData.plot = plot.plot;
  }
  const choose = plot => ctx.emit({ type: 'plot_clicked', plot });
  cleanups.push(ctx.on('interact', event => {
    if (event.place === place.id && homeBuildings.some(p => p.plot === event.id)) choose(event.id);
  }));
  if (!ctx.canvas || !ctx.camera) return;
  let down = null;
  const start = event => { if (event.button === 0) down = [event.clientX, event.clientY]; };
  const click = event => {
    if (!down || event.button !== 0 || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 6) { down = null; return; }
    down = null; if (!ctx.isActive?.()) return;
    const rect = ctx.canvas.getBoundingClientRect();
    const point = new THREE.Vector3((event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2, 0).unproject(ctx.camera);
    const z = -point.y / .72;
    const plot = homeBuildings.find(p => Math.abs(p.x - point.x) <= 4.5 && z >= p.z - 7 && z <= p.z + .7);
    if (plot) choose(plot.plot);
  };
  ctx.canvas.addEventListener('pointerdown', start); ctx.canvas.addEventListener('pointerup', click);
  cleanups.push(() => { ctx.canvas.removeEventListener('pointerdown', start); ctx.canvas.removeEventListener('pointerup', click); down = null; });
}
