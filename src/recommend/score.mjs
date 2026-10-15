// “为你推荐”打分：按方向、城市、届别、行业给岗位排序。岗位没有职位描述，所以只比较这些字段。纯函数。
import { fieldValues } from '../job-fields.mjs';
import { normalizeIndustry } from '../industries.mjs';
import { BROAD_LOCATIONS } from './profile.mjs';

// 调整权重只改这里，改完运行 npm test 并用 scripts/recommend-preview.mjs 看三份测试画像的前 10 条。
export const WEIGHTS = {
  // 画像里第 1、2、3 个方向的权重：用户最想做的方向明显优先
  familyRank: [1, 0.7, 0.5],
  // 覆盖面很广的岗位族只说明“这是个校招项目”，信息量低，命中时只给少量分。
  // 研发/工程约占全库 62%，职能、销售/市场各约 37%，单靠稀有度降不够，再乘这个系数
  broadFamilies: { '研发/工程': 0.3, '职能': 0.3, '销售/市场': 0.3, '其他': 0.1 },
  // 一条记录列出的岗位族越多越像整场校招的汇总，按 1/k^0.7 摊薄每个命中的分值
  // （k=1 不变，k=2 约 0.62，k=4 约 0.38）。0.5 时四个岗位族的汇总记录仍会进前 10；
  // 不用 1/k，因为汇总记录里确实可能有该方向的岗位
  familySpreadExponent: 0.7,
  // 城市、行业是硬性偏好，给到与一个中等稀有岗位族（idf≈2）相当的分值
  city: 2,
  // “全国”表示多地招聘，大概率包含意向城市，但不确定，给一半
  nationwide: 1,
  industry: 1.5,
  // 7 天内截止只是提醒性的轻微加分，不能盖过方向匹配；没有截止日期不扣分
  deadlineSoon: 0.3,
};

/** 统计每个岗位族覆盖多少条岗位，用于计算稀有度。 */
export function familyStats(jobs) {
  const counts = new Map();
  for (const job of jobs) for (const family of fieldValues(job.family)) counts.set(family, (counts.get(family) || 0) + 1);
  return { total: jobs.length, counts };
}

// 类似 IDF：ln(总数 / 覆盖条数)。后端开发（约 700 条）≈2.5，前端开发（约 200 条）≈3.7，研发/工程（约 5300 条）≈0.5
function rarity(family, stats) {
  const count = stats.counts.get(family) || 1;
  return Math.log(Math.max(stats.total, 1) / count) + 0.1;
}

function daysUntil(date, today) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

/** 单条岗位 → { score, reasons } 或 null（届别不符或已过期，直接排除）。reasons 用于展示命中标签。 */
export function scoreJob(job, profile, stats, today) {
  if (job.deadline && today && job.deadline < today) return null;
  const reasons = [];
  let cohortReason = null;
  let score = 0;

  if (profile.cohort) {
    const cohorts = fieldValues(job.cohort);
    // 没写届别的岗位无法判断，保留；“不限”保留
    if (cohorts.length && !cohorts.includes(profile.cohort) && !cohorts.some((value) => /^不限/.test(value))) return null;
    if (cohorts.includes(profile.cohort)) cohortReason = { type: 'cohort', label: profile.cohort };
    else if (cohorts.some((value) => /^不限/.test(value))) cohortReason = { type: 'cohort', label: '届别不限' };
  }

  const families = fieldValues(job.family);
  const spread = Math.max(1, families.length) ** WEIGHTS.familySpreadExponent;
  profile.families.forEach((family, index) => {
    if (!families.includes(family)) return;
    const broad = WEIGHTS.broadFamilies[family] ?? 1;
    score += ((WEIGHTS.familyRank[index] ?? 0.4) * rarity(family, stats) * broad) / spread;
    reasons.push({ type: 'family', label: family });
  });

  if (profile.cities.length) {
    const cities = job.cities || [];
    const hit = profile.cities.find((city) => cities.includes(city));
    if (hit) { score += WEIGHTS.city; reasons.push({ type: 'city', label: hit }); }
    else if (cities.includes(BROAD_LOCATIONS[0])) { score += WEIGHTS.nationwide; reasons.push({ type: 'city', label: '全国' }); }
  }

  // 标签按“方向、城市、届别、行业、截止”的顺序展示
  if (cohortReason) reasons.push(cohortReason);

  if (profile.industries.length) {
    const industries = fieldValues(job.industry).map(normalizeIndustry);
    const hit = profile.industries.find((industry) => industries.includes(industry));
    if (hit) { score += WEIGHTS.industry; reasons.push({ type: 'industry', label: hit }); }
  }

  if (job.deadline && today) {
    const days = daysUntil(job.deadline, today);
    if (days >= 0 && days <= 7) { score += WEIGHTS.deadlineSoon; reasons.push({ type: 'deadline', label: days === 0 ? '今天截止' : `${days} 天内截止` }); }
  }

  return { score, reasons };
}

/** 给岗位列表打分并排序，届别不符或过期的岗位被排除。同分时保持传入顺序（通常是最近更新）。 */
export function rankJobs(jobs, profile, { stats = familyStats(jobs), today } = {}) {
  const ranked = [];
  jobs.forEach((job, index) => {
    const result = scoreJob(job, profile, stats, today);
    if (result) ranked.push({ job, index, ...result });
  });
  return ranked.sort((a, b) => b.score - a.score || a.index - b.index);
}
