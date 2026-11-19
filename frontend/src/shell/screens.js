// Safe title, credits and pause content. Used by the game shell, with no story spoilers.
import {node} from '../ui/kit/dom.js';
import {createButton} from '../ui/kit/button.js';
// The title emblem uses the limestone, copper and brass finishes of the animated lighthouse.
export function titleEmblem() {
  const canvas=node('canvas','shell-logo'),ratio=Math.min(3,globalThis.devicePixelRatio||1);canvas.width=canvas.height=Math.round(64*ratio);
  canvas.setAttribute('aria-label','A small lighthouse');canvas.setAttribute('role','img');
  const c=canvas.getContext('2d');if(!c)return canvas;c.scale(ratio,ratio);c.lineJoin='round';c.lineWidth=2.4;c.strokeStyle='#594233';
  const colour=(x,y,ex,ey,stops)=>{
    const wash=c.createLinearGradient(x,y,ex,ey);
    stops.forEach(([at,hex])=>wash.addColorStop(at,hex));
    return wash;
  };
  const shape=(fill,d)=>{const p=new Path2D(d);c.fillStyle=fill;c.fill(p);c.stroke(p);};
  shape(colour(10,13,54,60,[[0,'#7cc4c1'],[.45,'#3d8c99'],[1,'#135365']]),'M4 36a28 28 0 0 1 56 0v20a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z');
  c.lineWidth=.9;c.strokeStyle='#ecce89';c.stroke(new Path2D('M6 36a26 26 0 0 1 52 0v17'));
  c.strokeStyle='#9fdfc8';c.stroke(new Path2D('M9 40q5-2 10-1m26 5q5-2 9-1'));
  c.lineWidth=2.4;c.strokeStyle='#594233';
  shape(colour(8,48,54,60,[[0,'#bad86b'],[.48,'#83aa4b'],[1,'#506639']]),'M6 52q26-12 52 0v4a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z');
  const tower='M25 52l3-30h8l3 30z';
  shape(colour(25,0,40,0,[[0,'#b4ab92'],[.31,'#fff0ca'],[1,'#a58d78']]),tower);
  c.save();c.clip(new Path2D(tower));
  c.fillStyle=colour(25,0,40,0,[[0,'#9d5a46'],[.32,'#db9270'],[1,'#913e37']]);
  c.fillRect(25.6,44,12.8,4);c.fillRect(26.6,33,10.8,4);c.restore();
  shape(colour(26,13,38,22,[[0,'#fff1b1'],[.51,'#f5d177'],[1,'#be8751']]),'M26 13h12v9H26z');
  shape(colour(23,21,41,24,[[0,'#d6a973'],[1,'#927054']]),'M23 21h18v3H23z');
  shape(colour(24,7,38,13,[[0,'#d99a72'],[.52,'#b96b54'],[1,'#805044']]),'M24 13l8-8 8 8z');
  return canvas;
}
export function menuButton(label,onClick,quiet=false) {
  return createButton({label,onClick,variant:quiet?'quiet':'primary'}).element;
}
