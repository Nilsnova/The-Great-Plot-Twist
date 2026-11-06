// File-system-safe slide navigation, optional paired notes window and rehearsal clock.
// No network, storage, modules, inline styles or dynamic code execution is needed.
(() => {
  'use strict';
  const slides = Array.from(document.querySelectorAll('.slide'));
  const notesView = new URLSearchParams(location.search).get('view') === 'notes';
  const previous = document.getElementById('previous');
  const next = document.getElementById('next');
  const panel = document.getElementById('notes-panel');
  const progress = document.getElementById('progress');
  let index = 0;
  let notesWindow = null;
  const opener = notesView ? window.opener : null;
  const seconds = slides.map(slide => Number(slide.dataset.seconds));
  const total = seconds.reduce((sum, value) => sum + value, 0);
  const time = value => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  const label = heading => Array.from(heading.childNodes, node => node.nodeName === 'BR' ? ' ' : node.textContent).join('').replace(/\s+/g, ' ').trim();
  const fromHash = () => {
    const match = /^#slide-(\d+)$/.exec(location.hash);
    return match ? Math.max(0, Math.min(slides.length - 1, Number(match[1]) - 1)) : 0;
  };
  function sendState() {
    if (notesWindow && !notesWindow.closed) {
      // file: documents have opaque origins; the receiver verifies the window reference.
      notesWindow.postMessage({type:'g25-state', index}, '*');
    }
  }
  function render(target, {broadcast = true, focus = false} = {}) {
    index = Math.max(0, Math.min(slides.length - 1, target));
    slides.forEach((slide, position) => { slide.hidden = position !== index; });
    const active = slides[index];
    const heading = active.querySelector('h1,h2');
    const headingName = label(heading);
    document.getElementById('counter').textContent = `${String(index + 1).padStart(2, '0')} / ${slides.length}`;
    document.getElementById('announcement').textContent = `Slide ${index + 1}: ${headingName}`;
    progress.max = slides.length;
    progress.value = index + 1;
    previous.disabled = index === 0;
    next.disabled = index === slides.length - 1;
    document.title = `${notesView ? 'Notes · ' : ''}${index + 1}. ${headingName} · G25`;
    // Same-document history avoids jumping the slide beneath the toolbar.
    const fragment = `#slide-${index + 1}`;
    if (location.hash !== fragment) {
      try { history.replaceState(null, '', fragment); }
      catch { location.hash = fragment; window.scrollTo(0, 0); }
    }
    if (notesView) {
      document.getElementById('notes-title').textContent = headingName;
      document.getElementById('notes-copy').replaceChildren(active.querySelector('template').content.cloneNode(true));
      const elapsedTarget = seconds.slice(0, index).reduce((sum, value) => sum + value, 0);
      document.getElementById('slide-timing').textContent = `${time(seconds[index])} on this slide · target ${time(elapsedTarget)}–${time(elapsedTarget + seconds[index])} · ${time(total)} total`;
      document.getElementById('up-next').textContent = slides[index + 1] ? label(slides[index + 1].querySelector('h2')) : 'End of deck — hand over to the separate G11 demo or questions.';
      document.getElementById('pair-status').textContent = opener && !opener.closed ? 'Paired with the audience window.' : 'Standalone notes view. Open “Speaker notes” from the audience view to pair navigation.';
    }
    if (focus) heading.focus({preventScroll:true});
    if (broadcast) {
      if (notesView && opener && !opener.closed) opener.postMessage({type:'g25-navigate', index}, '*');
      else sendState();
    }
  }
  const step = delta => render(index + delta, {focus:!notesView});
  previous.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  document.getElementById('deck').addEventListener('click', event => {
    if (notesView || event.target.closest('a,button,input,select,textarea') || window.getSelection()?.toString()) return;
    step(1);
  });
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest('input,textarea,select,[contenteditable=true]')) return;
    if (event.target.closest('a') && [' ', 'Enter'].includes(event.key)) return;
    // Arrow navigation must keep working after a click focuses a navigation button.
    const button = event.target.closest('button');
    if (button && (!['previous','next'].includes(button.id) || [' ', 'Enter'].includes(event.key))) return;
    const moves = {ArrowRight:1, ArrowDown:1, PageDown:1, ' ':1, Enter:1, ArrowLeft:-1, ArrowUp:-1, PageUp:-1};
    if (event.key in moves) { event.preventDefault(); step(moves[event.key]); }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); render(event.key === 'Home' ? 0 : slides.length - 1, {focus:!notesView});
    }
  });
  window.addEventListener('hashchange', () => {
    if (fromHash() !== index) render(fromHash());
  });
  const notesLink = document.getElementById('notes-link');
  notesLink.addEventListener('click', event => {
    if (notesView) return;
    event.preventDefault();
    const url = new URL(location.href);
    url.searchParams.set('view', 'notes');
    notesWindow = window.open(url.href, 'g25-speaker-notes');
    if (!notesWindow) document.getElementById('announcement').textContent = 'Notes window blocked. Allow this local page to open a second window, or open the notes link in another tab.';
  });
  window.addEventListener('message', event => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (notesView) {
      if (event.source !== opener || data.type !== 'g25-state') return;
    } else {
      if (!notesWindow || event.source !== notesWindow) return;
      if (data.type === 'g25-ready') { sendState(); return; }
      if (data.type !== 'g25-navigate') return;
    }
    if (Number.isInteger(data.index) && data.index >= 0 && data.index < slides.length) render(data.index, {broadcast:false});
  });
  document.getElementById('print').addEventListener('click', () => window.print());
  let screenTitle = '';
  window.addEventListener('beforeprint', () => {
    screenTitle = document.title;
    document.title = 'The Great Plot Twist · Class presentation';
  });
  window.addEventListener('afterprint', () => { if (screenTitle) document.title = screenTitle; });
  let accumulated = 0;
  let runningSince = null;
  const clock = document.getElementById('clock');
  const toggle = document.getElementById('clock-toggle');
  const elapsed = () => accumulated + (runningSince === null ? 0 : performance.now() - runningSince);
  const tick = () => { clock.textContent = time(Math.floor(elapsed() / 1000)); };
  toggle.addEventListener('click', () => {
    if (runningSince === null) { runningSince = performance.now(); toggle.textContent = 'Pause timer'; }
    else { accumulated = elapsed(); runningSince = null; toggle.textContent = 'Resume timer'; }
    tick();
  });
  document.getElementById('clock-reset').addEventListener('click', () => {
    accumulated = 0; runningSince = null; toggle.textContent = 'Start timer'; tick();
  });
  if (notesView) {
    document.body.classList.add('notes-view');
    document.getElementById('workspace').classList.add('notes-layout');
    panel.hidden = false;
    notesLink.hidden = true;
    setInterval(tick, 250);
  }
  render(fromHash());
  if (opener && !opener.closed) opener.postMessage({type:'g25-ready'}, '*');
})();
