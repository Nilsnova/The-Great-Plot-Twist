// Public bulletin fixtures use replaceable display text and never read story or case files.
export function recordedBulletin({hook = false, text = 'Recorded public bulletin.'} = {}) {
  const instant = '2026-11-07T08:00:00Z';
  return {day: {id: '2026-11-07', startedAt: instant, nextDayAt: instant, bulletinDay: '2026-11-07',
    publishedAt: instant, nextBulletinAt: instant, harborWeek: '2026-11-02', nextHarborWeekAt: instant,
    resets: [{when: 'Recorded reset time', what: 'Recorded reset description'}]},
  lines: [{kind: 'weather', text}],
  weather: {tonight: null, tomorrow: {date: '2026-11-08', startsAt: instant, endsAt: instant, state: null},
    source: null, fetchedAt: null, attribution: null}, exchange: null,
  chapterTwoHook: hook ? {id: 'recorded_hook', notice: {title: 'Recorded notice', text: 'Recorded notice text.'},
    beam: {chart: {x: 10, y: 20}, pattern: ['short'],
      flash: {shortSeconds: .5, longSeconds: 1, gapSeconds: .5, pauseSeconds: 2}}} : null};
}
