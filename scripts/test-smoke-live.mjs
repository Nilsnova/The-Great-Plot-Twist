// Local-only deployment fixtures exercise real requests and the smoke script's exit status.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {FLAG_NAMES, runSmoke} from './smoke-live.mjs';

const COMMIT = 'a'.repeat(40);
const FLAGS = Object.fromEntries(FLAG_NAMES.map(name => [name, false]));
const EXAMPLE = "A private 'example' line.";
const FINGERPRINTS = [{prefix: EXAMPLE.slice(0, 14), length: EXAMPLE.length, sha256: createHash('sha256').update(EXAMPLE).digest('hex')}];

async function fixture(overrides, visit) {
  const requests = [];
  const stamp = {commit: COMMIT, builtAt: '2026-11-06T12:00:00.000Z', assets: ['assets/game-abc.js', 'assets/game-def.css']};
  const routes = {
    '/': {body: '<html><script type="module" src="/assets/game-abc.js"></script></html>', headers: {
      'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'}},
    '/api/health': {body: JSON.stringify({status: 'ok'})},
    '/api/config': {body: JSON.stringify({flags: FLAGS})},
    '/api/me': {status: 401, headers: {'Cache-Control': 'no-store'}, body: '{"error":{"code":"unauthorized"}}'},
    '/build-info.json': {body: JSON.stringify(stamp)},
    '/assets/game-abc.js': {headers: {'Content-Type': 'application/javascript'}, body: 'console.log("game");'},
    '/assets/game-def.css': {headers: {'Content-Type': 'text/css'}, body: 'body{color:green}'},
    ...overrides,
  };
  const server = createServer((request, response) => {
    requests.push({path: request.url, authorization: request.headers.authorization, cookie: request.headers.cookie});
    const route = routes[request.url] ?? {status: 404, body: ''};
    response.writeHead(route.status ?? 200, route.headers ?? {});
    response.end(route.body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const lines = [];
  try {
    await visit({baseUrl, requests, lines, run: options => runSmoke({baseUrl, fingerprints: FINGERPRINTS, report: text => lines.push(text), ...options})});
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

test('complete signed-out fixture passes all checks and reports only safe build metadata', async () => {
  await fixture({}, async ({run, requests, lines}) => {
    assert.equal(await run({expectedCommit: COMMIT, flags: {market: false}}), 0);
    assert.equal(requests.length, 7);
    assert.ok(requests.every(request => request.authorization === undefined && request.cookie === undefined));
    assert.ok(lines.includes(`BUILD ${COMMIT} 2026-11-06T12:00:00.000Z`));
    assert.equal(lines.at(-1), 'RESULT 0 failure(s)');
  });
});

test('missing home security headers count as three failures', async () => {
  await fixture({'/': {body: '<html><script src="assets/game-abc.js"></script></html>'}}, async ({run}) => {
    assert.equal(await run(), 3);
  });
});

test('health and malformed feature flags are independent failures', async () => {
  await fixture({'/api/health': {status: 503, body: '{"status":"ok"}'}, '/api/config': {body: '{"flags":{"market":"true"}}'}}, async ({run}) => {
    assert.equal(await run(), 2);
  });
});

test('configured expected flags and commit each detect deployment drift', async () => {
  await fixture({}, async ({run}) => {
    assert.equal(await run({expectedCommit: 'b'.repeat(40), flags: {market: true}}), 2);
  });
});

test('private failures must never be cacheable', async () => {
  await fixture({'/api/me': {status: 401, headers: {'Cache-Control': 'public, max-age=300'}, body: ''}}, async ({run}) => {
    assert.equal(await run(), 1);
  });
});

test('unknown flag names are rejected rather than silently missed', async () => {
  await fixture({'/api/config': {body: JSON.stringify({flags: {...FLAGS, misspelled: false}})}}, async ({run}) => {
    assert.equal(await run(), 1);
  });
});

test('a missing stamped chunk fails reachability and the complete spoiler scan', async () => {
  await fixture({'/assets/game-abc.js': {status: 404, body: ''}}, async ({run}) => {
    assert.equal(await run(), 2);
  });
});

test('synthetic exact and escaped spoiler text fails without printing the prose', async () => {
  for (const body of [EXAMPLE, EXAMPLE.replaceAll("'", "\\'")]) {
    await fixture({'/assets/game-abc.js': {headers: {'Content-Type': 'application/javascript'}, body}}, async ({run, lines}) => {
      assert.equal(await run(), 1);
      assert.ok(!lines.join('\n').includes(EXAMPLE));
    });
  }
});

test('foreign asset URLs in the build stamp are never fetched', async () => {
  await fixture({'/build-info.json': {body: JSON.stringify({commit: COMMIT, builtAt: '2026-11-06T12:00:00.000Z', assets: ['https://outside.invalid/foreign.js']})}}, async ({run, requests}) => {
    assert.equal(await run(), 4);
    assert.ok(requests.every(request => !request.path.startsWith('/assets/')));
  });
});

test('a foreign home entry script is rejected without following it', async () => {
  await fixture({'/': {body: '<html><script src="https://outside.invalid/foreign.js"></script></html>', headers: {
    'Content-Security-Policy': "default-src 'self'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'}}}, async ({run, baseUrl}) => {
    assert.equal(await run({fetchImpl(url, options) {assert.ok(url.startsWith(baseUrl + '/')); return fetch(url, options);}}), 1);
  });
});

test('redirects are refused rather than following another endpoint or origin', async () => {
  await fixture({'/api/health': {status: 302, headers: {Location: '/not-allowed'}, body: ''}}, async ({run, requests}) => {
    assert.equal(await run(), 1);
    assert.ok(!requests.some(request => request.path === '/not-allowed'));
  });
});

test('oversized chunk is stopped and never reported as a complete clean scan', async () => {
  await fixture({'/assets/game-abc.js': {body: 'x'.repeat(4 * 1024 * 1024 + 1)}}, async ({run}) => {
    assert.equal(await run(), 2);
  });
});

test('HTML fallback for a missing chunk cannot pass as JavaScript', async () => {
  await fixture({'/assets/game-abc.js': {headers: {'Content-Type': 'text/html'}, body: '<html>'+ 'x'.repeat(1024 * 1024) +'</html>'}}, async ({run, requests}) => {
    assert.equal(await run(), 2);
    assert.ok(!requests.some(request => request.path === '/assets/game-def.css'),
      'failed large bodies stop the scan before more downloads consume the total budget');
  });
});

test('network errors produce failed checks without leaking error text', async () => {
  const lines = [];
  const failures = await runSmoke({baseUrl: 'http://127.0.0.1:1', fingerprints: FINGERPRINTS,
    fetchImpl() {throw new Error('sensitive input that must not be printed');}, report: line => lines.push(line)});
  assert.equal(failures, 11);
  assert.ok(!lines.join('\n').includes('sensitive input'));
});

test('invalid base URLs and expectations fail before any request', async () => {
  for (const baseUrl of ['http://outside.invalid', 'https://fixture@example.com', 'https://example.com/path', 'https://example.com?token=private', 'file:///tmp/example']) {
    await assert.rejects(runSmoke({baseUrl, fingerprints: FINGERPRINTS, fetchImpl() {assert.fail('must not request');}}));
  }
  await assert.rejects(runSmoke({baseUrl: 'http://localhost:1', flags: {unknown: true}, fingerprints: FINGERPRINTS}));
  await assert.rejects(runSmoke({baseUrl: 'http://localhost:1', expectedCommit: 'short', fingerprints: FINGERPRINTS}));
  await assert.rejects(runSmoke({baseUrl: 'http://localhost:1', fingerprints: []}));
});

test('shell wrapper preserves failure count as process exit status', async () => {
  await fixture({'/api/health': {status: 503, body: ''}, '/api/me': {status: 401, body: ''}}, async ({baseUrl}) => {
    const child = spawn('bash', [fileURLToPath(new URL('./smoke-live.sh', import.meta.url)), baseUrl]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    const exitCode = await new Promise(resolve => child.on('close', resolve));
    assert.equal(exitCode, 2);
    assert.match(stdout, /RESULT 2 failure\(s\)/);
    assert.equal(stderr, '');
  });
});


test('deployment flag schema follows every current backend flag', async () => {
  const source = await readFile(new URL('../backend/server/flags.py', import.meta.url), 'utf8');
  const names = [...source.match(/FLAG_NAMES = \(([\s\S]*?)\)/)[1].matchAll(/"([a-z_]+)"/g)].map(match => match[1]);
  assert.deepEqual(FLAG_NAMES, names);
  await fixture({}, async ({run}) => {
    assert.equal(await run({flags: {case: false, sign_in: false, bulletin: false, festival: false}}), 0);
  });
});


test('current larger bundles remain bounded instead of failing the old 100-asset cap', async () => {
  const assets = Array.from({length:121}, (_,i) => `assets/current-${i}.js`);
  const routes = Object.fromEntries(assets.map(path => ['/'+path, {headers:{'Content-Type':'application/javascript'},body:'/* public */'}]));
  routes['/build-info.json'] = {body:JSON.stringify({commit:COMMIT,builtAt:'2026-11-06T12:00:00.000Z',assets})};
  routes['/'] = {body:`<html><script src="/${assets[0]}"></script></html>`,headers:{'Content-Security-Policy':"default-src 'self'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}};
  await fixture(routes, async ({run}) => assert.equal(await run(),0));
  routes['/build-info.json'] = {body:JSON.stringify({commit:COMMIT,builtAt:'2026-11-06T12:00:00.000Z',assets:Array.from({length:257},(_,i)=>`assets/too-many-${i}.js`)})};
  await fixture(routes, async ({run,requests}) => {
    assert.equal(await run(),4);
    assert.ok(requests.every(request => !request.path.startsWith('/assets/')));
  });
});
