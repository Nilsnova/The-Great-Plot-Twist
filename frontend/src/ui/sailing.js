// Frame-driven travel illustration. Wind controls both passage speed and wave motion.
import { getWeather } from '../world/weather.js';
import { places } from '../world/places/registry.js';
export function createSailing(container, reducedMotion, lowQuality) {
  const dialog = document.createElement('dialog'); dialog.className = 'sailing';
  dialog.setAttribute('aria-labelledby', 'sailing-title');
  dialog.innerHTML = '<p class="eyebrow">SALTREACH PASSAGE</p><h2 id="sailing-title"></h2><canvas width="320" height="180" aria-label="A small sailing boat crossing the sea"></canvas><p class="sailing-status" role="status">Following the coastal route…</p><button>Skip passage <kbd>Enter</kbd></button>';
  container.append(dialog);
  const canvas = dialog.querySelector('canvas'), draw = canvas.getContext('2d');
  const boat = new Image();
  let finish = null, progress = 0, time = 0, fade = false;
  function skip() {
    const done = finish; finish = null; dialog.querySelector('.sailing-status').textContent = 'Making landfall…';
    dialog.querySelector('button').disabled = true; done?.();
  }
  function end() { skip(); if (dialog.open) dialog.close(); }
  dialog.querySelector('button').onclick = skip;
  dialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); skip(); });
  return { get active() { return dialog.open; }, skip, end,
    start(id, options = {}) {
      if (finish) end();
      const instant = reducedMotion() || options.fast;
      fade = lowQuality() || instant;
      if (!fade && !boat.src) boat.src = `${import.meta.env.BASE_URL}pixel/sailboat.png`; progress = 0; time = 0;
      dialog.classList.toggle('fade-passage', fade);
      dialog.querySelector('h2').textContent = `To ${places[id].name}`;
      dialog.querySelector('.sailing-status').textContent = fade ? 'Arriving…' : 'Following the coastal route…';
      dialog.showModal(); dialog.querySelector('button').disabled = false; dialog.querySelector('button').focus();
      if (instant) { skip(); return Promise.resolve(); }
      return new Promise(resolve => { finish = resolve; });
    },
    update(dt) {
      if (!finish) return;
      const wind = getWeather().wind; time += dt;
      progress += dt * (fade ? 1 / .3 : (.8 + wind * .4) / 5);
      if (progress >= 1) { skip(); return; }
      if (fade) return;
      draw.imageSmoothingEnabled = false; draw.fillStyle = '#356b66'; draw.fillRect(0, 0, 320, 180);
      for (let row = 0; row < 11; row++) {
        for (let col = 0; col < 12; col++) {
          const x = ((col * 31 + row * 13 - Math.round(time * (6 + wind * 18))) % 360 + 360) % 360 - 20;
          const y = row * 17 + Math.round(Math.sin(time * (1 + wind) + col + row) * (1 + wind * 2));
          draw.fillStyle = row % 2 ? '#558f80' : '#447e72'; draw.fillRect(x, y, 7 + row % 3, 1);
          draw.fillRect(x + 9, y - 1, 2, 1);
        }
      }
      const x = Math.round(42 + progress * 140), y = 38 + Math.round(Math.sin(time * (1 + wind)) * 2);
      if (boat.complete && boat.naturalWidth) draw.drawImage(boat, x, y);
    },
    dispose() { end(); dialog.remove(); boat.removeAttribute('src'); },
  };
}
