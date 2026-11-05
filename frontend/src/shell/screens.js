// Safe title, credits and pause content. Used by the game shell, with no story spoilers.
import {node} from '../ui/kit/dom.js';
import {createButton} from '../ui/kit/button.js';
export function pixelLogo() {
  const canvas=node('canvas','shell-logo');canvas.width=64;canvas.height=64;
  canvas.setAttribute('aria-label','Original pixel lighthouse emblem');canvas.setAttribute('role','img');
  const c=canvas.getContext('2d');
  for(const [color,x,y,w,h] of [['#203e38',0,0,64,64],['#f3d58c',6,12,20,4],['#f3d58c',38,12,20,4],['#b8cda7',27,25,10,25],['#e9deb6',29,25,6,25],['#405f50',24,50,16,4],['#b9684b',24,20,16,5],['#e9deb6',26,8,12,12],['#f3d58c',28,11,8,7],['#b9684b',24,5,16,3],['#78997c',8,56,48,3]]) {c.fillStyle=color;c.fillRect(x,y,w,h);}
  return canvas;
}
export function menuButton(label,onClick,quiet=false) {
  return createButton({label,onClick,variant:quiet?'quiet':'primary'}).element;
}
