// Safe title, credits and pause content. Used by the game shell, with no story spoilers.
import {teamMembers} from './team.js';
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
export function credits() {
  const section=node('section','shell-credits');
  section.append(node('p','','A four-person student project. Original islands, pixel art and sound, made with code.'));
  const team=node('ul');for(const name of teamMembers)team.append(node('li','',name));section.append(node('h3','','The team'),team);
  section.append(node('h3','','Data credits'),node('p','','Weather data by Open-Meteo.com, adapted for the game. CC BY 4.0.'));
  const links=node('p');for(const [label,href] of [['Open-Meteo','https://open-meteo.com/'],['CC BY 4.0','https://creativecommons.org/licenses/by/4.0/']]) {const a=node('a','',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';links.append(a,document.createTextNode(' '));}section.append(links);
  section.append(node('p','','Island Exchange live market data: Binance public market data. Recorded replay: Binance Vision, CC BY-NC-SA 4.0. Adapted to one-minute closing prices for a 90-minute replay.'));
  const marketLinks=node('p');for(const [label,href] of [['Binance market data','https://data.binance.vision/'],['Replay licence · CC BY-NC-SA 4.0','https://creativecommons.org/licenses/by-nc-sa/4.0/']]){const link=node('a','',label);link.href=href;link.target='_blank';link.rel='noopener noreferrer';marketLinks.append(link,document.createTextNode(' '));}section.append(marketLinks);
  section.append(node('h3','','Tools and licences'),node('p','','Three.js, Vite and Vitest: MIT. Playwright Core: Apache-2.0. Pillow (art generation): HPND. Original project graphics and procedural audio use no external assets, fonts or recordings. Package notices accompany the installed tools.'));
  return section;
}
