// Connects the home islet to its build panel: picks the transport, opens the panel on a plot click and tells the world what stands.
import {createIsletAdapter} from './adapter.js';
import {builtPlots} from './view.js';

const HOME_PLACE = 'home_islet';
// The signal station's hotspot opens the finale screen (world/places/case-spots.js), which has its
// own build step. Since G8 the world reports that hotspot as a plot too, so the panel ignores it
// there and shows the station only with the other spots.
const FINALE_HOTSPOTS = new Set(['islet_signal_station']);

// ?islet=local asks for the in-memory fake. Only a dev build can honour it.
function chooseMode({dev, loadFake, search, transport}) {
  const wantsFake = new URLSearchParams(search).get('islet') === 'local';
  if (dev && loadFake && wantsFake) return 'local';
  return transport ? 'live' : 'unavailable';
}

// The fake is loaded on demand. Until it is there, requests wait for it and then go to it.
function lazyFake(loadFake) {
  const ready = loadFake().then(module => module.createFakeIsletTransport());
  ready.catch(() => {}); // get and post pass the error on to the adapter, which shows it
  return {ready, get: path => ready.then(fake => fake.get(path)), post: (path, body) => ready.then(fake => fake.post(path, body))};
}

// Called once from game.js. Returns stop(), which the game calls when it shuts down.
export function attachIsletPanel({
  container, on, emit, resetInput, focus, transport = null,
  // Live mode only. It says whether the player is signed in. A request without a sign-in is answered
  // 401, and the sign-in code may then show its prompt, so sailing home must not ask until it can work.
  canAsk = () => true,
  loadPanel = () => import('./panel.js'),
  // The fake never ships in a production build: Vite turns this line into null there.
  loadFake = import.meta.env.DEV ? () => import('./fake-transport.js') : null,
  search = globalThis.location?.search ?? '',
  dev = import.meta.env.DEV,
}) {
  const mode = chooseMode({dev, loadFake, search, transport});
  const fake = mode === 'local' ? lazyFake(loadFake) : null;
  const adapter = createIsletAdapter({transport: fake ?? transport, mode});
  let panelModule = null;
  let panel = null;
  let stopped = false;
  let ticket = 0; // each click or close takes a new number, so an older opening gives up

  function loadPanelOnce() {
    panelModule ??= loadPanel().catch(error => {
      panelModule = null; // the next click tries again
      throw error;
    });
    return panelModule;
  }

  async function openAt(plot) {
    const mine = ++ticket;
    try {
      const module = await loadPanelOnce();
      if (stopped || mine !== ticket) return;
      panel ??= module.createIsletPanel({container, adapter, resetInput, focus});
      panel.open(plot);
    } catch (error) {
      console.error('The islet panel could not open.', error);
    }
  }

  function close() {
    ticket += 1;
    panel?.close();
  }

  // The world listens for this to draw what stands. It never fires in unavailable mode.
  function announce({view, answered}) {
    if (!answered || view.mode === 'unavailable') return;
    emit({type: 'islet_changed', built: builtPlots(view), signalStationBuilt: view.signalStationBuilt});
  }

  // In local mode the console can reach the fake's dev helpers, for example __isletLocal.dev.failNext('timeout').
  fake?.ready.then(localTransport => {
    if (!stopped) globalThis.__isletLocal = {adapter, dev: localTransport.dev};
  }).catch(() => {});

  const stops = [
    on('plot_clicked', event => { if (!FINALE_HOTSPOTS.has(event.plot)) openAt(event.plot); }),
    on('travel', close),
    on('arrived', event => { if (event.place === HOME_PLACE && (mode !== 'live' || canAsk())) adapter.refresh(); }),
    adapter.subscribe(announce),
  ];

  function stop() {
    if (stopped) return;
    stopped = true;
    ticket += 1;
    for (const stopListening of stops) stopListening();
    panel?.dispose();
    adapter.dispose();
    if (mode === 'local') delete globalThis.__isletLocal;
  }
  // game.js asks stopPlots.active to know whether the panel is open. The shell opens its pause menu on
  // Escape unless game.js says an overlay is open, so the panel has to be counted there.
  Object.defineProperty(stop, 'active', {get: () => panel?.active === true});
  return stop;
}
