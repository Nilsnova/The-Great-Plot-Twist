// Connects the home islet to its build panel: picks the transport, opens the panel on a plot click and tells the world what stands.
import {createIsletAdapter} from './adapter.js';
import {builtPlots, MESSAGES} from './view.js';

const HOME_PLACE = 'home_islet';

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
  onSessionChange, onPrivateReset, suppliedAdapter = null, onView,
  loadPanel = () => import('./panel.js'),
  // The fake never ships in a production build: Vite turns this line into null there.
  loadFake = import.meta.env.DEV ? () => import('./fake-transport.js') : null,
  search = globalThis.location?.search ?? '',
  dev = import.meta.env.DEV,
}) {
  const mode = chooseMode({dev, loadFake, search, transport: suppliedAdapter ?? transport});
  const fake = mode === 'local' ? lazyFake(loadFake) : null;
  const ownsAdapter = mode !== 'live' || !suppliedAdapter;
  const adapter = ownsAdapter ? createIsletAdapter({transport: fake ?? transport, mode}) : suppliedAdapter;
  let panelModule = null;
  let panel = null;
  let stopped = false;
  let opening = false;
  let ticket = 0; // each click or close takes a new number, so an older opening gives up
  let identity = 0, refreshing = null;
  const refused = code => ({accepted: false, code, message: code === 'sign_in_required' ? MESSAGES.signIn : ''});

  function loadPanelOnce() {
    panelModule ??= loadPanel().catch(error => {
      panelModule = null; // the next click tries again
      throw error;
    });
    return panelModule;
  }

  async function openAt(plot) {
    if (stopped) return false;
    const mine = ++ticket;
    opening = true;
    try {
      const module = await loadPanelOnce();
      if (stopped || mine !== ticket) return false;
      panel ??= module.createIsletPanel({container, adapter, resetInput, focus});
      panel.open(plot);
      return true;
    } catch (error) {
      console.error('The islet panel could not open.', error);
      return false;
    } finally { if (mine === ticket) opening = false; }
  }

  function close() {
    const active = opening || panel?.active === true;
    ticket += 1;
    opening = false;
    panel?.close();
    return active;
  }

  function refresh() {
    if (stopped) return Promise.resolve(refused('disposed'));
    if (mode === 'live' && !canAsk()) return Promise.resolve(refused('sign_in_required'));
    if (refreshing?.identity === identity) return refreshing.promise;
    const task = {identity, promise: null};
    task.promise = adapter.refresh().then(result => stopped || task.identity !== identity
      ? refused(stopped ? 'disposed' : 'session_expired') : result)
      .finally(() => { if (refreshing === task) refreshing = null; });
    refreshing = task;
    return task.promise;
  }

  // The world listens for this to draw what stands. It never fires in unavailable mode.
  function announce({view, answered}) {
    if (stopped || !answered || view.mode === 'unavailable') return;
    emit({type: 'islet_changed', built: builtPlots(view), signalStationBuilt: view.signalStationBuilt});
    if (stopped) return;
    try { const pending = onView?.({view: structuredClone(view), answered: true}); pending?.catch?.(() => {}); }
    catch { /* Private projection cannot change the accepted event. */ }
  }

  // In local mode the console can reach the fake's dev helpers, for example __isletLocal.dev.failNext('timeout').
  fake?.ready.then(localTransport => {
    if (!stopped) globalThis.__isletLocal = {adapter, dev: localTransport.dev};
  }).catch(() => {});

  const stops = [
    on('plot_clicked', event => openAt(event.plot)),
    on('travel', close),
    on('arrived', event => { if (event.place === HOME_PLACE) refresh(); }),
    adapter.subscribe(announce),
  ];
  const stopIdentity = mode === 'live' ? onSessionChange?.(({signedIn} = {}) => {
    if (stopped) return;
    identity += 1; ticket += 1; opening = false; refreshing = null;
    panel?.dispose(); panel = null;
    if (ownsAdapter) adapter.resetPrivate();
    onPrivateReset?.();
    if (signedIn) void refresh();
  }) : null;
  if (typeof stopIdentity === 'function') stops.push(stopIdentity);

  function stop() {
    if (stopped) return;
    stopped = true;
    identity += 1; ticket += 1; opening = false; refreshing = null;
    for (const stopListening of stops) stopListening();
    panel?.dispose();
    if (ownsAdapter) adapter.dispose();
    if (mode === 'local') delete globalThis.__isletLocal;
  }
  // game.js asks stopPlots.active to know whether the panel is open. The shell opens its pause menu on
  // Escape unless game.js says an overlay is open, so the panel has to be counted there.
  Object.defineProperty(stop, 'active', {get: () => opening || panel?.active === true});
  stop.close = close;
  stop.refresh = refresh;
  stop.open = (plot = 'islet_signal_station') => openAt(plot);
  return stop;
}
