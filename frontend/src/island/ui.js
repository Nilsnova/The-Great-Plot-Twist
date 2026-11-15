// The island's DOM: one small card at a time (a build spot, the crew, the captain, the harbor bell, Play
// with a friend, the captains here, the game's lobby), the countdown
// banner and the visit banner. It shows models from card-model.js and calls back; it decides nothing.
// Built on the UI kit's modal and button (the one brass panel); toasts go through the game's one toast
// queue (src/ui/toasts.js).
import './island.css';
import {createModal} from '../ui/kit/modal.js';
import {createTabs} from '../ui/kit/tabs.js';
import {node} from '../ui/kit/dom.js';
import {drawQr} from '../lib/qr/index.js';
import {CAPTAIN_PALETTES} from '../art/people.js';
import {toasts as gameToasts} from '../ui/toasts.js';
import {crewLabel, progressLines} from './progression.js';
import {drawArsenal} from './arsenal-ui.js';
import {drawSkills, drawTech, iconOf} from './skill-tree.js';

// The cards of the island's buildings: a spot's build or upgrade card (houses too), the wreck, the Harbor and
// the arsenal. They dock at the right side on a desktop and come up as a bottom sheet on a phone
// (island.css), so the island stays in view; the menus (crew, captain, lobby, invite) stay centred. The Tech
// hub is a big centred tree card like the captain's skills (skill-tree.js), so it is not docked.
export const DOCKED = new Set(['build', 'wreck', 'harbor', 'arsenal']);

function button(label, onClick, quiet = false) {
  const element = node('button', `kit-button${quiet ? ' kit-quiet' : ''}`, label); element.type = 'button';
  element.addEventListener('click', onClick);
  return element;
}

