import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { atomicWriteJson, createStore, localDate } from '../lib/store.mjs';
import { listFiles } from '../../scripts/build-local-board.mjs';

const card = (id) => ({ job: { id, company: '某公司', title: '岗位' }, status: 'wish' });

test('writes atomically through a temporary file and leaves no temp files behind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'local-board-store-'));
  try {
    const file = join(dir, 'board.json');
    writeFileSync(file, '{"old":true}');
    atomicWriteJson(file, { cards: [] });
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { cards: [] });
    assert.deepEqual(readdirSync(dir), ['board.json']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('names backups by the local calendar date', () => {
  assert.equal(localDate(new Date(2026, 9, 16, 1, 30)), '2026-10-16');
});

test('keeps one backup per day and only the latest seven', () => {
  const dir = mkdtempSync(join(tmpdir(), 'local-board-store-'));
  try {
    let day = 1;
    const store = createStore(dir, { today: () => `2026-10-${String(day).padStart(2, '0')}` });
    assert.equal(store.load().cards.length, 0);
    store.save({ cards: [card('offer-0')] });
    assert.equal(existsSync(store.backupDir), false);
    for (day = 1; day <= 10; day += 1) {
      store.save({ cards: [card(`offer-${day}`)] });
      store.save({ cards: [card(`offer-${day}b`)] });
    }
    const backups = readdirSync(store.backupDir).sort();
    assert.equal(backups.length, 7);
    assert.equal(backups[0], 'board-2026-10-04.json');
    // 每天的备份是当天第一次写入前的内容
    assert.equal(JSON.parse(readFileSync(join(store.backupDir, 'board-2026-10-05.json'), 'utf8')).cards[0].id, 'offer-4b');
    assert.equal(store.load().cards[0].id, 'offer-10b');
    assert.throws(() => store.save({ nope: true }), /格式不正确/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the download package excludes user data and tests', () => {
  const files = listFiles();
  assert.ok(files.includes('server.mjs') && files.includes('start.bat') && files.includes('public/index.html'));
  assert.equal(files.some((name) => name.startsWith('data/') || name.startsWith('test/') || name.endsWith('.test.mjs')), false);
});
