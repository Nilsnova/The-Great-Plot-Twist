// One small icon in front of each pause-menu button (team style: less text, more icons).
// The icon is drawn by CSS from the button's data-icon (shell.css), so the button's text and its
// name for screen readers stay exactly the label. A label without an icon simply gets none.
const ICONS = [
  ['Resume', '▶️'],
  ['Players and invite', '👥'],
  ['Leave this game', '🚪'],
  ['Leaderboard', '🏆'],
  ['Crew', '👷'],
  ['Captain and skills', '⭐'],
  ['Captains here', '🧭'],
  ['Sea chart', '🗺️'],
  ['Controls', '⌨️'],
  ['How to play', '❓'],
  ['Harbor', '⚓'],
  ['Projector', '📽️'],
  ['Join the class harbor', '⛵'],
  ['Settings', '⚙️'],
  ['Return to title', '🏠'],
];

// "Captains here (3)" and "Projector: Join the harbor (J)" carry extra words, so the start of the label counts.
export function menuIcon(label) {
  if (typeof label !== 'string') return '';
  const found = ICONS.find(([start]) => label === start || label.startsWith(`${start} `) || label.startsWith(`${start}:`));
  return found ? found[1] : '';
}

export function withIcon(button, label) {
  const icon = menuIcon(label);
  if (icon) button.dataset.icon = icon;
  return button;
}
