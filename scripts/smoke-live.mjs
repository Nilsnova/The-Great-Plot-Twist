// Bounded, signed-out deployment checks. Used by smoke-live.sh and local fixture tests.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {containsFingerprint} from '../frontend/scripts/spoiler-guard.js';

const DEFAULT_URL = 'https://the-great-plot-twist.vercel.app';
const FLAG_NAMES = ['market', 'predictions', 'sports', 'arena', 'raid', 'live_presence', 'companion_llm'];
const SHA = /^[a-f0-9]{40}$/;
const MAX_ASSETS = 100;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;

function originFor(text) {
  const url = new URL(text);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
    throw new Error('Use an HTTPS origin, or an explicit loopback HTTP origin for local tests.');
  }
  return url.origin;
}

function assetPath(value) {
  // No URLs, traversal, queries, fragments or control characters can enter a download.
  return typeof value === 'string' && /^assets\/[A-Za-z0-9_.-]+\.(js|css)$/.test(value);
}

function validStamp(value) {
  if (!value || !SHA.test(value.commit) || typeof value.builtAt !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.builtAt)) return false;
  if (Number.isNaN(Date.parse(value.builtAt))) return false;
  return new Date(value.builtAt).toISOString() === value.builtAt &&
    Array.isArray(value.assets) && value.assets.length > 0 && value.assets.length <= MAX_ASSETS &&
    value.assets.every(assetPath) && new Set(value.assets).size === value.assets.length &&
    value.assets.some(path => path.endsWith('.js'));
}

function validFlags(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    FLAG_NAMES.every(name => typeof value[name] === 'boolean') &&
    Object.keys(value).every(name => FLAG_NAMES.includes(name));
}

function expectedFlags(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([name, enabled]) => FLAG_NAMES.includes(name) && typeof enabled === 'boolean');
}

async function request(origin, path, fetchImpl, maxBytes) {
  const response = await fetchImpl(origin + path, {
    redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(8000),
    headers: {Accept: '*/*'},
  });
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new Error('Response exceeds the smoke-check byte budget.');
    chunks.push(Buffer.from(chunk));
  }
  return {status: response.status, headers: response.headers, text: Buffer.concat(chunks).toString('utf8'), size};
}

function parseJson(result) {
  if (result?.status !== 200) return null;
  try {return JSON.parse(result.text);} catch {return null;}
}

export async function runSmoke({baseUrl = DEFAULT_URL, expectedCommit = '', flags = {},
  fingerprints, fetchImpl = fetch, report = console.log} = {}) {
  const origin = originFor(baseUrl);
  if ((expectedCommit && !SHA.test(expectedCommit)) || !expectedFlags(flags)) {
    throw new Error('Expected commit must be a full SHA; expected flags must be known Boolean flags.');
  }
  if (!Array.isArray(fingerprints) || !fingerprints.length) throw new Error('Spoiler fingerprints are required.');
  let failures = 0;
  function check(condition, label) {
    if (!condition) failures++;
    report(`${condition ? 'PASS' : 'FAIL'} ${label}`);
  }
  async function get(path, limit = 65536) {
    try {return await request(origin, path, fetchImpl, limit);} catch {return null;}
  }

  const home = await get('/', 1024 * 1024);
  check(home?.status === 200 && /<html[\s>]/i.test(home.text), 'home returns HTML with HTTP 200');
  check(Boolean(home?.headers.get('content-security-policy')?.trim()), 'home Content-Security-Policy is present');
  check(home?.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff', 'home X-Content-Type-Options is nosniff');
  check(Boolean(home?.headers.get('referrer-policy')?.trim()), 'home Referrer-Policy is present');

  const health = parseJson(await get('/api/health'));
  check(health?.status === 'ok', 'API health is ok (database readiness is not checked)');
  const config = parseJson(await get('/api/config'));
  check(validFlags(config?.flags) && Object.entries(flags).every(([name, value]) => config.flags[name] === value),
    'API feature flags are Boolean and match any expected flags');
  const signedOut = await get('/api/me');
  check(signedOut?.status === 401 && signedOut.headers.get('cache-control')?.toLowerCase().split(',').map(x => x.trim()).includes('no-store'),
    'signed-out private response is HTTP 401 with Cache-Control no-store');

  const stamp = parseJson(await get('/build-info.json'));
  const hasStamp = validStamp(stamp);
  check(hasStamp && (!expectedCommit || stamp.commit === expectedCommit), 'deployed build stamp is valid and matches any expected commit');
  if (hasStamp) report(`BUILD ${stamp.commit} ${stamp.builtAt}`);
  const scripts = [...(home?.text ?? '').matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
  const scriptAssets = [];
  let entryValid = scripts.length > 0;
  for (const script of scripts) {
    try {
      const url = new URL(script, origin + '/');
      const path = url.pathname.slice(1);
      if (url.origin !== origin || url.search || url.hash || !assetPath(path)) entryValid = false;
      else scriptAssets.push(path);
    } catch {entryValid = false;}
  }
  check(hasStamp && entryValid && scriptAssets.every(path => stamp.assets.includes(path)),
    'home entry scripts are same-origin stamped assets');

  let complete = hasStamp;
  let clean = hasStamp;
  let total = 0;
  const texts = home ? [home.text] : [];
  if (hasStamp) for (const path of stamp.assets) {
    if (total >= MAX_TOTAL_BYTES) {complete = false; break;}
    const asset = await get('/' + path, Math.min(MAX_FILE_BYTES, MAX_TOTAL_BYTES - total));
    const type = asset?.headers.get('content-type') ?? '';
    const expectedType = path.endsWith('.js') ? /(?:java|ecma)script/i : /^text\/css(?:;|$)/i;
    // Stop on failure: even an error body used part of the bounded download allowance.
    if (!asset || asset.status !== 200 || !expectedType.test(type)) {complete = false; break;}
    total += asset.size;
    if (total > MAX_TOTAL_BYTES) {complete = false; break;}
    texts.push(asset.text);
  }
  for (const text of texts) if (fingerprints.some(fingerprint => containsFingerprint(text, fingerprint))) clean = false;
  check(complete, 'all stamped JavaScript and CSS downloads fit the byte budget');
  check(complete && clean, 'downloaded home and complete bundle pass the spoiler fingerprint scan');
  report(`RESULT ${failures} failure(s)`);
  return failures;
}

export async function main(args = process.argv.slice(2)) {
  try {
    if (args.length > 3) throw new Error('Too many arguments.');
    const {fingerprints} = JSON.parse(await readFile(new URL('../frontend/tests/fixtures/reveal-fingerprints.json', import.meta.url), 'utf8'));
    return await runSmoke({baseUrl: args[0] ?? DEFAULT_URL, expectedCommit: args[1] ?? '',
      flags: args[2] ? JSON.parse(args[2]) : {}, fingerprints});
  } catch {
    console.log('FAIL smoke configuration or local checker failure; see docs/RUNBOOK.md for usage');
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main();
