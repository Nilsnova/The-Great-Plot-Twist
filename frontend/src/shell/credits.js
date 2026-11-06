// Credits load only when opened. Data lives in the team's editable list.
import {teamMembers} from './team.js';
import {node} from '../ui/kit/dom.js';
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
