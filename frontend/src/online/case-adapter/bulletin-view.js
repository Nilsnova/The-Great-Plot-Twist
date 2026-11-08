// Public bulletin envelopes keep server fields unchanged and expose only display observations.
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string';
const nullableText = value => value === null || text(value);
const nullableObject = value => value === null || object(value);
const weatherStates = new Set([null, 'calm', 'fog', 'rain', 'storm']);
const times = value => object(value) && ['date', 'startsAt', 'endsAt'].every(key => text(value[key]));

function validWeather(value) {
  if (value === null) return true;
  if (!object(value) || !nullableText(value.attribution)
    || ['source', 'fetchedAt'].some(key => value[key] !== undefined && !nullableText(value[key]))) return false;
  const tonight = value.tonight, tomorrow = value.tomorrow;
  if (tonight != null && (!times(tonight) || !weatherStates.has(tonight.state)
    || typeof tonight.isNow !== 'boolean' || typeof tonight.isFogNight !== 'boolean'
    || ![null, 'real', 'almanac'].includes(tonight.fogNightKind))) return false;
  return tomorrow == null || times(tomorrow) && weatherStates.has(tomorrow.state);
}
function validHook(value) {
  if (value === null) return true;
  const beam = value?.beam, flash = beam?.flash;
  return object(value) && text(value.id) && object(value.notice)
    && text(value.notice.title) && text(value.notice.text) && object(beam?.chart)
    && Number.isFinite(beam.chart.x) && Number.isFinite(beam.chart.y)
    && Array.isArray(beam.pattern)
    && beam.pattern.every(pulse => pulse === 'short' || pulse === 'long') && object(flash)
    && ['shortSeconds', 'longSeconds'].every(key => Number.isFinite(flash[key]))
    && ['gapSeconds', 'pauseSeconds'].every(key => Number.isFinite(flash[key]));
}
export function validBulletinReply(value) {
  if (!object(value) || !object(value.day) || !Array.isArray(value.lines)) return false;
  const day = value.day;
  const dayKeys = ['id', 'startedAt', 'nextDayAt', 'bulletinDay', 'publishedAt', 'nextBulletinAt',
    'harborWeek', 'nextHarborWeekAt'];
  if (!dayKeys.every(key => text(day[key])) || !Array.isArray(day.resets)
    || !day.resets.every(reset => object(reset) && text(reset.when) && text(reset.what))) return false;
  if (!value.lines.every(line => object(line) && text(line.kind) && text(line.text))) return false;
  if (!validWeather(value.weather) || !nullableObject(value.exchange) || !validHook(value.chapterTwoHook)) return false;
  const exchange = value.exchange;
  return exchange === null || ['live', 'cache', 'stale', 'replay'].includes(exchange.feed)
    && Array.isArray(exchange.pausedCompanies)
    && exchange.pausedCompanies.every(company => object(company) && text(company.id) && text(company.name));
}
export function emptyOnlineBulletin(status = 'off', message = '') {
  return {status, day: null, lines: [], weather: null, exchange: null, chapterTwoHook: null,
    stale: false, message};
}
export function onlineBulletinView(data, {stale = false, message = ''} = {}) {
  return {status: 'ready', ...structuredClone({day: data.day, lines: data.lines, weather: data.weather,
    exchange: data.exchange, chapterTwoHook: data.chapterTwoHook}), stale, message};
}
export function bulletinObservations(bulletin) {
  const hook = bulletin?.status === 'ready' ? bulletin.chapterTwoHook : null;
  return hook ? [{id: hook.id, text: 'A light flashing far out at sea'}] : [];
}
