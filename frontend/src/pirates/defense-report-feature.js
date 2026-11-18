import {createDefenseReport} from './defense-report.js';
import {addMenuExtras} from '../shell/menu-extras.js';
import {createModal} from '../ui/kit/modal.js';
import {node} from '../ui/kit/dom.js';

const NAMES = {wall: 'Wall', cannon: 'Cannon', mortar: 'Mortar', harpoon: 'Harpoon tower', culverin: 'Culverin', swivel: 'Swivel-gun nest'};
const ENDINGS = {all_sunk: 'All ships sunk', island_lost: 'The island fell', captains_fallen: 'All captains fell', timeout: 'Time ran out'};
export const reportEnding = report => typeof report.survived === 'boolean'
  ? (report.survived ? 'Wave won' : 'Wave lost')
  : report.recovery ? 'Result awaiting confirmation' : ENDINGS[report.reason] ?? 'Wave ended';
const paidLine = payout => payout.status === 'confirmed' ? `Loot confirmed: ${payout.coins} coins.`
  : payout.status === 'refused' ? 'Loot was not confirmed. Check the wave message.'
    : payout.status === 'unknown' ? 'Loot confirmation is not available.' : 'Loot: waiting for confirmation.';

// The island controller is the only event source; Pirate Point is deliberately separate.
export function mountDefenseReport({on, container, context, defenses, menu = addMenuExtras, focus = () => {}, resetInput = () => {}} = {}) {
  const report = createDefenseReport(), stops = [];
  let modal = null, runningWave = null;
  const close = () => { if (modal) { modal.dispose(); modal = null; resetInput(); if (!document.querySelector('dialog[open]')) focus(); } };
  function draw() {
    const value = report.read(context());
    if (!value || !container) { close(); return; }
    const body = node('section', 'defense-report');
    body.setAttribute('aria-label', 'Last defense report');
    body.append(node('p', '', `Wave ${value.wave} · ${reportEnding(value)}`),
      node('p', '', 'Local report. Earlier actions may be missing.'),
      node('p', '', 'Hit damage may be greater than health lost.'),
      node('p', '', `Heart damage: ${value.heartDamage}`), node('p', '', paidLine(value.payout)));
    const list = node('ul');
    for (const item of value.structures.filter(row => row.taken || row.dealt || row.breaks)) {
      const number = item.id.match(/\d+$/)?.[0] ?? '';
      const row = node('li');
      row.append(node('strong', '', `${NAMES[item.kind]} ${number}`),
        node('p', '', `Hit damage: ${item.taken} · Damage done: ${item.dealt} · Breaks: ${item.breaks}`));
      list.append(row);
    }
    body.append(list.childElementCount ? list : node('p', '', 'No building hits were recorded.'));
    if (!modal) { resetInput(); modal = createModal({title: 'Last defense report', onCancel: close}); }
    modal.setContent(body); modal.open(container);
  }
  const clear = () => { report.clear(); runningWave = null; close(); };
  stops.push(on('wave_controller_started', event => {
    if (!event?.flagship) { close(); runningWave = event.waveId; report.begin({...event, context: context()}, defenses()); }
  }), on('wave_controller_stopped', event => { if (event?.waveId === runningWave) runningWave = null; }),
  on('travel', clear), on('game_started', event => { if (event?.fresh) clear(); }));
  stops.push(menu(() => !runningWave && report.read(context()) ? [{label: 'Last defense report', onSelect: draw}] : []));
  return {
    events(batch = []) { report.events(batch); if (batch.some(event => event?.type === 'wave_ended')) runningWave = null; if (modal) draw(); },
    confirmed(waveId, coins, survived) {
      report.payout(waveId, {status: 'confirmed', coins, survived});
      if (typeof survived === 'boolean' && runningWave === waveId) runningWave = null;
      if (modal) draw();
    },
    refused(waveId, error) {
      if (error?.code === 'wave_too_early') return;
      report.payout(waveId, {status: error?.status >= 400 && error?.status < 500 ? 'refused' : 'unknown'});
      if (modal) draw();
    },
    read: () => report.read(context()),
    get active() { return !!modal; },
    dispose() { for (const stop of stops) stop?.(); clear(); },
  };
}
