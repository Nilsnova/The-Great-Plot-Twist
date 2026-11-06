// Workshop-only audition. Native controls provide gesture, keyboard and phone support.
import { festivalSounds } from '../audio/festival-catalog.js';
import { node } from '../ui/kit/dom.js';

export function showFestivalSounds(container) {
  const players = [];
  for (const sound of festivalSounds) {
    const card = node('article', 'festival-sound');
    const audio = node('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.loop = sound.loop;
    audio.src = `${import.meta.env.BASE_URL}${sound.file}`;
    audio.setAttribute('aria-label', `Listen to ${sound.title}`);
    audio.addEventListener('play', () => {
      for (const other of players) if (other !== audio) other.pause();
    });
    card.append(node('h3', '', sound.title), node('p', '', sound.caption), audio);
    players.push(audio);
    container.append(card);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) for (const player of players) player.pause();
  });
}
