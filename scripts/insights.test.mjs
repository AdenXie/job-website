import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeIndustry } from '../src/industries.mjs';
import { buildInsights, normalizeCohort } from './insights.mjs';
import { classifyFamily, familyReport, FAMILY_NAMES } from '../src/job-families.mjs';
import { mergeCampusJobs, validateDataset } from './job-data.mjs';

test('normalizes differently written industries to one name', () => {
  assert.equal(normalizeIndustry('通信/电子/半导体'), '电子/通信/半导体');
  assert.equal(normalizeIndustry('电子 / 通信／半导体'), '电子/通信/半导体');
  assert.equal(normalizeIndustry('房地产业/建筑业'), '房地产/建筑');
  assert.equal(normalizeIndustry('机械/制造业'), '制造业');
  assert.equal(normalizeIndustry('金融业'), '金融业');
  assert.equal(normalizeIndustry('33'), '其他');
  assert.equal(normalizeIndustry(''), '其他');
});

test('classifies each title segment into job families and keeps the specific one', () => {
  assert.equal(classifyFamily('Java后端开发工程师'), '后端开发');
  assert.equal(classifyFamily('管培生、产品经理'), '产品、管培生');
  assert.equal(classifyFamily('销售工程师'), '销售/市场');
  assert.equal(classifyFamily('AI产品经理'), '产品');
  assert.equal(classifyFamily('IT技术、测试工程师'), '测试');
  assert.equal(classifyFamily('工艺工程师'), '研发/工程');
  assert.equal(classifyFamily('企业公告内查看'), '其他');
  // 芯片的“数字后端”不是软件后端；“数据分析师”不是金融分析师
  assert.equal(classifyFamily('数字后端工程师'), '硬件/嵌入式');
  assert.equal(classifyFamily('数据分析师'), '数据分析');
  assert.equal(classifyFamily('IBD-分析师'), '金融/财务');
  for (const value of classifyFamily('研发类、工程师、硬件、财务').split('、')) assert.ok(FAMILY_NAMES.includes(value));
});

test('reports the share of unclassified titles and their frequent segments', () => {
  const report = familyReport([{ title: '其他职位' }, { title: '其他职位、校招项目' }, { title: '算法工程师' }, { title: '销售' }]);
  assert.equal(report.other, 2);
  assert.equal(report.otherShare, 0.5);
  assert.deepEqual(report.unmatched, [['其他职位', 2], ['校招项目', 1]]);
});

test('daily sync writes job families and validation rejects unknown ones', () => {
  const job = { id: 'manual-1', company: '公司', title: '算法工程师', cities: ['北京'], cohort: '2027届', batch: '秋招专场', deadline: null, source: '手动导入', verification: 'unverified' };
  assert.equal(mergeCampusJobs([job], [], '2026-10-16')[0].family, '算法');
  assert.throws(() => validateDataset({ schemaVersion: 1, mode: 'live', jobs: [{ ...job, family: '宇航员' }] }), /Invalid family/);
});

test('aggregates multi-value fields per job and keeps deadline coverage explicit', () => {
  const base = { company: '甲', title: '后端开发', cities: ['北京', '上海'], provinces: ['北京', '上海'], industry: '电子/通信/半导体、通信/电子/半导体', cohort: '2026届、2027届', deadline: null };
  const insights = buildInsights({
    generatedAt: '2026-10-15T07:00:00.000Z',
    jobs: [
      { ...base, id: 'offer-1', deadline: '2026-10-20' },
      { ...base, id: 'offer-2', company: '乙', title: '销售', cities: ['全国'], provinces: [], deadline: '2026-10-01' },
      { ...base, id: 'manual-3', cohort: '20272届', industry: '金融业' },
    ],
  });
  assert.equal(insights.referenceDate, '2026-10-15');
  assert.deepEqual(insights.totals, { jobs: 3, companies: 2, cities: 2, provinces: 2, multiCityJobs: 2, noCityJobs: 0 });
  assert.deepEqual(insights.cities, [['北京', 2], ['上海', 2]]);
  assert.deepEqual(insights.broadLocations, [['全国', 1], ['海外', 0]]);
  // 同一条记录里两种写法的同一行业只计一次
  assert.deepEqual(insights.industries, [['电子/通信/半导体', 2], ['金融业', 1]]);
  assert.deepEqual(insights.cohorts, [['2026届', 2], ['2027届', 2], ['其他', 1]]);
  assert.deepEqual(insights.families.find((family) => family.name === '后端开发'), { name: '后端开发', count: 2, topCities: [['北京', 2], ['上海', 2]] });
  assert.deepEqual(insights.deadlines, { withDeadline: 2, byDate: [['2026-10-20', 1]] });
  assert.deepEqual(insights.companies, { top: [['甲', 2], ['乙', 1]], singleRecord: 1 });
  assert.deepEqual(insights.sources, [['offer先生', 2], ['手动导入', 1]]);
  assert.equal(normalizeCohort('不限届'), '不限');
});
