import { readFile, writeFile } from 'node:fs/promises';
import { currentCampusJob, dedupeJobs, normalizeOffer, validateDataset } from './job-data.mjs';
import { normalizeLocations } from './locations.mjs';

const API = 'https://openapi.offerxiansheng.com/backend-service/open/v1/campus-recruit';
const DATA_PATH = new URL('../public/jobs.json', import.meta.url);
// One-time manual backfill only. Keep the daily recent sync's two-page budget unchanged.
const MAX_SEARCH_PAGES = 10;

function chinaDate(daysAgo = 0) {
  const date = new Date(Date.now() - daysAgo * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

async function request(key, endpoint, { cursor, body } = {}) {
  const url = new URL(`${API}/${endpoint}`);
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify({ ...body, ...(cursor ? { cursor } : {}) }) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`offer先生 ${endpoint} HTTP ${response.status}`);
  const result = await response.json();
  if (result.code !== 1000) throw new Error(`offer先生 ${endpoint} 业务错误 ${result.code}；停止请求并保留旧数据`);
  if (!Array.isArray(result.data?.items)) throw new Error(`offer先生 ${endpoint} 返回格式不正确`);
  return result.data;
}

async function main() {
  if (process.env.OFFER_PUBLICATION_APPROVED !== 'true') throw new Error('offer先生数据发布未获授权');
  const key = process.env.OFFER_CAMPUS_API_KEY;
  if (!key) throw new Error('缺少 OFFER_CAMPUS_API_KEY secret');
  const previous = validateDataset(JSON.parse(await readFile(DATA_PATH, 'utf8')));
  if (previous.mode !== 'live') throw new Error('只能在已有真实数据上补充记录');

  const today = chinaDate();
  const incoming = [];
  let calls = 0;
  let cursor;
  const seen = new Set();
  for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
    // Search is ordered by update time. Follow its cursor to reach older records.
    const data = await request(key, 'search', { cursor, body: { limit: 100 } });
    calls++;
    incoming.push(...data.items.map(normalizeOffer).filter(Boolean));
    console.log(`历史校招搜索：第 ${page + 1} 页 ${data.items.length} 条；hasMore=${Boolean(data.hasMore)}`);
    if (!data.hasMore || !data.items.length) break;
    if (!data.nextCursor || seen.has(data.nextCursor)) { console.warn('::warning::搜索游标缺失或重复，停止翻页'); break; }
    cursor = data.nextCursor;
    seen.add(cursor);
    if (page < MAX_SEARCH_PAGES - 1) await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (calls >= MAX_SEARCH_PAGES) console.warn('::warning::搜索达到十页上限，未继续请求，以保留日常更新额度');

  const jobs = dedupeJobs([...previous.jobs, ...incoming]
    .filter((job) => currentCampusJob(job, today))
    .map((job) => ({ ...job, ...normalizeLocations(job.cities) })));
  const dataset = validateDataset({ ...previous, generatedAt: new Date().toISOString(), jobs });
  await writeFile(DATA_PATH, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  const previousOfferIds = new Set(previous.jobs.filter((job) => job.id.startsWith('offer-')).map((job) => job.id));
  const addedOffer = jobs.filter((job) => job.id.startsWith('offer-') && !previousOfferIds.has(job.id)).length;
  console.log(`本次 ${calls}/${MAX_SEARCH_PAGES} 次 API 请求，收到并标准化 ${incoming.length} 条，新增可展示 offer先生 ${addedOffer} 条；去重后网站 ${jobs.length} 条，offer先生 ${jobs.filter((job) => job.id.startsWith('offer-')).length} 条`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
