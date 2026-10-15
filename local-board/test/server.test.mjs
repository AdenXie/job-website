import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createHandler } from '../lib/app.mjs';
import { probeBoard } from '../lib/health.mjs';
import { checkRequest } from '../lib/security.mjs';
import { createStore } from '../lib/store.mjs';

test('checks Host on every request and Origin plus JSON on writes', () => {
  const ok = { host: '127.0.0.1:47321', origin: 'http://127.0.0.1:47321', 'content-type': 'application/json; charset=utf-8' };
  assert.equal(checkRequest({ method: 'GET', headers: { host: 'localhost:47321' } }, 47321), null);
  assert.equal(checkRequest({ method: 'GET', headers: { host: 'evil.example:47321' } }, 47321)[0], 421);
  assert.equal(checkRequest({ method: 'GET', headers: { host: '127.0.0.1:8080' } }, 47321)[0], 421);
  assert.equal(checkRequest({ method: 'GET', headers: {} }, 47321)[0], 421);
  assert.equal(checkRequest({ method: 'PUT', headers: ok }, 47321), null);
  assert.equal(checkRequest({ method: 'PUT', headers: { ...ok, origin: 'https://jobs.adenxie.com.cn' } }, 47321)[0], 403);
  assert.equal(checkRequest({ method: 'PUT', headers: { ...ok, origin: undefined } }, 47321)[0], 403);
  assert.equal(checkRequest({ method: 'POST', headers: { ...ok, 'content-type': 'text/plain' } }, 47321)[0], 415);
  assert.equal(checkRequest({ method: 'POST', headers: { ...ok, 'content-type': 'application/x-www-form-urlencoded' } }, 47321)[0], 415);
});

let server;
let port;
let dataDir;
const publicDir = fileURLToPath(new URL('../public', import.meta.url));

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'local-board-'));
  const store = createStore(dataDir);
  const fakeFetch = async (url) => ({ ok: true, json: async () => (url.endsWith('jobs.json') ? { jobs: [] } : { version: '1.2.0' }) });
  server = createServer(createHandler({ getPort: () => port, store, publicDir, config: { siteUrl: 'https://jobs.example.com' }, version: '1.0.0', fetchImpl: fakeFetch }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
after(() => { server.close(); rmSync(dataDir, { recursive: true, force: true }); });

function call(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('serves the page with security headers and no CORS, rejecting rebinding hosts and path traversal', async () => {
  const page = await call('GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(page.headers['access-control-allow-origin'], undefined);
  assert.equal((await call('GET', '/', { headers: { host: 'attacker.example' } })).status, 421);
  assert.equal((await call('GET', '/..%2f..%2fpackage.json')).status, 404);
});

test('only the board page itself can write, and saved data is sanitized and persisted', async () => {
  const board = { cards: [{ job: { id: 'offer-1', company: '某公司', title: '岗位', applyUrl: 'javascript:alert(1)' }, status: 'applied' }] };
  const body = JSON.stringify(board);
  const json = { 'content-type': 'application/json' };
  assert.equal((await call('PUT', '/api/board', { headers: json, body })).status, 403);
  assert.equal((await call('PUT', '/api/board', { headers: { ...json, origin: 'https://evil.example' }, body })).status, 403);
  assert.equal((await call('PUT', '/api/board', { headers: { origin: `http://127.0.0.1:${port}`, 'content-type': 'text/plain' }, body })).status, 415);
  const saved = await call('PUT', '/api/board', { headers: { ...json, origin: `http://localhost:${port}` }, body });
  assert.equal(saved.status, 200);
  const onDisk = JSON.parse(readFileSync(join(dataDir, 'board.json'), 'utf8'));
  assert.equal(onDisk.cards[0].status, 'applied');
  assert.equal(onDisk.cards[0].job.applyUrl, '');
  assert.equal(JSON.parse((await call('GET', '/api/board')).body).cards.length, 1);
});

test('recognises an already running board on the port, and nothing else', async () => {
  assert.deepEqual(JSON.parse((await call('GET', '/api/health')).body), { app: 'qiuzhao-local-board', version: '1.0.0', status: 'ok' });
  assert.equal(await probeBoard(port), '1.0.0');
  // 其他程序占用端口：返回的不是看板的标识
  const other = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"status":"ok"}'); });
  await new Promise((resolve) => other.listen(0, '127.0.0.1', resolve));
  const otherPort = other.address().port;
  assert.equal(await probeBoard(otherPort), null);
  other.close();
  // 没有任何程序监听
  assert.equal(await probeBoard(otherPort, 500), null);
});

test('reports a newer version without downloading anything', async () => {
  const result = JSON.parse((await call('GET', '/api/check-update')).body);
  assert.deepEqual([result.current, result.latest, result.hasUpdate], ['1.0.0', '1.2.0', true]);
});
