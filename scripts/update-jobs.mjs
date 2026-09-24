import { readFile, writeFile } from 'node:fs/promises';
import { currentCampusJob, dedupeJobs, normalizeOffer, normalizeXixicc, validateDataset } from './job-data.mjs';

const DATA_PATH = new URL('../public/jobs.json', import.meta.url);
const API = 'https://openapi.offerxiansheng.com/backend-service/open/v1/campus-recruit';
const permissionOffer = process.env.OFFER_PUBLICATION_APPROVED === 'true';
const permissionXixicc = process.env.XIXICC_REUSE_APPROVED === 'true';
const fullSync = process.env.FULL_SYNC === 'true';
const maxPages = Number.parseInt(process.env.MAX_PAGES || '100', 10);

function todayInChina() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function getOfferPage(key, cursor) {
  const url = new URL(`${API}/${fullSync ? 'search' : 'recent'}`);
  const method = fullSync ? 'POST' : 'GET';
  const body = { limit: 100, ...(fullSync ? { recruitmentBatch: '秋招' } : {}) };
  if (cursor) body.cursor = cursor;
  if (!fullSync) { url.searchParams.set('limit', '100'); if (cursor) url.searchParams.set('cursor', cursor); }
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${key}`, ...(fullSync ? { 'Content-Type': 'application/json' } : {}) }, ...(fullSync ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`offer先生 HTTP ${response.status}`);
  const result = await response.json();
  if (result.code !== 1000) throw new Error(`offer先生业务错误 ${result.code}; 停止更新并保留旧数据`);
  if (!Array.isArray(result.data?.items)) throw new Error('offer先生返回格式不正确');
  return result.data;
}

async function getOfferJobs(key) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 300) throw new Error('MAX_PAGES must be 1–300');
  const items = [];
  let cursor;
  const cursors = new Set();
  for (let page = 0; page < maxPages; page++) {
    const data = await getOfferPage(key, cursor);
    items.push(...data.items);
    console.log(`offer先生${fullSync ? '秋招搜索' : '近24小时'}：第 ${page + 1} 页，本页 ${data.items.length} 条`);
    if (!data.hasMore) return items.map(normalizeOffer).filter(Boolean);
    if (!data.nextCursor || cursors.has(data.nextCursor)) throw new Error('offer先生游标缺失或重复');
    cursor = data.nextCursor;
    cursors.add(cursor);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`offer先生超过 ${maxPages} 页，已停止以避免发布不完整数据`);
}

async function getXixiccJobs() {
  const response = await fetch('https://raw.githubusercontent.com/xixicc186/xixicc2027/main/jobs.json', { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`xixicc2027 HTTP ${response.status}`);
  const items = await response.json();
  if (!Array.isArray(items)) throw new Error('xixicc2027 返回格式不正确');
  return items.map(normalizeXixicc).filter(Boolean);
}

async function main() {
  if (!permissionOffer && !permissionXixicc) { console.log('数据发布许可尚未配置；保留当前数据。'); return; }
  const previous = validateDataset(JSON.parse(await readFile(DATA_PATH, 'utf8')));
  const today = todayInChina();
  const incoming = [];
  if (permissionOffer) {
    const key = process.env.OFFER_CAMPUS_API_KEY;
    if (!key) throw new Error('缺少 OFFER_CAMPUS_API_KEY secret');
    const offerJobs = await getOfferJobs(key);
    if (fullSync && !offerJobs.length) throw new Error('offer先生秋招搜索未返回记录；保留旧数据');
    incoming.push(...offerJobs);
  }
  if (permissionXixicc) incoming.push(...await getXixiccJobs());
  if (!incoming.length) throw new Error('本次无可发布记录；保留旧数据');
  const oldJobs = previous.mode === 'live' ? previous.jobs.filter((job) =>
    (!permissionOffer || !fullSync || !job.id.startsWith('offer-')) &&
    (!permissionXixicc || !job.id.startsWith('xixicc-'))
  ) : [];
  const jobs = dedupeJobs([...oldJobs, ...incoming].filter((job) => currentCampusJob(job, today)));
  if (!jobs.length) throw new Error('筛选后无可发布的校招记录；保留旧数据');
  const dataset = validateDataset({ schemaVersion: 1, generatedAt: new Date().toISOString(), mode: 'live', jobs });
  await writeFile(DATA_PATH, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  console.log(`已生成 ${jobs.length} 条记录：offer先生 ${jobs.filter((job) => job.id.startsWith('offer-')).length} 条，xixicc2027 ${jobs.filter((job) => job.id.startsWith('xixicc-')).length} 条`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
