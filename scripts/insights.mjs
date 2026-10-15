import { fieldValues } from '../src/job-fields.mjs';
import { normalizeIndustry } from '../src/industries.mjs';
import { classifyFamily, familyReport, FAMILY_NAMES } from '../src/job-families.mjs';

// “全国”“海外”不是具体城市，单独计数，不进城市排行。
export const BROAD_LOCATIONS = ['全国', '海外'];
const chinaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });

function tally(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
}

// [[名称, 数量], ...]，数量降序，同数按名称排，保证输出稳定。
function ranked(counts, limit = Infinity) {
  return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'zh-CN')).slice(0, limit);
}

export function normalizeCohort(value) {
  if (/^(19|20)\d{2}届$/.test(value)) return value;
  return /^不限/.test(value) ? '不限' : '其他';
}

/** 岗位库 → 洞察页用的小体积统计。只依赖数据本身，同一份数据多次运行结果相同。 */
export function buildInsights(dataset) {
  const jobs = dataset.jobs;
  const referenceDate = dataset.generatedAt ? chinaDate.format(new Date(dataset.generatedAt)) : null;
  const specificCities = (job) => (job.cities || []).filter((city) => !BROAD_LOCATIONS.includes(city));
  const familiesByJob = jobs.map((job) => fieldValues(classifyFamily(job.title)));

  const cityCounts = tally(jobs.flatMap(specificCities));
  const familyCities = new Map(FAMILY_NAMES.map((name) => [name, []]));
  jobs.forEach((job, index) => { for (const family of familiesByJob[index]) familyCities.get(family).push(...specificCities(job)); });
  const familyCounts = tally(familiesByJob.flat());
  const companyCounts = tally(jobs.map((job) => job.company));
  const withDeadline = jobs.filter((job) => job.deadline);
  const report = familyReport(jobs, 0);

  return {
    schemaVersion: 1,
    generatedAt: dataset.generatedAt || null,
    referenceDate,
    totals: {
      jobs: jobs.length,
      companies: companyCounts.size,
      cities: cityCounts.size,
      provinces: new Set(jobs.flatMap((job) => job.provinces || [])).size,
      multiCityJobs: jobs.filter((job) => (job.cities || []).length > 1).length,
      noCityJobs: jobs.filter((job) => !(job.cities || []).length).length,
    },
    broadLocations: BROAD_LOCATIONS.map((name) => [name, jobs.filter((job) => (job.cities || []).includes(name)).length]),
    cities: ranked(cityCounts, 20),
    provinces: ranked(tally(jobs.flatMap((job) => job.provinces || []))),
    industries: ranked(tally(jobs.flatMap((job) => [...new Set(fieldValues(job.industry).map(normalizeIndustry))]))),
    families: FAMILY_NAMES.map((name) => ({ name, count: familyCounts.get(name) || 0, topCities: ranked(tally(familyCities.get(name)), 3) }))
      .sort((a, b) => b.count - a.count),
    otherFamilyShare: report.otherShare,
    companies: {
      top: ranked(companyCounts, 10),
      singleRecord: [...companyCounts.values()].filter((count) => count === 1).length,
    },
    deadlines: {
      withDeadline: withDeadline.length,
      // 只保留统计基准日及以后的日期；页面再按访问当天分周
      byDate: ranked(tally(withDeadline.map((job) => job.deadline).filter((date) => !referenceDate || date >= referenceDate)))
        .sort((a, b) => a[0].localeCompare(b[0])),
    },
    cohorts: ranked(tally(jobs.flatMap((job) => [...new Set(fieldValues(job.cohort).map(normalizeCohort))]))),
    sources: ranked(tally(jobs.map((job) => (job.id.startsWith('offer-') ? 'offer先生' : job.id.startsWith('xixicc-') ? 'xixicc2027' : job.id.startsWith('manual-') ? '手动导入' : '其他')))),
  };
}
