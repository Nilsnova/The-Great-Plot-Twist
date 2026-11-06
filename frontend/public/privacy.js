// Optional printing for the standalone privacy notice. Used by privacy.html; stores no data.
const printButton = document.getElementById('print-notice');
if (printButton) {
  printButton.hidden = false;
  printButton.addEventListener('click', () => window.print());
}
