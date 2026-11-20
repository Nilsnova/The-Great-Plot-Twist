import {createDefenseReport, reportSite} from './defense-report.js';
import {addMenuExtras} from '../shell/menu-extras.js';
import {createModal} from '../ui/kit/modal.js';
import {createButton} from '../ui/kit/button.js';
import {node} from '../ui/kit/dom.js';
import './defense-report.css';

const NAMES = {wall: 'Wall', cannon: 'Cannon', mortar: 'Mortar', harpoon: 'Harpoon tower', culverin: 'Culverin', swivel: 'Swivel-gun nest'};
const ENDINGS = {all_sunk: 'All ships sunk', island_lost: 'The island fell', captains_fallen: 'All captains fell', timeout: 'Time ran out'};
export const reportEnding = report => typeof report.survived === 'boolean'
  ? (report.survived ? 'Wave won' : 'Wave lost')
  : report.recovery ? 'Result awaiting confirmation' : ENDINGS[report.reason] ?? 'Wave ended';
const paidLine = payout => payout.status === 'confirmed' ? `Loot confirmed: ${payout.coins} coins.`
  : payout.status === 'refused' ? 'Loot was not confirmed. Check the wave message.'
    : payout.status === 'unknown' ? 'Loot confirmation is not available.' : 'Loot: waiting for confirmation.';
const nameOf = item => `${NAMES[item.kind]} ${item.id.match(/\d+$/)?.[0] ?? ''}`.trim();

// The island controller is the only event source; Pirate Point is deliberately separate.
export function mountDefenseReport({on, container, context, defenses, navigation, menu = addMenuExtras,
  focus = () => {}, resetInput = () => {}} = {}) {
  const report = createDefenseReport(), stops = [];
  let modal = null, runningWave = null, finding = null, locationProblem = false;
  const close = () => {
    finding = null; locationProblem = false;
    if (modal) { modal.dispose(); modal = null; resetInput(); if (!document.querySelector('dialog[open]')) focus(); }
  };
  async function improveBase(waveId, intent) {
    const available = () => !runningWave && report.read(context())?.waveId === waveId && navigation.available(intent);
    if (finding || !available()) { draw(); return; }
    const request = finding = {};
    locationProblem = false;
    draw();
    let destination = null;
    try { destination = await navigation.resolve(intent); } catch { /* Keep the report open. */ }
    if (finding !== request) return;
    finding = null;
    if (!destination || !available()) { locationProblem = true; draw(); return; }
    close(); navigation.go(intent, destination);
  }
  function draw() {
    const value = report.read(context());
    if (!value || !container) { close(); return; }
    const body = node('section', 'defense-report');
    body.setAttribute('aria-label', 'Last defense report');
    body.append(node('p', 'defense-report-result', `Wave ${value.wave} · ${reportEnding(value)}`));
    if (value.survived === false && value.reason !== 'all_sunk' && ENDINGS[value.reason]) {
      body.append(node('p', '', `Observed end: ${ENDINGS[value.reason]}.`));
    }
    const totals = node('div', 'defense-report-totals');
    totals.append(node('p', '', `Heart damage: ${value.heartDamage}`), node('p', '', paidLine(value.payout)));
    body.append(totals, node('p', 'defense-report-note', 'Local report. Earlier actions may be missing.'));
    const site = value.navigation && reportSite(value.structures);
    let improve = null;
    if (site && navigation) {
      const intent = {...value.navigation, ...site};
      const action = node('div', 'defense-report-site');
      action.append(node('strong', '', `${nameOf(site)} ${site.breaks ? 'broke' : 'took damage'}.`));
      if (navigation.available(intent)) {
        improve = createButton({label: 'Improve base', disabled: !!finding,
          onClick: () => void improveBase(value.waveId, intent)}).element;
        improve.classList.add('defense-report-improve');
        action.append(improve);
      } else {
        action.append(node('p', '', 'Inspect this location between waves on your own island.'));
      }
      if (finding || locationProblem) {
        const status = node('p', '', finding ? 'Finding the battle location…' : 'This battle location is no longer available.');
        status.setAttribute('role', 'status'); action.append(status);
      }
      body.append(action);
    }
    const list = node('ul');
    for (const item of value.structures.filter(row => row.taken || row.dealt || row.breaks)) {
      const row = node('li');
      row.append(node('strong', '', nameOf(item)),
        node('p', '', `Hit damage: ${item.taken} · Damage done: ${item.dealt} · Breaks: ${item.breaks}`));
      list.append(row);
    }
    let summary = null;
    if (list.childElementCount) {
      const details = node('details', 'defense-report-structures');
      details.open = modal?.body.querySelector('.defense-report-structures')?.open ?? false;
      summary = node('summary', '', 'Structure details');
      details.append(summary, node('p', 'defense-report-note', 'Hit damage may be greater than health lost.'), list);
      body.append(details);
    } else body.append(node('p', '', 'No building hits were recorded.'));
    if (!modal) {
      resetInput(); modal = createModal({title: 'Last defense report', onCancel: close});
      modal.element.classList.add('defense-report-modal');
    }
    const restoreImprove = document.activeElement?.matches('.defense-report-improve');
    const restoreSummary = document.activeElement?.matches('.defense-report-structures > summary');
    modal.setContent(body); modal.open(container);
    if (restoreImprove) (improve && !improve.disabled ? improve : modal.element.querySelector('button'))?.focus({preventScroll: true});
    if (restoreSummary) summary?.focus({preventScroll: true});
  }
  const clear = () => { report.clear(); runningWave = null; close(); };
  stops.push(on('wave_controller_started', event => {
    if (!event?.flagship) { close(); runningWave = event.waveId;
      report.begin({...event, context: context(), navigation: navigation?.capture(event) ?? null}, defenses(event)); }
  }), on('wave_controller_stopped', event => {
    if (event?.waveId === runningWave) runningWave = null;
    const shown = modal;
    if (shown) queueMicrotask(() => { if (modal === shown) draw(); });
  }),
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
