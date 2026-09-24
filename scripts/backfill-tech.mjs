import { readFile, writeFile } from 'node:fs/promises';
import { currentCampusJob, dedupeJobs, normalizeOffer, validateDataset } from './job-data.mjs';
import { normalizeLocations } from './locations.mjs';

const API = 'https://openapi.offerxiansheng.com/backend-service/open/v1/campus-recruit/search';
const DATA_PATH = new URL('../public/jobs.json', import.meta.url);
const TARGET_NEW_TECH = 500;
const QUERIES = [
  { industry: 'IT/互联网/游戏', city: '北京' },
  { industry: 'IT/互联网/游戏', city: '上海' },
  { industry: 'IT/互联网/游戏', city: '深圳' },
  { industry: 'IT/互联网/游戏', city: '杭州' },
  { industry: '通信/电子/半导体', city: '深圳' },
  { industry: '通信/电子/半导体', city: '上海' },
  { industry: '通信/电子/半导体', city: '苏州' },
  { industry: '智能硬件', city: '深圳' },
  { industry: '智能硬件', city: '北京' },
  { industry: '智能硬件', city: '杭州' },
];

function todayInChina() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function isTechJob(job) {
  return /IT|互联网|游戏|软件|计算机|信息技术|通信|电子|半导体|智能硬件|自动驾驶|人工智能|云计算|数字科技|网络安全/i.test(job.industry || '')
    || /IT技术|软件|开发|前端|后端|算法|数据|测试|运维|信息安全|网络安全|人工智能|机器学习|云计算|嵌入式|芯片|硬件|计算机|编程|系统架构/i.test(job.title || '');
}

async function search(key, query) {
  const response = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...query, limit: 100 }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`offer先生搜索 HTTP ${response.status}`);
  const result = await response.json();
  if (result.code !== 1000) throw new Error(`offer先生搜索业务错误 ${result.code}；停止请求并保留旧数据`);
  if (!Array.isArray(result.data?.items)) throw new Error('offer先生搜索返回格式不正确');
  return result.data;
}

async function main() {
  if (process.env.OFFER_PUBLICATION_APPROVED !== 'true') throw new Error('offer先生数据发布未获授权');
  const key = process.env.OFFER_CAMPUS_API_KEY;
  if (!key) throw new Error('缺少 OFFER_CAMPUS_API_KEY secret');
  const previous = validateDataset(JSON.parse(await readFile(DATA_PATH, 'utf8')));
  if (previous.mode !== 'live') throw new Error('只能在已有真实数据上补充记录');

  const previousIds = new Set(previous.jobs.map((job) => job.id));
  const today = todayInChina();
  const incoming = [];
  let calls = 0;
  let jobs = previous.jobs;
  let addedTech = 0;

  for (const query of QUERIES) {
    const data = await search(key, query);
    calls++;
    incoming.push(...data.items.map(normalizeOffer).filter((job) => job && isTechJob(job)));
    jobs = dedupeJobs([...previous.jobs, ...incoming]
      .filter((job) => currentCampusJob(job, today))
      .map((job) => ({ ...job, ...normalizeLocations(job.cities) })));
    addedTech = jobs.filter((job) => isTechJob(job) && !previousIds.has(job.id)).length;
    console.log(`科技校招搜索：${query.industry} / ${query.city}，返回 ${data.items.length} 条，累计新增可展示 ${addedTech} 条；hasMore=${Boolean(data.hasMore)}`);
    if (addedTech >= TARGET_NEW_TECH) {
      console.log(`本轮新增达到 ${TARGET_NEW_TECH} 条，停止请求`);
      break;
    }
    if (calls < QUERIES.length) await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  if (JSON.stringify(jobs) !== JSON.stringify(previous.jobs)) {
    const dataset = validateDataset({ ...previous, generatedAt: new Date().toISOString(), jobs });
    await writeFile(DATA_PATH, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  }
  console.log(`本次 ${calls}/${QUERIES.length} 次 API 请求；新增可展示科技校招 ${addedTech} 条，网站科技校招 ${jobs.filter(isTechJob).length} 条，总计 ${jobs.length} 条`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