export function createIslandUi({container, focus = () => {}, resetInput = () => {}, toasts = gameToasts} = {}) {
  let modal = null, kind = null, render = null, disposed = false, lastToast = null;
  // The Tech hub tile the player tapped (kept while the page lives); the tree shows its detail.
  let techPicked = null;
  const banner = node('div', 'island-banner'); banner.setAttribute('role', 'status'); banner.setAttribute('aria-live', 'polite'); banner.hidden = true;
  const bannerEyebrow = node('span', 'island-banner-eyebrow', 'Harbor bell'), bannerText = node('strong', 'island-banner-text');
  bannerEyebrow.setAttribute('aria-hidden', 'true');
  banner.append(bannerEyebrow, bannerText);
  const visit = node('div', 'island-visit'); visit.hidden = true;
  container.append(banner, visit);

  function close() {
    if (!modal) return false;
    const current = modal; modal = null; kind = null; render = null;
    current.dispose(); resetInput(); focus();
    return true;
  }
  // Opens (or re-renders) the card of one kind. draw(body) fills it and returns the element to focus.
  function open(nextKind, title, draw) {
    if (disposed) return;
    resetInput();
    if (modal && kind !== nextKind) close();
    if (!modal) {
      modal = createModal({title, onCancel: close});
      modal.element.classList.add('island-card', `island-card-${nextKind}`);
      // The island's own cards dock at the side (a bottom sheet on phones), so the island stays in view.
      if (DOCKED.has(nextKind)) modal.element.classList.add('island-card-docked');
      kind = nextKind;
    }
    modal.setTitle(title);
    render = () => {
      const body = node('div', 'island-card-body');
      const target = draw(body);
      const had = modal.element.contains(document.activeElement) ? document.activeElement?.dataset?.focus : null;
      modal.setContent(body);
      return {target, had, body};
    };
    const {target, had, body} = render();
    if (!modal.element.open) modal.open(container, target);
    else (had ? body.querySelector(`[data-focus="${had}"]`) ?? target : target)?.focus?.({preventScroll: true});
  }

  // Level pips: ■■□ (filled up to the level), read out as "Level 2 of 3".
  function pips(list) {
    const row = node('p', 'island-pips');
    row.setAttribute('aria-label', `Level ${list.filter(Boolean).length} of ${list.length}`);
    for (const on of list) { const pip = node('span', `island-pip${on ? ' is-on' : ''}`); pip.setAttribute('aria-hidden', 'true'); row.append(pip); }
    return row;
  }
  const line = (className, text, role) => { const element = node('p', className, text ?? ''); element.hidden = !text; if (role) element.setAttribute('role', role); return element; };
  // The parts every card shares: the reason a button is off, the small "Coming soon" line, the server's
  // plain message and the balance.
  function footer(body, model, act) {
    const reason = line('island-reason', model.reason);
    if (model.reason && act) { reason.id = `island-reason-${model.spotId ?? model.title.replace(/\W+/g, '-').toLowerCase()}`; act.setAttribute('aria-describedby', reason.id); }
    body.append(reason, line('island-soon', model.soon), line('island-message', model.message, 'alert'), line('island-coins', model.coins));
  }

  // handlers: {build(spotId, kind), upgrade(spotId), repair(spotId), hire(), specialise(spotId, spec), demolish(spotId), move(spotId)}
  function buildCard(model, handlers) {
    const on = typeof handlers === 'function' ? {build: handlers} : handlers ?? {};
    open('build', model.title, body => {
      let focusable = null;
      body.append(line('island-purpose', model.purpose));
      if (model.pips.length) { const row = node('div', 'island-level'); row.append(pips(model.pips), line('island-stats', model.stats)); body.append(row); }
      if (model.owner) body.append(line('island-owner', model.owner));
      let act = null;
      if (model.mode === 'choose') {
        const list = node('div', 'island-choices');
        for (const choice of model.choices) {
          const option = node('button', 'island-choice'); option.type = 'button'; option.dataset.focus = `choice-${choice.kind}`; option.dataset.kind = choice.kind;
          option.disabled = choice.disabled;
          if (choice.locked) option.classList.add('is-locked');
          const head = node('span', 'island-choice-head'); head.append(node('strong', '', choice.busy ? 'Building…' : choice.name), node('span', 'island-choice-price', choice.price));
          option.append(head, node('span', 'island-choice-line', choice.line));
          if (choice.reason) option.append(node('span', 'island-choice-reason', choice.reason));
          option.addEventListener('click', () => on.build?.(model.spotId, choice.kind));
          list.append(option); focusable ??= choice.disabled ? null : option;
        }
        body.append(list);
      } else if (model.mode === 'build') {
        // The price is on the button ("Build · 🪙 10"), so it is not repeated above it.
        act = button(model.button, () => on.build?.(model.spotId, model.kind)); act.dataset.focus = 'build'; act.disabled = model.disabled;
        body.append(act);
      } else if (model.mode === 'upgrade') {
        const next = node('div', 'island-next');
        next.append(node('strong', 'island-next-label', model.upgrade.label), node('span', 'island-next-stats', model.upgrade.stats));
        act = button(model.button, () => on.upgrade?.(model.spotId)); act.dataset.focus = 'upgrade'; act.disabled = model.disabled;
        body.append(next, act);
      } else if (model.mode === 'repair') {
        // D039 (wall-recovery.js): a damaged or destroyed wall, its health and its Repair or Rebuild.
        const next = node('div', 'island-next');
        next.append(node('strong', 'island-next-label', model.upgrade.label), node('span', 'island-next-stats', model.upgrade.stats));
        act = button(model.button, () => on.repair?.(model.spotId)); act.dataset.focus = 'repair'; act.disabled = model.disabled;
        body.append(next, act);
      }
      if (act && !act.disabled) focusable = act;
      footer(body, model, act);
      if (model.locked) body.classList.add('is-locked');
      // GAME-V3.md §5: the tower's skill, chosen once its kind is researched at the Tech hub; a house's role the same way.
      if (model.skills) {
        const box = node('section', `island-skills-pick${model.skills.role ? ' is-roles' : ''}`); box.setAttribute('aria-label', model.skills.title);
        box.append(node('h3', 'island-skills-title', model.skills.title), line('island-skills-line', model.skills.line));
        if (model.skills.choices.length) {
          const list = node('div', 'island-spec-list'); list.setAttribute('role', 'group'); list.setAttribute('aria-label', model.skills.role ? 'House roles' : 'Tower skills');
          for (const choice of model.skills.choices) {
            const option = node('button', `island-spec${choice.active ? ' is-active' : ''}`); option.type = 'button';
            option.dataset.focus = `spec-${choice.id}`; option.dataset.spec = choice.id; option.disabled = choice.disabled;
            option.setAttribute('aria-pressed', String(choice.active));
            const icon = node('span', 'island-spec-icon', iconOf(choice.id)); icon.setAttribute('aria-hidden', 'true');
            option.append(icon, node('strong', '', choice.busy ? 'Picking…' : choice.name), node('span', 'island-spec-line', choice.line));
            // D051: a tower skill's price badge (none on the active one or a house role) and a short "Need 🪙 40".
            if (choice.price) option.append(node('span', 'island-spec-cost', choice.price));
            if (choice.reason) option.append(node('span', 'island-spec-why', choice.reason));
            if (choice.label) option.setAttribute('aria-label', choice.label);
            if (choice.active) option.append(node('span', 'island-spec-mark', '✓'));
            option.addEventListener('click', () => on.specialise?.(model.spotId, choice.id));
            list.append(option);
          }
          box.append(list);
        }
        body.append(box);
      }
      if (model.hire && on.hire) {
        const hire = button('Hire crew', () => on.hire(), true); hire.classList.add('island-hire'); hire.dataset.focus = 'hire';
        body.append(hire); focusable ??= hire;
      }
      // T36: Move, secondary: the card closes and the move bar (move-bar.js) takes over.
      if (model.move && on.move) {
        const shift = button(model.move.label, () => on.move(model.spotId), true); shift.classList.add('island-move');
        shift.dataset.focus = 'move'; shift.disabled = model.move.disabled;
        body.append(shift);
        if (model.move.reason) {
          const why = line('island-move-why', model.move.reason); why.id = `island-move-why-${model.spotId}`;
          shift.setAttribute('aria-describedby', why.id); body.append(why);
        }
      }
      // GAME-V3.md §4.2: Tear down, secondary and red-outlined, never the focus the card opens with.
      if (model.demolish && on.demolish) {
        const tear = button(model.demolish.label, () => on.demolish(model.spotId), true); tear.classList.add('island-teardown');
        tear.dataset.focus = 'demolish'; tear.disabled = model.demolish.disabled;
        body.append(tear);
        if (model.demolish.reason) {
          const why = line('island-teardown-why', model.demolish.reason); why.id = `island-teardown-why-${model.spotId}`;
          tear.setAttribute('aria-describedby', why.id); body.append(why);
        }
      }
      return focusable;
    });
  }
  // GAME-V3.md §4.2: "Tear down this Cannon (level 3)?" with who gets what back. handlers: {confirm(), keep()}.
  // "Keep it" takes the focus; Escape closes the card and keeps the building.
  function demolishCard(model, handlers = {}) {
    open('demolish', model.title, body => {
      body.append(line('island-purpose island-demolish-question', model.question));
      if (model.lines.length) {
        const list = node('ul', 'island-refunds'); list.setAttribute('aria-label', 'Coins back');
        for (const text of model.lines) list.append(node('li', 'island-refund', text));
        body.append(list);
      }
      body.append(line('island-demolish-note', model.note), line('island-demolish-after', model.after));
      const row = node('div', 'island-demolish-actions');
      const keep = button(model.keep, () => handlers.keep?.(), true); keep.dataset.focus = 'keep';
      const go = button(model.button, () => handlers.confirm?.()); go.dataset.focus = 'confirm'; go.disabled = model.disabled;
      go.classList.add('island-teardown-confirm');
      row.append(keep, go);
      body.append(row, line('island-message', model.message, 'alert'));
      return keep;
    });
  }
  // --- the campaign's buildings (GAME-V3.md §4, §5) ---
  // A card for a building that is not open yet: its line says "Opens after wave N." and nothing more.
  function lockedNote(body, model) {
    const note = node('div', 'island-campaign-locked');
    const lock = node('span', 'island-campaign-lock', '🔒'); lock.setAttribute('aria-hidden', 'true');
    note.append(lock, node('strong', '', model.line));
    body.append(note);
  }
  // handlers: {open(stall)}: the market stall ('market') or the match board ('match').
  function harborCard(model, handlers = {}) {
    open('harbor', model.title, body => {
      if (!model.open) { lockedNote(body, model); return null; }
      let focusable = null;
      body.append(line('island-purpose', model.line));
      const list = node('ul', 'island-stalls');
      for (const stall of model.stalls) {
        const item = node('li', `island-stall${stall.open ? '' : ' is-locked'}`); item.dataset.stall = stall.id;
        const text = node('div', 'island-stall-text');
        text.append(node('strong', '', stall.name), node('p', 'island-stall-line', stall.line));
        if (stall.reason) text.append(node('p', 'island-stall-reason', stall.reason));
        item.append(text);
        if (stall.open) {
          const go = button(stall.button, () => handlers.open?.(stall.id)); go.dataset.focus = `stall-${stall.id}`;
          item.append(go); focusable ??= go;
        }
        list.append(item);
      }
      body.append(list);
      return focusable;
    });
  }
  // handlers: {research({branch, tier, choice, change})}. GAME-V3.md §5.1: one small tree per tower kind (tier 1
  // at the root, tiers 2 and 3 a fork of two), drawn by skill-tree.js; a tap on a tile shows it in the detail panel.
  function techCard(model, handlers = {}) {
    open('tech', model.title, body => {
      modal.element.classList.add('island-card-wide');
      const view = {picked: techPicked, research: action => handlers.research?.(action), locked: box => lockedNote(box, model),
        select: id => { techPicked = id; techCard(model, handlers); }};
      return drawTech(body, model, view, {button, line});
    });
  }
  // handlers: {give(amount)}
  function wreckCard(model, handlers = {}) {
    open('wreck', model.title, body => {
      if (!model.open) { lockedNote(body, model); return null; }
      let focusable = null;
      body.append(line('island-purpose', model.line));
      const bar = node('div', 'island-wreck-bar'); bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(model.goal)); bar.setAttribute('aria-valuenow', String(model.paid));
      bar.setAttribute('aria-label', `Repair: ${model.progress}`);
      const fill = node('span', 'island-wreck-fill'); fill.style.width = `${model.percent}%`; bar.append(fill);
      body.append(bar, node('p', 'island-wreck-progress', `${model.percent}% · ${model.progress}`));
      if (model.done) body.append(node('p', 'island-wreck-done', 'Repaired, sailing opens later'));
      const row = node('div', 'island-wreck-gifts');
      for (const gift of model.gifts) {
        const go = button(gift.label, () => handlers.give?.(gift.amount)); go.dataset.focus = `gift-${gift.amount}`; go.disabled = gift.disabled;
        row.append(go); focusable ??= gift.disabled ? null : go;
      }
      if (model.gifts.length) body.append(row);
      const reason = model.gifts.find(gift => gift.reason)?.reason ?? '';
      body.append(line('island-reason', reason), line('island-message', model.message, 'alert'), line('island-coins', model.coins));
      return focusable;
    });
  }
  // The arsenal (T41, D042): handlers {take(copyId), giveBack(), buy(typeId)}; drawn by arsenal-ui.js.
  function arsenalCard(model, handlers = {}) {
    const opened = new Set(kind === 'arsenal' ? [...modal.element.querySelectorAll('[data-compare][open]')].map(node => node.dataset.compare) : []);
    open('arsenal', model.title, body => {
      const target = drawArsenal(body, model, handlers, {button, line});
      for (const detail of body.querySelectorAll('[data-compare]')) detail.open = opened.has(detail.dataset.compare);
      return target;
    });
  }
  function crewCard(model, onHire) {
    open('crew', model.title, body => {
      let focusable = null;
      body.append(line('island-purpose', model.lead));
      const list = node('ul', 'island-crew');
      for (const row of model.rows) {
        const item = node('li', 'island-crew-row'); item.dataset.crew = row.id;
        const text = node('div', 'island-crew-text');
        const head = node('p', 'island-crew-head'); head.append(node('strong', '', row.name), node('span', 'island-crew-owned', row.owned));
        if (row.icon) head.prepend(node('span', 'island-crew-icon', row.icon)), head.append(node('span', 'island-crew-price', row.price)); // D052: a compact tile
        text.append(head);
        if (row.line) text.append(node('p', 'island-crew-line', row.line));
        if (row.reason) text.append(node('p', 'island-crew-reason', row.reason));
        const hire = button(`${row.button}${row.button === 'Hire' ? ` · ${row.price}` : ''}`, () => onHire(row.id)); hire.dataset.focus = `hire-${row.id}`;
        hire.disabled = row.disabled; hire.setAttribute('aria-label', `${row.button} ${row.name}, ${row.price}`);
        item.append(text, hire); list.append(item);
        focusable ??= row.disabled ? null : hire;
      }
      body.append(list);
      body.append(line('island-soon', model.soon), line('island-message', model.message, 'alert'), line('island-coins', model.coins));
      const done = button('Done', close, true); done.dataset.focus = 'done'; body.append(done);
      return focusable ?? done;
    });
  }
  // Menu › Captain and skills (§10, §14, §15): three tabs. model: {tab, captain, skills, weapons} of
  // card-model.js (or a lone captainModel); handlers: {upgrade(), tab(id), pick(id), learn(id), buy(id), equip(id)}.
  function captainCard(model, handlers) {
    const on = typeof handlers === 'function' ? {upgrade: handlers} : handlers ?? {};
    const parts = model?.captain ? model : {captain: model, skills: null, weapons: null, tab: 'captain'};
    open('captain', 'Captain and skills', body => {
      let focusable = null;
      const musket = node('div', 'island-captain-musket');
      focusable = musketPart(musket, parts.captain, on);
      if (!parts.skills && !parts.weapons) { modal.element.classList.remove('island-card-wide'); body.append(...musket.childNodes); return closing(body, focusable); }
      const items = [{id: 'captain', label: 'Captain', body: musket}];
      if (parts.skills) items.push({id: 'skills', label: parts.skills.points > 0 ? `Skills (${parts.skills.points})` : 'Skills', body: drawSkills(parts.skills, on, {button, line})});
      if (parts.weapons) items.push({id: 'weapons', label: 'Weapons', body: weaponsPart(parts.weapons, on)});
      const selected = Math.max(0, items.findIndex(item => item.id === parts.tab));
      // The skill tree takes most of the screen; the other tabs keep the small card.
      const wide = id => modal?.element.classList.toggle('island-card-wide', id === 'skills');
      const tabs = createTabs({items, selected, onChange: id => { wide(id); on.tab?.(id); }});
      tabs.element.classList.add('island-captain-tabs');
      tabs.element.querySelectorAll('.kit-tab').forEach((tab, index) => { tab.dataset.focus = `tab-${items[index].id}`; });
      body.append(tabs.element);
      const done = closing(body, null);
      // The Skills tab opens on the picked tile (scrolled into view on a phone), the others on their tab.
      const tile = items[selected].id === 'skills' ? body.querySelector('.island-node.is-picked') : null;
      return items[selected].id === 'captain' ? focusable ?? done : tile ?? tabs.element.querySelectorAll('.kit-tab')[selected];
    });
  }
  function closing(body, focusable) {
    const done = button('Done', close, true); done.dataset.focus = 'done'; body.append(done);
    return focusable ?? done;
  }
  // The musket's level and its upgrade (§10).
  function musketPart(body, model, on) {
    const row = node('div', 'island-level'); row.append(pips(model.pips), line('island-stats', `Musket · ${model.stats}`));
    body.append(row, line('island-hint', model.hint));
    let act = null;
    if (model.upgrade) {
      const next = node('div', 'island-next');
      next.append(node('strong', 'island-next-label', model.upgrade.label), node('span', 'island-next-stats', model.upgrade.stats));
      act = button(model.button, () => on.upgrade?.()); act.dataset.focus = 'upgrade'; act.disabled = model.disabled;
      body.append(next, act);
    }
    footer(body, model, act);
    return act && !act.disabled ? act : null;
  }
  // The weapon shop (§15): buy once, equip one.
  function weaponsPart(model, on) {
    const part = node('div', 'island-weapons');
    const list = node('ul', 'island-crew island-shop');
    for (const row of model.rows) {
      const item = node('li', `island-crew-row island-weapon${row.equipped ? ' is-equipped' : ''}`); item.dataset.weapon = row.id;
      const text = node('div', 'island-crew-text');
      const head = node('p', 'island-crew-head');
      head.append(node('strong', '', row.name), node('span', 'island-crew-owned', row.equipped ? 'Equipped' : row.owned ? 'Yours' : row.priceText));
      text.append(head, node('p', 'island-crew-line', row.line));
      if (row.reason) text.append(node('p', 'island-crew-reason', row.reason));
      const act = button(row.button, () => (row.action === 'equip' ? on.equip?.(row.id) : row.action === 'buy' ? on.buy?.(row.id) : null));
      act.dataset.focus = `weapon-${row.id}`; act.disabled = row.disabled;
      act.setAttribute('aria-label', `${row.button} ${row.name}`);
      item.append(text, act); list.append(item);
    }
    part.append(line('island-purpose', model.lead), list, line('island-message', model.message, 'alert'), line('island-coins', model.coins));
    return part;
  }
  function captainsCard(model) {
    open('captains', model.title, body => {
      const list = node('ul', 'island-tags');
      for (const name of model.names) list.append(node('li', 'island-tag', name));
      list.hidden = !model.names.length;
      body.append(list, line('island-purpose', model.line));
      const done = button('Done', close, true); done.dataset.focus = 'done'; body.append(done);
      return done;
    });
  }
  // T45: "This island" milestones (from progression.js), shown above the ranking when known.
  function progressPanel(progress) {
    const panel = node('section', 'island-progress'); panel.setAttribute('aria-label', 'This island');
    const text = progressLines(progress);
    panel.append(node('p', 'island-progress-title', 'This island'), node('strong', 'island-progress-best', text.headline),
      line('island-purpose', text.detail), line('island-purpose', text.next));
    return panel;
  }
  // The two boards. aria-pressed tells a screen reader which one is shown.
  function scopeTabs(scope, choose) {
    const tabs = node('div', 'island-leaderboard-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Leaderboard period');
    for (const [value, label] of [['week', 'This week'], ['all', 'All time']]) {
      const tab = button(label, () => { if (value !== scope) choose(value); }, value !== scope);
      tab.setAttribute('aria-pressed', String(value === scope)); tabs.append(tab);
    }
    return tabs;
  }
  // actions: {retry, choose(scope)}; a plain function is the T7 retry alone.
  function leaderboardCard({data = null, loading = false, message = '', scope = 'week', progress = null}, actions) {
    const {retry, choose = () => {}} = typeof actions === 'function' ? {retry: actions} : actions;
    open('leaderboard', 'Leaderboard', body => {
      if (progress) body.append(progressPanel(progress));
      body.append(scopeTabs(scope, choose));
      body.append(line('island-purpose', scope === 'all' ? 'Best wave ever won on each island. Never resets.' : 'Resets each Monday at 00:00 UTC.'));
      if (data) {
        const headings = node('div', 'island-leaderboard-labels'); headings.setAttribute('aria-hidden', 'true');
        headings.append(node('span', '', 'Island'), node('span', '', 'Wave')); body.append(headings);
        const list = node('ol', 'island-leaderboard'); list.setAttribute('aria-label', 'Island results');
        for (const row of data.entries) {
          const item = node('li', `island-leaderboard-row${row.rank <= 3 ? ` is-rank-${row.rank}` : ''}`);
          const rank = node('span', 'island-leaderboard-rank', String(row.rank));
          rank.setAttribute('aria-label', `Rank ${row.rank}`);
          const name = node('strong', 'island-leaderboard-name', row.name);
          name.setAttribute('aria-label', `${row.name}'s island`);
          const wave = node('span', 'island-leaderboard-wave', String(row.wave));
          wave.setAttribute('aria-label', `Wave ${row.wave}`);
          const who = node('span', 'island-leaderboard-who'); who.append(name);
          const crew = crewLabel(row.crew); // Solo / Crew of 3; one shared ranking either way
          if (crew) who.append(node('span', 'island-leaderboard-crew', crew));
          item.append(rank, who, wave);
          list.append(item);
        }
        const empty = scope === 'all' ? 'No waves won yet.' : 'No waves won this week.';
        body.append(list, line('island-purpose', data.entries.length ? 'Equal waves share a rank; the first to reach it is listed first.' : empty));
      }
      body.append(line('island-purpose', loading ? 'Loading…' : '', 'status'), line('island-message', message, 'alert'));
      const refresh = button(message ? 'Try again' : 'Refresh', retry, true); refresh.disabled = loading; refresh.dataset.focus = 'refresh';
      body.append(refresh);
      return null; // Start at the close button so a long phone list opens at its beginning.
    });
  }
  function bellCard(model, onAction) {
    open('bell', model.title, body => {
      const line = node('p', 'island-purpose', model.line);
      const act = button(model.button, () => onAction(model.action)); act.dataset.focus = 'bell'; act.disabled = model.disabled;
      const message = node('p', 'island-message', model.message); message.hidden = !model.message; message.setAttribute('role', 'alert');
      body.append(line, act, message);
      return model.disabled ? null : act;
    });
  }
  // Copy the link: the clipboard when allowed, otherwise the link is selected for the player to copy.
  async function copyLink(field, status) {
    let copied = false;
    try { await globalThis.navigator?.clipboard?.writeText(field.value); copied = !!globalThis.navigator?.clipboard; } catch { copied = false; }
    if (!copied) { field.focus(); field.select(); try { copied = document.execCommand?.('copy') === true; } catch { copied = false; } }
    status.textContent = copied ? 'Link copied. Send it to your friend in a message.' : 'The link is selected. Copy it and send it to your friend.';
    status.hidden = false;
    return copied;
  }
  function inviteCard(model) {
    open('invite', model.title, body => {
      const lead = node('p', 'island-lead', model.lead);
      const field = node('input', 'island-link'); field.type = 'text'; field.readOnly = true; field.value = model.url; field.hidden = !model.url;
      field.setAttribute('aria-label', 'Invite link'); field.addEventListener('focus', () => field.select());
      const status = line('island-copied', ''); status.setAttribute('role', 'status');
      const copy = button(model.copy, () => void copyLink(field, status)); copy.dataset.focus = 'copy'; copy.hidden = !model.url;
      const canvas = node('canvas', 'island-qr'); canvas.hidden = !model.url;
      if (model.url) {
        canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `QR code for ${model.url}`);
        try { drawQr(canvas, model.url, {scale: 5, margin: 3, ecc: 'M'}); } catch { canvas.hidden = true; }
      }
      const share = node('div', 'island-share'); share.append(field, copy);
      const code = node('p', 'island-code-small', model.url ? `Island code ${model.code}` : model.code);
      const done = button('Done', close, true); done.dataset.focus = 'done';
      body.append(lead, share, status, canvas, line('island-purpose', model.line), code, done);
      return model.url ? copy : done;
    });
  }
  // The lobby of a game (GAME-V3.md §2): the code, the link with Copy and its QR (as the invite card), the
  // players with who is online, and Start (the host, or anyone once the host has been away for 60 s).
  function lobbyCard(model, {start = () => {}} = {}) {
    open('lobby', model.title, body => {
      const code = node('p', 'island-lobby-code', model.code); code.setAttribute('aria-label', `Game code ${model.code}`);
      const field = node('input', 'island-link'); field.type = 'text'; field.readOnly = true; field.value = model.url; field.hidden = !model.url;
      field.setAttribute('aria-label', 'Game link'); field.addEventListener('focus', () => field.select());
      const status = line('island-copied', ''); status.setAttribute('role', 'status');
      const copy = button(model.copy, () => void copyLink(field, status)); copy.dataset.focus = 'copy'; copy.hidden = !model.url;
      const share = node('div', 'island-share'); share.append(field, copy);
      const canvas = node('canvas', 'island-qr island-lobby-qr'); canvas.hidden = !model.url;
      if (model.url) {
        canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `QR code for ${model.url}`);
        try { drawQr(canvas, model.url, {scale: 4, margin: 3, ecc: 'M'}); } catch { canvas.hidden = true; }
      }
      const head = node('p', 'island-lobby-count', [model.count, model.online].filter(Boolean).join(' · '));
      const list = node('ul', 'island-lobby-players');
      for (const row of model.rows) {
        const item = node('li', `island-lobby-player${row.online ? ' is-online' : ''}`); item.dataset.player = row.id;
        const dot = node('span', 'island-lobby-dot'); dot.setAttribute('aria-hidden', 'true');
        // The captain's colour (coat and hat band, src/art/people.js), the same on the island and in waves.
        const pal = CAPTAIN_PALETTES[row.colour] ?? CAPTAIN_PALETTES[0];
        const swatch = node('span', 'island-lobby-colour'); swatch.setAttribute('aria-hidden', 'true'); item.dataset.colour = String(row.colour);
        swatch.style.setProperty('--coat', pal.coat); swatch.style.setProperty('--band', pal.band); swatch.style.setProperty('--hat', pal.hat);
        const name = node('span', 'island-lobby-name', `${row.name}${row.you ? ' (you)' : ''}`);
        const state = node('span', 'island-lobby-state', [row.tag, row.online ? 'online' : 'away'].filter(Boolean).join(' · '));
        item.append(dot, swatch, name);
        // The captain's role icon (Medic, Engineer, Gunner), so the crew sees who does what.
        if (row.captainRole) {
          const mark = node('span', 'island-lobby-role', row.roleIcon); mark.setAttribute('role', 'img'); mark.setAttribute('aria-label', `${row.roleName}`);
          mark.title = row.roleName; item.dataset.captainRole = row.captainRole; item.append(mark);
        }
        item.append(state); list.append(item);
      }
      const go = button(model.start.label, () => start()); go.dataset.focus = 'start'; go.classList.add('island-lobby-start');
      go.hidden = !model.start.show; go.disabled = model.start.disabled;
      const note = line('island-lobby-line', model.start.line);
      if (model.start.disabled && model.start.show && model.start.line) { note.id = 'island-lobby-why'; go.setAttribute('aria-describedby', note.id); }
      const done = button(model.start.show ? 'Look around first' : 'Done', close, true); done.dataset.focus = 'done';
      body.append(line('island-lead', model.lead), code, share, status, canvas, head, list, go, note, line('island-message', model.problem, 'alert'), done);
      return model.start.show && !model.start.disabled ? go : model.url ? copy : done;
    });
  }
  return {
    leaderboardCard, buildCard, bellCard, inviteCard, lobbyCard, crewCard, captainCard, captainsCard, harborCard, techCard, wreckCard, arsenalCard, demolishCard, close, copyLink,
    // Re-draw the open card from fresh models (the island controller calls this on every change).
    get open() { return kind; },
    get active() { return !!modal; },
    banner(text) { bannerText.textContent = text ?? ''; banner.hidden = !text; },
    // The chip of the game on screen ({text, label} from one-island.js visitChip), or null to hide it.
    visit(chip, onAction) {
      visit.replaceChildren();
      visit.hidden = !chip;
      if (!chip) return;
      visit.dataset.action = chip.action ?? '';
      const go = button(chip.label, onAction, true);
      if (chip.action === 'lobby') go.setAttribute('aria-label', 'Players and invite');
      visit.append(node('span', '', chip.text), go);
    },
    // tone: 'info', 'success' (a building, loot) or 'error' (the server's plain message).
    toast(text, tone = 'info', next = '') {
      if (disposed || !text) return;
      const id = toasts().show(next ? {text, tone, next} : {text, tone});
      lastToast = id === null ? null : {id, text};
    },
    get toastText() { return lastToast && toasts().shown.some(item => item.id === lastToast.id) ? lastToast.text : ''; },
    dispose() {
      if (disposed) return; disposed = true;
      if (modal) { const current = modal; modal = null; current.dispose(); }
      banner.remove(); visit.remove();
    },
  };
}
