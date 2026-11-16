// Draws the arsenal card (T41, D042) from arsenalModel (arsenal-model.js) into the island card's body. It
// decides nothing: each button calls a handler. ui.js opens the card (docked like the Tech hub) and calls this.
//   drawArsenal(body, model, handlers, {button, line}) -> the element to focus
//   handlers: {take(copyId), giveBack(), buy(typeId)}
import {node} from '../ui/kit/dom.js';

function described(act, body, id, reason, line) {
  if (!reason) return;
  const why = line('island-reason', reason); why.id = id; act.setAttribute('aria-describedby', why.id); body.append(why);
}

function carryPart(model, handlers, {button, line}) {
  const box = node('section', 'island-arsenal-carry'); box.setAttribute('aria-label', 'What you carry');
  box.append(node('h3', 'island-skills-title', 'You carry'), node('strong', 'island-arsenal-name', model.carry.name),
    line('island-arsenal-stats', model.carry.stats), line('island-crew-line', model.carry.line));
  let act = null;
  if (model.back) {
    act = button(model.back.label, () => handlers.giveBack?.(), true); act.dataset.focus = 'arsenal-return'; act.disabled = model.back.disabled;
    box.append(act); described(act, box, 'island-reason-arsenal-return', model.back.reason, line);
  }
  return {box, act};
}

function rackPart(model, handlers, {button, line}) {
  const box = node('section', 'island-arsenal-rack'); box.setAttribute('aria-label', 'The rack');
  box.append(node('h3', 'island-skills-title', model.stock));
  if (!model.rack.length) box.append(line('island-crew-line', 'No weapons yet. Buy the first one below.'));
  const list = node('ul', 'island-crew'); let focusable = null;
  for (const row of model.rack) {
    const item = node('li', 'island-crew-row island-arsenal-copy'); item.dataset.copy = row.id; item.dataset.weapon = row.weapon;
    const text = node('div', 'island-crew-text');
    text.append(node('strong', '', row.label), node('p', 'island-arsenal-stats', row.stats));
    if (row.holder) text.append(node('p', 'island-crew-reason', row.holder));
    item.append(text);
    if (row.button) {
      const go = button(row.button.label, () => handlers.take?.(row.id)); go.dataset.focus = `copy-${row.id}`; go.disabled = row.button.disabled;
      go.setAttribute('aria-label', `${row.button.label} ${row.label}`); item.append(go);
      if (row.button.reason) text.append(node('p', 'island-crew-reason', row.button.reason));
      focusable ??= go.disabled ? null : go;
    }
    list.append(item);
  }
  box.append(list);
  return {box, focusable};
}

function shopPart(model, handlers, {button}) {
  const box = node('section', 'island-arsenal-shop'); box.setAttribute('aria-label', 'Buy for the crew');
  box.append(node('h3', 'island-skills-title', 'Buy for the crew (your coins)'));
  const list = node('ul', 'island-crew');
  for (const row of model.shop) {
    const item = node('li', `island-crew-row island-arsenal-type${row.locked ? ' is-locked' : ''}`); item.dataset.weapon = row.id;
    const text = node('div', 'island-crew-text');
    const head = node('p', 'island-crew-head'); head.append(node('strong', '', row.name), node('span', 'island-crew-owned', row.priceText));
    text.append(head, node('p', 'island-arsenal-stats', row.stats), node('p', 'island-crew-line', `${row.mode} ${row.line}`));
    if (row.button.reason) text.append(node('p', 'island-crew-reason', row.button.reason));
    const go = button(row.button.label, () => handlers.buy?.(row.id)); go.dataset.focus = `buy-${row.id}`; go.disabled = row.button.disabled;
    go.setAttribute('aria-label', `${row.button.label} ${row.name}`);
    item.append(text, go); list.append(item);
  }
  box.append(list);
  return box;
}

export function drawArsenal(body, model, handlers = {}, kit) {
  body.append(kit.line('island-purpose', model.lead));
  if (!model.carry) {
    body.append(kit.line('island-message', model.message, 'alert'));
    const retry = kit.button(model.retry.label, () => handlers.retry?.());
    retry.dataset.focus = 'arsenal-retry'; retry.disabled = model.retry.disabled;
    body.append(retry);
    return retry.disabled ? null : retry;
  }
  const carry = carryPart(model, handlers, kit), rack = rackPart(model, handlers, kit);
  body.append(carry.box, rack.box, shopPart(model, handlers, kit),
    kit.line('island-message', model.message, 'alert'), kit.line('island-coins', model.coins));
  return rack.focusable ?? (carry.act && !carry.act.disabled ? carry.act : null);
}
