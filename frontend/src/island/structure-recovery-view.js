// Renders a structure's health bar and recovery offer without changing authoritative health.
// Used by the island structure-card UI after it builds a recovery display model.

function appendText(document, parent, tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function createHealthBar(document, view) {
  const bar = document.createElement('div');
  bar.className = 'recovery-bar';
  bar.setAttribute('role', 'meter');
  bar.setAttribute('aria-label', 'Building health');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '1000000');
  bar.setAttribute('aria-valuenow', String(view.hpUnits));
  bar.setAttribute('aria-valuetext', view.hpLabel);

  const fill = document.createElement('span');
  fill.className = 'health-fill health-fill-' + view.healthBar.color;
  fill.style.width = (view.healthBar.fill * 100) + '%';
  fill.style.minWidth = view.healthBar.minimumVisibleWidthPx + 'px';
  if (view.healthBar.destroyed) fill.style.minWidth = '0';
  fill.setAttribute('aria-hidden', 'true');
  bar.append(fill);

  if (view.healthBar.destroyed) {
    appendText(document, bar, 'span', 'recovery-marker', '!');
  }
  return bar;
}

function renderStructureRecoveryView(container, view, options = {}) {
  const onRepair = options.onRepair;
  container.replaceChildren();
  if (!view) return null;

  if (!view.visible) {
    if (view.status === 'loading' || view.status === 'error') {
      const message = appendText(container.ownerDocument, container, 'p', 'recovery-message', view.message);
      if (view.status === 'error') message.setAttribute('role', 'alert');
      return message;
    }
    return null;
  }

  const document = container.ownerDocument;
  const card = document.createElement('section');
  card.className = 'recovery-card';
  card.dataset.instanceId = view.instanceId;
  card.append(createHealthBar(document, view));
  appendText(document, card, 'p', 'recovery-hp', view.hpLabel);

  if (view.repairLabel) {
    const button = document.createElement('button');
    button.className = 'recovery-repair';
    button.type = 'button';
    button.textContent = view.actionPending ? 'Repair in progress…' : view.repairLabel;
    button.disabled = view.repairDisabled || typeof onRepair !== 'function';
    if (!button.disabled) button.addEventListener('click', () => onRepair(view.repairIntent));
    card.append(button);
  }

  if (view.freeRepairLabel) {
    appendText(document, card, 'p', 'recovery-free', view.freeRepairLabel);
  }
  if (view.repairReasonLabel) {
    appendText(document, card, 'p', 'recovery-funds', view.repairReasonLabel);
  }
  if (view.statusLabel) {
    appendText(document, card, 'p', 'recovery-status', view.statusLabel);
  }
  if (view.helperLabel) {
    appendText(document, card, 'p', 'recovery-helper', view.helperLabel);
  }
  if (view.remainingUsesLabel) {
    appendText(document, card, 'p', 'recovery-quota', view.remainingUsesLabel);
  }
  if (view.errorMessage) {
    const error = appendText(document, card, 'p', 'recovery-error', view.errorMessage);
    error.setAttribute('role', 'alert');
  }

  container.append(card);
  return card;
}

export { renderStructureRecoveryView };
