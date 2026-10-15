import assert from 'node:assert/strict';
import test from 'node:test';
import { detectProfile, editProfile, mergeDetected, parseProfile, readStoredResume, RESUME_KEY } from '../src/recommend/profile.mjs';
import { familyStats, rankJobs, scoreJob } from '../src/recommend/score.mjs';
import { emptyResume, sampleResume } from '../src/resume/sample.js';

const storage = (value) => ({ getItem: (key) => (key === RESUME_KEY ? value : null) });

test('never builds a profile from the sample resume or an empty one', () => {
  assert.equal(readStoredResume(storage(null)), null);
  assert.equal(readStoredResume(storage('not json')), null);
  assert.equal(readStoredResume(storage(JSON.stringify(sampleResume()))), null);
  // 早期版本保存的示例没有 sample 标记
  const legacy = sampleResume();
  delete legacy.sample;
  assert.equal(readStoredResume(storage(JSON.stringify(legacy))), null);
  assert.equal(readStoredResume(storage(JSON.stringify(emptyResume()))), null);
  const own = emptyResume();
  own.basics.title = '求职意向：数据分析';
  assert.equal(readStoredResume(storage(JSON.stringify(own))).basics.title, '求职意向：数据分析');
});

test('detects directions with the job intention first, cities and the graduation cohort', () => {
  const resume = emptyResume();
  resume.basics = { ...resume.basics, title: '求职意向：后端开发工程师（上海/杭州）', city: '南京', phone: '13900000000', email: 'a@example.com' };
  resume.sections[0].items = [{ id: '1', name: '某大学', role: '统计学 · 本科', date: '2023.09 – 2027.06', desc: '' }];
  resume.sections[1].items = [
    { id: '2', name: '某公司', role: '数据分析实习生', date: '2026.06 – 2026.09', desc: '' },
    { id: '3', name: '某公司', role: '测试开发实习生', date: '2025.07 – 2025.08', desc: '' },
  ];
  const profile = detectProfile(resume, ['上海', '杭州', '南京', '北京', '全国']);
  assert.deepEqual(profile.families, ['后端开发', '数据分析', '测试']);
  assert.deepEqual(profile.cities, ['南京', '上海', '杭州']);
  assert.equal(profile.cohort, '2027届');
  assert.deepEqual(profile.industries, []);
  // 画像只有推荐需要的字段，不带联系方式
  assert.deepEqual(Object.keys(profile).sort(), ['cities', 'cohort', 'families', 'industries']);
  resume.sections[0].items[0].date = '2022.09 – 2026.12';
  assert.equal(detectProfile(resume).cohort, '2027届');
});

test('manual edits survive re-detection unless the user asks to re-detect', () => {
  let profile = mergeDetected(null, { families: ['后端开发'], cities: ['上海'], cohort: '2027届', industries: [] }, { source: 'resume', now: 't1' });
  profile = editProfile(profile, 'cities', ['北京'], 't2');
  profile = mergeDetected(profile, { families: ['算法'], cities: ['深圳'], cohort: '2027届', industries: [] }, { source: 'resume', now: 't3' });
  assert.deepEqual(profile.cities, ['北京']);
  assert.deepEqual(profile.families, ['算法']);
  profile = mergeDetected(profile, { families: ['算法'], cities: ['深圳'], cohort: '2027届', industries: [] }, { source: 'resume', reset: true, now: 't4' });
  assert.deepEqual(profile.cities, ['深圳']);
  assert.deepEqual(profile.edited, {});
  assert.deepEqual(parseProfile({ ...profile, phone: '13900000000', cities: ['深圳', 3] }).cities, ['深圳']);
  assert.equal('phone' in parseProfile({ ...profile, phone: '13900000000' }), false);
});

test('excludes other cohorts, keeps unrestricted ones and skips expired jobs', () => {
  const profile = { families: [], cities: [], cohort: '2027届', industries: [] };
  const stats = { total: 10, counts: new Map() };
  assert.equal(scoreJob({ cohort: '2026届', family: '测试' }, profile, stats, '2026-10-16'), null);
  assert.deepEqual(scoreJob({ cohort: '2026届、2027届' }, profile, stats, '2026-10-16').reasons, [{ type: 'cohort', label: '2027届' }]);
  assert.deepEqual(scoreJob({ cohort: '不限' }, profile, stats, '2026-10-16').reasons, [{ type: 'cohort', label: '届别不限' }]);
  assert.equal(scoreJob({ cohort: '2027届', deadline: '2026-10-15' }, profile, stats, '2026-10-16'), null);
});

test('rare and focused job families outrank broad ones and multi-family summaries', () => {
  const jobs = [
    ...Array.from({ length: 60 }, (_, index) => ({ id: `broad-${index}`, family: '研发/工程' })),
    ...Array.from({ length: 5 }, (_, index) => ({ id: `backend-${index}`, family: '后端开发' })),
    { id: 'summary', family: '后端开发、前端开发、测试、产品、运营' },
    { id: 'focused', family: '后端开发' },
  ];
  const stats = familyStats(jobs);
  const score = (id, families) => scoreJob(jobs.find((job) => job.id === id), { families, cities: [], cohort: '', industries: [] }, stats, '2026-10-16').score;
  assert.ok(score('focused', ['后端开发']) > 2 * score('summary', ['后端开发']));
  assert.ok(score('focused', ['后端开发']) > 5 * score('broad-0', ['研发/工程']));
  const ranked = rankJobs(jobs, { families: ['研发/工程', '后端开发'], cities: [], cohort: '', industries: [] }, { stats, today: '2026-10-16' });
  assert.equal(ranked[0].job.family, '后端开发');
});

test('city, industry and an upcoming deadline add explained points without penalising missing dates', () => {
  const profile = { families: [], cities: ['上海'], cohort: '', industries: ['电子/通信/半导体'] };
  const stats = { total: 1, counts: new Map() };
  const result = scoreJob({ cities: ['上海', '北京'], industry: '通信/电子/半导体', deadline: '2026-10-20' }, profile, stats, '2026-10-16');
  assert.deepEqual(result.reasons.map((reason) => reason.label), ['上海', '电子/通信/半导体', '4 天内截止']);
  assert.deepEqual(scoreJob({ cities: ['全国'] }, profile, stats, '2026-10-16').reasons, [{ type: 'city', label: '全国' }]);
  assert.equal(scoreJob({ cities: ['广州'] }, profile, stats, '2026-10-16').score, 0);
});
