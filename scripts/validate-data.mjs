import { readFile } from 'node:fs/promises';
import { validateDataset } from './job-data.mjs';

const data = validateDataset(JSON.parse(await readFile(new URL('../public/jobs.json', import.meta.url), 'utf8')));
console.log(`数据校验通过：${data.jobs.length} 条，模式 ${data.mode}`);
