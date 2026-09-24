import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeJobs, normalizeOffer, normalizeXixicc, validateDataset } from './job-data.mjs';

test('normalizes offer timestamps, links and missing fields without inventing a hiring state', () => {
  const job = normalizeOffer({ id: 'abc', enterpriseName: '示例公司', recruitInfoName: '秋招', cityNameList: '北京,上海', endTime: '2026-10-01', updateTime: '2026-09-24 12:00:00', url: 'javascript:alert(1)', releaseSource: '企业官网' });
  assert.equal(job.updatedAt, '2026-09-24T12:00:00+08:00');
  assert.deepEqual(job.cities, ['北京', '上海']);
  assert.equal(job.applyUrl, null);
  assert.equal(job.verification, 'unverified');
});

test('normalizes xixicc records while retaining attribution', () => {
  const job = normalizeXixicc({ company: '示例公司', positions: ['工程师'], locations: ['武汉'], cohort: '2027届', last_seen: '2026-09-24', apply_url: 'https://example.com/apply' });
  assert.equal(job.source, 'xixicc2027');
  assert.match(job.sourceUrl, /xixicc2027/);
  assert.equal(job.applyUrl, 'https://example.com/apply');
});

test('deduplicates matching opportunities and prefers the record with a usable link', () => {
  const base = { id: 'a', company: '公司', title: '岗位', cohort: '2027届', batch: '秋招', cities: ['北京'], updatedAt: '2026-09-24T00:00:00Z', applyUrl: null };
  const result = dedupeJobs([base, { ...base, id: 'b', applyUrl: 'https://example.com/apply' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'b');
});

test('rejects duplicate IDs and unsafe URLs', () => {
  const job = { id: 'a', company: '公司', title: '岗位', cities: [], source: '来源', verification: 'unverified', applyUrl: 'javascript:alert(1)' };
  assert.throws(() => validateDataset({ schemaVersion: 1, mode: 'live', jobs: [job] }), /Unsafe URL/);
});
