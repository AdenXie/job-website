// 调整“为你推荐”权重时用：对当前 jobs.json 跑几份测试画像，打印前 N 条和命中原因。
// 用法：node scripts/recommend-preview.mjs [条数]
import { readFile } from 'node:fs/promises';
import { familyStats, rankJobs } from '../src/recommend/score.mjs';

const PROFILES = {
  '后端开发 + 上海 + 2027届': { families: ['后端开发'], cities: ['上海'], cohort: '2027届', industries: [] },
  '数据分析 + 北京': { families: ['数据分析'], cities: ['北京'], cohort: '', industries: [] },
  '金融/财务 + 不限城市': { families: ['金融/财务'], cities: [], cohort: '', industries: [] },
};

const limit = Number.parseInt(process.argv[2] || '10', 10);
const { jobs } = JSON.parse(await readFile(new URL('../public/jobs.json', import.meta.url), 'utf8'));
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
// 与首页一致：先去掉已过截止日的记录，再按最近更新排序，作为同分时的次序
const visible = jobs.filter((job) => !job.deadline || job.deadline >= today)
  .sort((a, b) => (b.updatedAt || b.manualUpdatedAt || '').localeCompare(a.updatedAt || a.manualUpdatedAt || ''));
const stats = familyStats(visible);

for (const [name, profile] of Object.entries(PROFILES)) {
  const ranked = rankJobs(visible, profile, { stats, today });
  console.log(`\n## ${name}（参与排序 ${ranked.length} 条）`);
  ranked.slice(0, limit).forEach(({ job, score, reasons }, index) => {
    console.log(`${String(index + 1).padStart(2)}. [${score.toFixed(2)}] ${job.company} | ${job.title.slice(0, 40)} | 岗位族：${job.family} | ${reasons.map((reason) => `✓${reason.label}`).join(' ')}`);
  });
}
