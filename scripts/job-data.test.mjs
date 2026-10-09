import assert from 'node:assert/strict';
import test from 'node:test';
import { currentCampusJob, dedupeJobs, mergeCampusJobs, normalizeOffer, normalizeXixicc, validateDataset } from './job-data.mjs';
import { fieldValues, hasFieldValue } from '../src/job-fields.mjs';

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

test('keeps autumn campus hiring, removes internship and explicitly expired records', () => {
  const today = '2026-09-25';
  const base = { id: 'offer-1', title: '研发岗', program: '2027届秋招', batch: '秋招专场', cohort: '2027届', deadline: null };
  assert.equal(currentCampusJob(base, today), true);
  assert.equal(currentCampusJob({ ...base, deadline: '2026-09-24' }, today), false);
  assert.equal(currentCampusJob({ ...base, deadline: today }, today), true);
  assert.equal(currentCampusJob({ ...base, title: '研发实习生' }, today), false);
  assert.equal(currentCampusJob({ ...base, cohort: '2025届' }, today), false);
  assert.equal(currentCampusJob({ ...base, id: 'xixicc-1', batch: '正式批', program: null }, today), true);
  assert.equal(currentCampusJob({ ...base, id: 'xixicc-1', batch: '开放日', program: null }, today), false);
});

test('filters individual values from multi-industry, multi-cohort and multi-batch records', () => {
  assert.deepEqual(fieldValues('IT/互联网/游戏、电子/通信/半导体'), ['IT/互联网/游戏', '电子/通信/半导体']);
  assert.equal(hasFieldValue('2026届、2027届', '2027届'), true);
  assert.equal(hasFieldValue('春招补招、秋招提前批', '秋招提前批'), true);
  assert.equal(hasFieldValue('2026届、2027届', '2028届'), false);
  assert.equal(hasFieldValue(null, ''), true);
});

test('daily sync retains manual campus jobs and expires them by the same rules', () => {
  const job = { id: 'manual-1', company: '公司', title: '研发岗', cities: ['合肥市'], cohort: '2025届、2027届', batch: '秋招专场', deadline: null };
  const result = mergeCampusJobs([job], [], '2026-10-09');
  assert.equal(result.length, 1);
  assert.equal(result[0].id, job.id);
  assert.deepEqual(result[0].cities, ['合肥']);
  assert.equal(mergeCampusJobs([{ ...job, deadline: '2026-10-08' }], [], '2026-10-09').length, 0);
  assert.equal(mergeCampusJobs([{ ...job, title: '实习生' }], [], '2026-10-09').length, 0);
  assert.equal(currentCampusJob({ ...job, cohort: '2024届、2025届' }, '2026-10-09'), false);
});

test('official updates retain the ID and manually enriched facts while applying new deadlines', () => {
  const old = { id: 'offer-1', company: '公司', title: '研发岗、测试岗', industry: 'IT', cities: ['合肥'], cohort: '2027届', batch: '秋招', deadline: '2026-11-01', source: '企业官网', manualUpdatedAt: '2026-10-09T00:00:00Z' };
  const fresh = { ...old, manualUpdatedAt: undefined, title: '研发岗', cities: ['北京'], deadline: '2026-10-10' };
  const result = mergeCampusJobs([old], [fresh], '2026-10-09');
  assert.equal(result.length, 1);
  assert.equal(result[0].id, old.id);
  assert.equal(result[0].title, old.title);
  assert.equal(result[0].source, old.source);
  assert.equal(result[0].manualUpdatedAt, old.manualUpdatedAt);
  assert.equal(result[0].deadline, fresh.deadline);
  assert.deepEqual(result[0].cities, ['合肥', '北京']);
  assert.equal(mergeCampusJobs([old], [{ ...fresh, deadline: '2026-10-08' }], '2026-10-09').length, 0);
});

test('updates with changed job fields do not produce two records with the same ID', () => {
  const old = { id: 'offer-1', company: '公司', title: '研发岗', cities: ['北京'], cohort: '2027届', batch: '秋招' };
  const result = dedupeJobs([old, { ...old, title: '算法岗', cities: ['上海'] }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, old.id);
  assert.equal(result[0].title, '算法岗');
});

test('different manually imported campaigns with identical titles keep their IDs and links', () => {
  const old = { id: 'manual-1', company: '公司', title: '研发岗', cities: ['北京'], cohort: '2027届', batch: '秋招', applyUrl: 'https://example.com/a' };
  assert.equal(dedupeJobs([old, { ...old, id: 'manual-2', applyUrl: 'https://example.com/b' }]).length, 2);
});
