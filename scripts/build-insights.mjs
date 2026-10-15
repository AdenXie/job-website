import { readFile, writeFile } from 'node:fs/promises';
import { validateDataset } from './job-data.mjs';
import { buildInsights } from './insights.mjs';
import { classifyFamily, familyReport } from '../src/job-families.mjs';

const DATA_PATH = new URL('../public/jobs.json', import.meta.url);
const INSIGHTS_PATH = new URL('../public/insights.json', import.meta.url);

const dataset = validateDataset(JSON.parse(await readFile(DATA_PATH, 'utf8')));

// 修改岗位族词典后，用 --write-jobs 立即刷新 jobs.json 里的 family；日常同步会自动重算。
if (process.argv.includes('--write-jobs')) {
  let changed = 0;
  dataset.jobs = dataset.jobs.map((job) => {
    const family = classifyFamily(job.title);
    if (job.family !== family) changed += 1;
    return { ...job, family };
  });
  if (changed) await writeFile(DATA_PATH, `${JSON.stringify(validateDataset(dataset), null, 2)}\n`, 'utf8');
  console.log(`jobs.json 岗位族：更新 ${changed} 条`);
}

const insights = buildInsights(dataset);
const text = `${JSON.stringify(insights)}\n`;
await writeFile(INSIGHTS_PATH, text, 'utf8');
console.log(`已生成 insights.json：${insights.totals.jobs} 条岗位，${(Buffer.byteLength(text) / 1024).toFixed(1)} KB`);

const report = familyReport(dataset.jobs, 20);
console.log(`岗位族“其他”：${report.other} 条，占 ${(report.otherShare * 100).toFixed(1)}%`);
console.log(`高频未归类职位片段（可补充到 src/job-families.mjs）：${report.unmatched.map(([name, count]) => `${name} ${count}`).join('，')}`);
