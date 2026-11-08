// Keep the refused control focusable while the request model owns its wait and announcement.
export function syncIntentCooldown(root, focusKey, remaining) {
  for (const control of root.querySelectorAll('[data-focus]')) {
    const waiting = remaining > 0 && control.dataset.focus === focusKey;
    let caption = control.querySelector('.intent-cooldown');
    if (waiting) {
      control.setAttribute('aria-disabled', 'true');
      control.dataset.cooldown = 'true';
      if (!caption) {
        caption = document.createElement('span');
        caption.className = 'intent-cooldown';
        caption.setAttribute('aria-hidden', 'true');
        control.append(caption);
      }
      caption.textContent = ` · Try again in ${remaining} s`;
    } else if (control.dataset.cooldown === 'true') {
      control.removeAttribute('aria-disabled');
      delete control.dataset.cooldown;
      caption?.remove();
    }
  }
}
