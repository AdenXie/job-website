import { readFile } from 'node:fs/promises';
import { validateDataset } from './job-data.mjs';

const data = validateDataset(JSON.parse(await readFile(new URL('../public/jobs.json', import.meta.url), 'utf8')));
// 真实数据每条都要有岗位族（由同步流程写入），演示数据不要求
if (data.mode === 'live') {
  const missing = data.jobs.filter((job) => job.family === undefined);
  if (missing.length) throw new Error(`缺少岗位族 family：${missing.length} 条，例如 ${missing[0].id}；运行 npm run build:insights -- --write-jobs`);
}
try {
  const insights = JSON.parse(await readFile(new URL('../public/insights.json', import.meta.url), 'utf8'));
  if (insights.generatedAt !== data.generatedAt || insights.totals?.jobs !== data.jobs.length) console.warn('::warning::insights.json 与 jobs.json 不一致；构建前会自动重新生成，也可运行 npm run build:insights');
} catch {
  console.warn('::warning::缺少 public/insights.json；构建前会自动生成');
}
console.log(`数据校验通过：${data.jobs.length} 条，模式 ${data.mode}`);
