import { readFile, writeFile } from 'node:fs/promises';
import { currentCampusJob, dedupeJobs, normalizeOffer, normalizeXixicc, validateDataset } from './job-data.mjs';
import { normalizeLocations } from './locations.mjs';

const DATA_PATH = new URL('../public/jobs.json', import.meta.url);
const API = 'https://openapi.offerxiansheng.com/backend-service/open/v1/campus-recruit';
const permissionOffer = process.env.OFFER_PUBLICATION_APPROVED === 'true';
const permissionXixicc = process.env.XIXICC_REUSE_APPROVED === 'true';
const maxRecentPages = Number.parseInt(process.env.MAX_RECENT_PAGES || '1', 10);
const recentPageSize = Number.parseInt(process.env.RECENT_PAGE_SIZE || '100', 10);

function todayInChina() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function getOfferPage(key, cursor) {
  const url = new URL(`${API}/recent`);
  url.searchParams.set('limit', String(recentPageSize));
  if (cursor) url.searchParams.set('cursor', cursor);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`offer先生 HTTP ${response.status}`);
  const result = await response.json();
  if (result.code !== 1000) throw new Error(`offer先生业务错误 ${result.code}; 停止更新并保留旧数据`);
  if (!Array.isArray(result.data?.items)) throw new Error('offer先生返回格式不正确');
  return result.data;
}

async function getOfferJobs(key) {
  if (!Number.isInteger(maxRecentPages) || maxRecentPages < 1 || maxRecentPages > 3) throw new Error('MAX_RECENT_PAGES must be 1–3');
  if (!Number.isInteger(recentPageSize) || recentPageSize < 1 || recentPageSize > 100) throw new Error('RECENT_PAGE_SIZE must be 1–100');
  const items = [];
  let cursor;
  const cursors = new Set();
  for (let page = 0; page < maxRecentPages; page++) {
    const data = await getOfferPage(key, cursor);
    items.push(...data.items);
    console.log(`offer先生近24小时：第 ${page + 1} 页，本页 ${data.items.length} 条；hasMore=${Boolean(data.hasMore)}`);
    if (page > 0 && !data.items.length) console.warn('::warning::offer先生上页提示仍有更多记录，但下一页为空；无法确认最近24小时是否完整覆盖');
    if (!data.hasMore) return items.map(normalizeOffer).filter(Boolean);
    if (!data.nextCursor || cursors.has(data.nextCursor)) throw new Error('offer先生游标缺失或重复');
    cursor = data.nextCursor;
    cursors.add(cursor);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  console.warn(`::warning::offer先生近24小时超过 ${maxRecentPages} 页；仅保存已读取的 ${items.length} 条，已停止以保护月度配额`);
  return items.map(normalizeOffer).filter(Boolean);
}

async function getXixiccJobs() {
  const response = await fetch('https://raw.githubusercontent.com/xixicc186/xixicc2027/main/jobs.json', { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`xixicc2027 HTTP ${response.status}`);
  const items = await response.json();
  if (!Array.isArray(items)) throw new Error('xixicc2027 返回格式不正确');
  if (!items.length) throw new Error('xixicc2027 返回空数据；保留旧数据');
  return items.map(normalizeXixicc).filter(Boolean);
}

async function main() {
  if (!permissionOffer && !permissionXixicc) { console.log('数据发布许可尚未配置；保留当前数据。'); return; }
  const previous = validateDataset(JSON.parse(await readFile(DATA_PATH, 'utf8')));
  const today = todayInChina();
  const incoming = [];
  if (permissionOffer) {
    const key = process.env.OFFER_CAMPUS_API_KEY;
    if (!key) console.warn('::warning::缺少 OFFER_CAMPUS_API_KEY secret；本次仅同步 xixicc2027');
    else {
      try { incoming.push(...await getOfferJobs(key)); }
      catch (error) { console.warn(`::warning::${error.message}；保留已有 offer 先生记录`); }
    }
  }
  if (permissionXixicc) incoming.push(...await getXixiccJobs());
  if (!incoming.length && previous.mode !== 'live') throw new Error('本次无可发布记录；保留旧数据');
  const oldJobs = previous.mode === 'live' ? previous.jobs.filter((job) =>
    (!permissionXixicc || !job.id.startsWith('xixicc-'))
  ) : [];
  const jobs = dedupeJobs([...oldJobs, ...incoming]
    .filter((job) => currentCampusJob(job, today))
    .map((job) => ({ ...job, ...normalizeLocations(job.cities) })));
  if (!jobs.length) throw new Error('筛选后无可发布的校招记录；保留旧数据');
  const dataset = validateDataset({ schemaVersion: 1, generatedAt: new Date().toISOString(), mode: 'live', jobs });
  await writeFile(DATA_PATH, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  console.log(`已生成 ${jobs.length} 条记录：offer先生 ${jobs.filter((job) => job.id.startsWith('offer-')).length} 条，xixicc2027 ${jobs.filter((job) => job.id.startsWith('xixicc-')).length} 条`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
