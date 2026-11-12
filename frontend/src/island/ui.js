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

// The cards of the island's buildings: a spot's build or upgrade card (houses too), the Tech hub, the wreck
// and the Harbor. They dock at the right side on a desktop and come up as a bottom sheet on a phone
// (island.css), so the island stays in view; the menus (crew, captain, lobby, invite) stay centred.
export const DOCKED = new Set(['build', 'tech', 'wreck', 'harbor']);

function button(label, onClick, quiet = false) {
  const element = node('button', `kit-button${quiet ? ' kit-quiet' : ''}`, label); element.type = 'button';
  element.addEventListener('click', onClick);
  return element;
}

export function createIslandUi({container, focus = () => {}, resetInput = () => {}, toasts = gameToasts} = {}) {
  let modal = null, kind = null, render = null, disposed = false, lastToast = null;
  // Which Tech hub branches the player folded open or shut (kept while the page lives).
  const techOpen = new Map();
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

  // handlers: {build(spotId, kind), upgrade(spotId), hire()}
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
      }
      if (act && !act.disabled) focusable = act;
      footer(body, model, act);
      if (model.locked) body.classList.add('is-locked');
      // GAME-V3.md §5: the tower's skill, chosen once its kind is researched at the Tech hub.
      if (model.skills) {
        const box = node('section', 'island-skills-pick'); box.setAttribute('aria-label', model.skills.title);
        box.append(node('h3', 'island-skills-title', model.skills.title), line('island-skills-line', model.skills.line));
        if (model.skills.choices.length) {
          const list = node('div', 'island-spec-list'); list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Tower skills');
          for (const choice of model.skills.choices) {
            const option = node('button', `island-spec${choice.active ? ' is-active' : ''}`); option.type = 'button';
            option.dataset.focus = `spec-${choice.id}`; option.dataset.spec = choice.id; option.disabled = choice.disabled;
            option.setAttribute('aria-pressed', String(choice.active));
            option.append(node('strong', '', choice.busy ? 'Picking…' : choice.name), node('span', 'island-spec-line', choice.line));
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
      return focusable;
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
  // handlers: {research({branch, tier, choice, change})}. GAME-V3.md §5.1: one folding row per tower kind
  // (open while nothing is researched there, or as the player left it), inside a short path of three tiers:
  // tier 1 one node, tiers 2 and 3 a fork of two nodes (chosen lit, the other closed and greyed).
  function techCard(model, handlers = {}) {
    open('tech', model.title, body => {
      let focusable = null;
      if (!model.open) lockedNote(body, model); else body.append(line('island-purpose', model.line));
      if (model.next) body.append(line('island-tech-next', model.next.text));
      const list = node('div', 'island-research');
      for (const row of model.branches) {
        const box = node('details', `island-research-branch${row.next ? ' is-next' : ''}${row.folded ? ' is-done' : ''}`); box.dataset.branch = row.branch;
        box.open = techOpen.has(row.branch) ? techOpen.get(row.branch) : !row.folded;
        box.addEventListener('toggle', () => techOpen.set(row.branch, box.open));
        const summary = node('summary', 'island-research-summary'); summary.dataset.focus = `branch-${row.branch}`;
        summary.append(node('strong', 'island-research-name', row.summary));
        if (row.next) summary.append(node('span', 'island-research-flag', 'Next step'));
        const path = node('ol', 'island-rstep-path');
        for (const tier of row.tiers) {
          const step = node('li', `island-rstep is-${tier.state}${tier.fork ? ' is-fork' : ''}`); step.dataset.tier = String(tier.tier);
          const head = node('p', 'island-rstep-head');
          const dot = node('span', 'island-rstep-dot', tier.state === 'done' ? '✓' : tier.state === 'locked' ? '🔒' : String(tier.tier)); dot.setAttribute('aria-hidden', 'true');
          head.append(dot, node('strong', '', `Tier ${tier.tier}`), node('span', 'island-rstep-state',
            tier.state === 'done' ? 'Done' : tier.state === 'next' ? (tier.fork ? 'Next: pick one of two' : 'Next') : tier.reason));
          const nodes = node('div', 'island-rstep-nodes');
          if (tier.fork) { nodes.setAttribute('role', 'group'); nodes.setAttribute('aria-label', `${row.name}, tier ${tier.tier}: one of two`); }
          for (const option of tier.nodes) {
            const card = node('div', `island-rstep-node is-${option.state}`); card.dataset.option = option.id;
            card.append(node('strong', 'island-rstep-name', option.name), node('span', 'island-rstep-line', option.line));
            if (option.note) card.append(node('span', 'island-rstep-note', option.note));
            if (option.button) {
              const go = button(option.button.label, () => handlers.research?.(option.button.action), option.button.action.change);
              go.dataset.focus = `research-${option.id}`; go.disabled = option.button.disabled; go.setAttribute('aria-label', option.button.aria);
              if (option.button.reason) { const why = line('island-rstep-reason', option.button.reason); why.id = `island-reason-${option.id}`; go.setAttribute('aria-describedby', why.id); card.append(why); }
              card.append(go);
              if (!go.disabled && box.open && !option.button.action.change) focusable ??= go;
            }
            nodes.append(card);
          }
          step.append(head, nodes); path.append(step);
        }
        box.append(summary, path); list.append(box);
      }
      body.append(list, line('island-message', model.message, 'alert'), line('island-coins', model.coins));
      return focusable;
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
  function crewCard(model, onHire) {
    open('crew', model.title, body => {
      let focusable = null;
      body.append(line('island-purpose', model.lead));
      const list = node('ul', 'island-crew');
      for (const row of model.rows) {
        const item = node('li', 'island-crew-row'); item.dataset.crew = row.id;
        const text = node('div', 'island-crew-text');
        const head = node('p', 'island-crew-head'); head.append(node('strong', '', row.name), node('span', 'island-crew-owned', row.owned));
        text.append(head, node('p', 'island-crew-line', row.line));
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
      if (!parts.skills && !parts.weapons) { body.append(...musket.childNodes); return closing(body, focusable); }
      const items = [{id: 'captain', label: 'Captain', body: musket}];
      if (parts.skills) items.push({id: 'skills', label: parts.skills.points > 0 ? `Skills (${parts.skills.points})` : 'Skills', body: skillsPart(parts.skills, on)});
      if (parts.weapons) items.push({id: 'weapons', label: 'Weapons', body: weaponsPart(parts.weapons, on)});
      const selected = Math.max(0, items.findIndex(item => item.id === parts.tab));
      const tabs = createTabs({items, selected, onChange: id => on.tab?.(id)});
      tabs.element.classList.add('island-captain-tabs');
      tabs.element.querySelectorAll('.kit-tab').forEach((tab, index) => { tab.dataset.focus = `tab-${items[index].id}`; });
      body.append(tabs.element);
      const done = closing(body, null);
      return items[selected].id === 'captain' ? focusable ?? done : tabs.element.querySelectorAll('.kit-tab')[selected];
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
  // The skill tree (§14): skill points on top, three columns (a branch each, tiers top to bottom, a line
  // between tiers), a tap shows the skill's one line and its Learn button below.
  function skillsPart(model, on) {
    const part = node('div', 'island-skills');
    const points = node('p', 'island-points', model.pointsText);
    const tree = node('div', 'island-tree'); tree.setAttribute('role', 'group'); tree.setAttribute('aria-label', 'Skill tree');
    for (const branch of model.branches) {
      const column = node('section', `island-branch island-branch-${branch.id}`);
      const head = node('h3', 'island-branch-head');
      const icon = node('span', 'island-branch-icon', branch.icon); icon.setAttribute('aria-hidden', 'true');
      head.append(icon, node('span', 'island-branch-name', branch.name));
      const list = node('ol', 'island-branch-nodes');
      branch.nodes.forEach((skill, index) => {
        const item = node('li', `island-tier${index && branch.nodes[index - 1].state === 'learned' ? ' is-linked' : ''}`);
        const choice = node('button', `island-skill is-${skill.state}${skill.id === model.picked ? ' is-picked' : ''}`); choice.type = 'button';
        choice.dataset.focus = `skill-${skill.id}`; choice.dataset.skill = skill.id;
        choice.setAttribute('aria-pressed', String(skill.id === model.picked)); choice.setAttribute('aria-label', skill.label);
        const dots = node('span', 'island-skill-cost'); dots.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < skill.cost; i++) dots.append(node('span', 'island-skill-dot'));
        const mark = node('span', 'island-skill-mark', skill.state === 'learned' ? '✓' : skill.state === 'locked' ? '🔒' : '');
        mark.setAttribute('aria-hidden', 'true'); mark.hidden = skill.state === 'ready';
        choice.append(node('span', 'island-skill-name', skill.name), dots, mark);
        choice.addEventListener('click', () => on.pick?.(skill.id));
        item.append(choice); list.append(item);
      });
      column.append(head, list); tree.append(column);
    }
    const pick = model.detail, detail = node('div', 'island-skill-detail'); detail.setAttribute('aria-live', 'polite');
    const head = node('p', 'island-skill-detail-head'); head.append(node('strong', '', pick.name), node('span', 'island-skill-detail-cost', pick.costText));
    const learn = button(pick.button, () => on.learn?.(pick.id)); learn.dataset.focus = 'learn'; learn.disabled = pick.disabled;
    const reason = line('island-reason', pick.state === 'ready' ? '' : pick.reason);
    if (reason.textContent) { reason.id = 'island-reason-skill'; learn.setAttribute('aria-describedby', reason.id); }
    detail.append(head, line('island-skill-line', pick.line), reason, learn);
    part.append(points, tree, detail, line('island-purpose island-skills-how', model.line), line('island-message', model.message, 'alert'));
    return part;
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
        item.append(dot, swatch, name, state); list.append(item);
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
    buildCard, bellCard, inviteCard, lobbyCard, crewCard, captainCard, captainsCard, harborCard, techCard, wreckCard, close, copyLink,
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
