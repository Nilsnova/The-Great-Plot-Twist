// Safe title, credits and pause content. Used by the game shell, with no story spoilers.
import {node} from '../ui/kit/dom.js';
import {createButton} from '../ui/kit/button.js';
// The title emblem: a small cartoon lighthouse (bold outline, red bands, a lit lamp) drawn with vector
// paths at the screen's density, like the game's art (GAME-V3.md §7).
export function titleEmblem() {
  const canvas=node('canvas','shell-logo'),ratio=Math.min(3,globalThis.devicePixelRatio||1);canvas.width=canvas.height=Math.round(64*ratio);
  canvas.setAttribute('aria-label','A small lighthouse');canvas.setAttribute('role','img');
  const c=canvas.getContext('2d');if(!c)return canvas;c.scale(ratio,ratio);c.lineJoin='round';c.lineWidth=2.4;c.strokeStyle='#2b1d1a';
  const shape=(fill,d)=>{const p=new Path2D(d);c.fillStyle=fill;c.fill(p);c.stroke(p);};
  shape('#2c7f8c','M4 36a28 28 0 0 1 56 0v20a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z');
  shape('#6dbb47','M6 52q26-12 52 0v4a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z');
  shape('#f6f0e2','M25 52l3-30h8l3 30z');
  c.fillStyle='#d64a3b';c.fillRect(25.6,44,12.8,4);c.fillRect(26.6,33,10.8,4);c.stroke(new Path2D('M25 52l3-30h8l3 30z'));
  shape('#ffd560','M26 13h12v9H26z');shape('#3d4250','M23 21h18v3H23z');shape('#d64a3b','M24 13l8-8 8 8z');
  return canvas;
}
export function menuButton(label,onClick,quiet=false) {
  return createButton({label,onClick,variant:quiet?'quiet':'primary'}).element;
}
