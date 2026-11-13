import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';
import { zipSync } from 'fflate';
import { createHandler } from '../lib/app.mjs';
import { createStore } from '../lib/store.mjs';
import { crc32, readZip } from '../lib/unzip.mjs';
import { applyUpdate, downloadUpdate, KEEP_BACKUPS, restoreBackup, safeEntryPath } from '../lib/updater.mjs';

const text = (value) => Buffer.from(value, 'utf8');
const temps = [];
const tempDir = () => { const dir = mkdtempSync(join(tmpdir(), 'board-update-')); temps.push(dir); return dir; };
afterEach(() => { while (temps.length) rmSync(temps.pop(), { recursive: true, force: true }); });

function writeFiles(root, files) {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
}

function packageZip(version, extra = {}) {
  const files = {
    'local-board/version.json': text(JSON.stringify({ version })),
    'local-board/server.mjs': text(`// server ${version}`),
    'local-board/lib/app.mjs': text(`// app ${version}`),
    'local-board/public/index.html': text(`<p>${version}</p>`),
    'local-board/public/new-file.js': text('// added'),
    'local-board/config.json': text('{"port":47321,"siteUrl":"https://jobs.example.com"}'),
    ...extra,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, data]) => [name, [data, { level: name.endsWith('.html') ? 0 : 9 }]])));
}

function fakeSite(zip, info = {}) {
  const sha256 = createHash('sha256').update(zip).digest('hex');
  return async (url) => {
    if (url.endsWith('local-board-version.json')) return { ok: true, json: async () => ({ version: '1.3.0', size: zip.length, sha256, ...info }) };
    if (url.endsWith('local-board.zip')) return { ok: true, arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length) };
    return { ok: false, status: 404 };
  };
}

test('reads stored and deflated zip entries and rejects corrupted data', () => {
  const zip = packageZip('1.3.0');
  const entries = readZip(zip);
  assert.equal(entries.find((entry) => entry.name === 'local-board/public/index.html').data.toString(), '<p>1.3.0</p>');
  assert.equal(entries.find((entry) => entry.name === 'local-board/server.mjs').data.toString(), '// server 1.3.0');
  assert.equal(crc32(text('123456789')), 0xcbf43926);
  const broken = Buffer.from(zip);
  const at = broken.indexOf(text('<p>1.3.0</p>'));
  broken[at + 1] ^= 0xff;
  assert.throws(() => readZip(broken), /校验失败/);
  assert.throws(() => readZip(text('not a zip at all, definitely not')), /找不到目录/);
});

test('only accepts plain relative paths inside local-board/', () => {
  assert.equal(safeEntryPath('local-board/public/app.js'), 'public/app.js');
  for (const bad of ['public/app.js', 'local-board/', 'local-board/../x.js', 'local-board/a/../../x', 'local-board//etc', 'local-board/C:/x', 'local-board/a\\b.js', 'local-board/./a.js']) {
    assert.equal(safeEntryPath(bad), null, bad);
  }
});

test('downloads, verifies and refuses bad update packages', async () => {
  const zip = packageZip('1.3.0');
  const update = await downloadUpdate({ siteUrl: 'https://jobs.example.com/', currentVersion: '1.2.0', fetchImpl: fakeSite(zip) });
  assert.equal(update.version, '1.3.0');
  assert.ok(update.files.some((file) => file.path === 'public/new-file.js'));

  await assert.rejects(downloadUpdate({ siteUrl: 'https://jobs.example.com', currentVersion: '1.3.0', fetchImpl: fakeSite(zip) }), /已是最新版本/);
  await assert.rejects(downloadUpdate({ siteUrl: 'https://jobs.example.com', currentVersion: '1.2.0', fetchImpl: fakeSite(zip, { sha256: 'a'.repeat(64) }) }), /完整性校验/);
  await assert.rejects(downloadUpdate({ siteUrl: 'https://jobs.example.com', currentVersion: '1.2.0', fetchImpl: fakeSite(zip, { size: zip.length + 1 }) }), /完整性校验/);
  await assert.rejects(downloadUpdate({ siteUrl: 'https://jobs.example.com', currentVersion: '1.2.0', fetchImpl: fakeSite(zip, { version: '1.3.0; rm -rf' }) }), /格式不正确/);
  const traversal = packageZip('1.3.0', { 'local-board/../evil.js': text('x') });
  await assert.rejects(downloadUpdate({ siteUrl: 'https://jobs.example.com', currentVersion: '1.2.0', fetchImpl: fakeSite(traversal) }), /不安全的路径/);
  const mislabeled = packageZip('1.2.5');
  await assert.rejects(downloadUpdate({ siteUrl: 'https://jobs.example.com', currentVersion: '1.2.0', fetchImpl: fakeSite(mislabeled) }), /版本号.*不一致/);
});

