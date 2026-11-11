// Credits load only when opened. Data lives in the team's editable list.
import {teamMembers} from './team.js';
import {node} from '../ui/kit/dom.js';
import {createBuildInfo} from '../build/info.js';
import {session as defaultSession} from '../online/session.js';
import {readMarketCredits} from '../online/market-credits.js';

function marketCredit(credit) {
  const row=node('p','shell-market-credit');
  function append(label,href) {
    if(label===null||label==='')return;
    if(!href){row.append(document.createTextNode(label));return;}
    const link=node('a','',label);link.href=href;link.target='_blank';link.rel='noopener noreferrer';row.append(link);
  }
  append(credit.text,credit.href);
  if(credit.licenceText){row.append(document.createTextNode(' '));append(credit.licenceText,credit.licenceHref);}
  return row;
}

export function credits({session=defaultSession}={}) {
  const section=node('section','shell-credits');
  section.append(node('p','','A four-person student project. Original islands, pixel art and sound, made with code.'));
  const team=node('ul');for(const name of teamMembers)team.append(node('li','',name));section.append(node('h3','','The team'),team);
  section.append(node('h3','','Data credits'),node('p','','Weather data by Open-Meteo.com, adapted for the game. CC BY 4.0.'));
  const links=node('p');for(const [label,href] of [['Open-Meteo','https://open-meteo.com/'],['CC BY 4.0','https://creativecommons.org/licenses/by/4.0/']]) {const a=node('a','',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';links.append(a,document.createTextNode(' '));}section.append(links);
  section.append(node('p','','Island Exchange live market data: Binance public market data. Recorded replay: Binance Vision, CC BY-NC-SA 4.0. Adapted to one-minute closing prices for a 90-minute replay.'));
  section.append(node('p','','Football data provided by the Football-Data.org API. Basketball data provided by BALLDONTLIE. Scores may be delayed. Match board picks are a play-money simulation.'));
  const marketLinks=node('p');for(const [label,href] of [['Binance market data','https://data.binance.vision/'],['Replay license · CC BY-NC-SA 4.0','https://creativecommons.org/licenses/by-nc-sa/4.0/']]){const link=node('a','',label);link.href=href;link.target='_blank';link.rel='noopener noreferrer';marketLinks.append(link,document.createTextNode(' '));}section.append(marketLinks);
  for(const credit of readMarketCredits(session))section.append(marketCredit(credit));
  const voices=node('p','','Voices by ElevenLabs. The cutscene narration is our own script, read by the ElevenLabs voice George and generated once with ElevenLabs text-to-speech; the game ships the audio files and calls no voice service while you play. ');const voiceLink=node('a','','ElevenLabs');voiceLink.href='https://elevenlabs.io/';voiceLink.target='_blank';voiceLink.rel='noopener noreferrer';voices.append(voiceLink);section.append(node('h3','','Voices'),voices);
  section.append(node('h3','','Tools and licenses'),node('p','','Three.js, Vite and Vitest: MIT. Playwright Core: Apache-2.0. Pillow (art generation): HPND. Original project graphics and audio use no external assets or fonts, apart from the generated cutscene voices above. Third-party software notices accompany the built game.'));
  section.append(node('p','','Supabase JavaScript client and components: MIT, © 2020 Supabase.'));
  if(import.meta.env.PROD){const notices=node('a','','Third-party software notices');notices.href='./third-party-notices.md';notices.target='_blank';notices.rel='noopener noreferrer';section.append(notices);}
  section.append(node('h3','','Build'),createBuildInfo());return section;
}
