// An accessible display-only sparkline; halted is a supplied presentation state.
import { node, uniqueId } from './dom.js';
import { chartPoints } from './logic.js';
export function createMiniChart({ values = [], halted = false, label = 'Price history' } = {}) {
  const element = node('figure','kit-mini-chart'), caption = node('figcaption'), status = node('span','kit-badge');
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg'), title = document.createElementNS(svg.namespaceURI,'title'), line = document.createElementNS(svg.namespaceURI,'polyline');
  title.id = uniqueId('chart'); svg.setAttribute('viewBox','0 0 240 72'); svg.setAttribute('role','img'); svg.setAttribute('aria-labelledby',title.id);
  svg.append(title,line); element.append(caption,svg,status);
  function update(data) {
    if (data.values) values = data.values; if (data.halted !== undefined) halted = data.halted; if (data.label !== undefined) label = data.label;
    const points = chartPoints(values); line.setAttribute('points',points.map(p=>p.join(',')).join(' '));
    caption.textContent = label; title.textContent = `${label}. ${halted ? 'Trading halted.' : 'Historical values.'} ${points.length} samples.${points.length ? ` First ${values[0]}, latest ${values.at(-1)}.` : ''}`;
    element.dataset.halted = String(halted); status.textContent = halted ? 'Trading halted' : points.length ? 'Sample history' : 'No data';
  }
  update({}); return { element, update, dispose() { element.remove(); } };
}