test('installs program files, never touches data or config, keeps a backup and prunes old ones', async () => {
  const root = tempDir();
  writeFiles(root, {
    'version.json': '{"version":"1.2.0"}',
    'server.mjs': '// server 1.2.0',
    'lib/app.mjs': '// app 1.2.0',
    'public/index.html': '<p>1.2.0</p>',
    'config.json': '{"port":50000,"siteUrl":"https://my.example.com"}',
    'data/board.json': '{"cards":[{"id":"keep-me"}]}',
    'data/backups/board-2026-11-01.json': '{"cards":[]}',
  });
  const update = await downloadUpdate({ siteUrl: 'https://jobs.example.com', currentVersion: '1.2.0', fetchImpl: fakeSite(packageZip('1.3.0')) });
  const { backupDir } = applyUpdate(root, update, { fromVersion: '1.2.0', now: new Date(2026, 10, 14, 10) });

  assert.equal(readFileSync(join(root, 'server.mjs'), 'utf8'), '// server 1.3.0');
  assert.equal(readFileSync(join(root, 'public/new-file.js'), 'utf8'), '// added');
  assert.equal(readFileSync(join(root, 'config.json'), 'utf8'), '{"port":50000,"siteUrl":"https://my.example.com"}');
  assert.equal(readFileSync(join(root, 'data/board.json'), 'utf8'), '{"cards":[{"id":"keep-me"}]}');
  assert.ok(existsSync(join(root, 'data/backups/board-2026-11-01.json')));
  assert.ok(!existsSync(join(root, '.update-staging')));
  assert.equal(readFileSync(join(backupDir, 'server.mjs'), 'utf8'), '// server 1.2.0');
  assert.ok(!existsSync(join(backupDir, 'data')), 'user data is not copied into the program backup');
  assert.ok(!existsSync(join(backupDir, 'config.json')));

  // 回滚：恢复更新前的程序文件
  restoreBackup(root, backupDir);
  assert.equal(readFileSync(join(root, 'server.mjs'), 'utf8'), '// server 1.2.0');
  assert.equal(readFileSync(join(root, 'data/board.json'), 'utf8'), '{"cards":[{"id":"keep-me"}]}');

  for (let hour = 11; hour < 16; hour += 1) applyUpdate(root, update, { fromVersion: '1.2.0', now: new Date(2026, 10, 14, hour) });
  const kept = readdirSync(join(root, 'update-backups')).sort();
  assert.equal(kept.length, KEEP_BACKUPS);
  assert.equal(kept.at(-1), 'v1.2.0-20261114150000');
});

test('a missing config.json is created from the package', async () => {
  const root = tempDir();
  writeFiles(root, { 'version.json': '{"version":"1.2.0"}', 'server.mjs': '//' });
  const update = await downloadUpdate({ siteUrl: 'https://jobs.example.com', currentVersion: '1.2.0', fetchImpl: fakeSite(packageZip('1.3.0')) });
  applyUpdate(root, update, { fromVersion: '1.2.0' });
  assert.match(readFileSync(join(root, 'config.json'), 'utf8'), /jobs\.example\.com/);
});

function call(port, method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') }));
    });
    req.on('error', reject);
    req.end(method === 'POST' ? '{}' : undefined);
  });
}

test('the update endpoint installs, then asks the server to restart', async () => {
  const root = tempDir();
  writeFiles(root, { 'version.json': '{"version":"1.2.0"}', 'server.mjs': '// old', 'data/board.json': '{"cards":[]}' });
  const restarts = [];
  let port;
  const server = createServer(createHandler({ getPort: () => port, store: createStore(join(root, 'data')), publicDir: join(root, 'public'), config: { siteUrl: 'https://jobs.example.com' }, version: '1.2.0', fetchImpl: fakeSite(packageZip('1.3.0')), appDir: root, onUpdated: (info) => restarts.push(info) }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  try {
    const write = { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' };
    assert.equal((await call(port, 'POST', '/api/update', { 'content-type': 'application/json', origin: 'https://evil.example' })).status, 403);
    const info = await call(port, 'GET', '/api/info');
    assert.equal(info.body.canUpdate, true);
    const result = await call(port, 'POST', '/api/update', write);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { from: '1.2.0', to: '1.3.0' });
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    assert.equal(restarts.length, 1);
    assert.equal(restarts[0].to, '1.3.0');
    assert.equal(readFileSync(join(root, 'server.mjs'), 'utf8'), '// server 1.3.0');
    assert.equal(readFileSync(join(root, 'data/board.json'), 'utf8'), '{"cards":[]}');
  } finally {
    server.close();
  }
});

test('the real download package can be read and installed by the updater', async () => {
  const { buildZip } = await import('../../scripts/build-local-board.mjs');
  const entries = readZip(buildZip());
  assert.ok(entries.length > 10);
  for (const entry of entries) assert.ok(safeEntryPath(entry.name), entry.name);
  const names = entries.map((entry) => safeEntryPath(entry.name));
  for (const required of ['version.json', 'server.mjs', 'lib/app.mjs', 'lib/updater.mjs', 'lib/unzip.mjs', 'public/index.html']) assert.ok(names.includes(required), required);
  assert.ok(!names.some((name) => name.startsWith('data/') || name.startsWith('update-backups/') || name.startsWith('test/')));
});
