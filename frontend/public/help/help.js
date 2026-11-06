// Optional local topic filter. The complete guide remains readable without this script.
const form = document.querySelector('#help-search');
const input = document.querySelector('#topic-search');
const clear = document.querySelector('#clear-search');
const status = document.querySelector('#search-status');
const empty = document.querySelector('#no-results');
const topics = [...document.querySelectorAll('.help-topic')];

function filterTopics() {
  const query = input.value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const topic of topics) {
    topic.hidden = !topic.textContent.toLocaleLowerCase().includes(query);
    if (!topic.hidden) visible++;
  }
  empty.hidden = visible !== 0;
  status.textContent = query ? `${visible} of ${topics.length} topics shown.` : `All ${topics.length} topics shown.`;
}

function resetFilter() {
  input.value = '';
  filterTopics();
}

form.hidden = false;
form.addEventListener('submit', event => event.preventDefault());
input.addEventListener('input', filterTopics);
input.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); resetFilter(); }
});
clear.addEventListener('click', () => { resetFilter(); input.focus(); });
document.querySelector('.contents').addEventListener('click', event => {
  if (event.target.closest('a')) resetFilter();
});
window.addEventListener('hashchange', () => {
  const target = document.getElementById(location.hash.slice(1));
  if (target?.closest('.help-topic')?.hidden) {
    resetFilter();
    target.scrollIntoView();
  }
});
filterTopics();
