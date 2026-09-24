import { readFile, writeFile } from 'node:fs/promises';
import { currentCampusJob, dedupeJobs, normalizeOffer, validateDataset } from './job-data.mjs';
import { normalizeLocations } from './locations.mjs';

const API = 'https://openapi.offerxiansheng.com/backend-service/open/v1/campus-recruit';
const DATA_PATH = new URL('../public/jobs.json', import.meta.url);
// One-time manual backfill only. Keep the daily recent sync's two-page budget unchanged.
const TARGET_OFFER_COUNT = 1202; // 202 before this request + 1,000 additional records.
const INDUSTRIES = [
  '教育/培训/科研', '医疗/医药/生物', '新能源', '农林牧渔',
  '汽车制造/维修/零配件',
];
const MAX_SEARCH_PAGES = INDUSTRIES.length;

function chinaDate(daysAgo = 0) {
  const date = new Date(Date.now() - daysAgo * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

async function request(key, endpoint, body) {
  const url = new URL(`${API}/${endpoint}`);
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  const existingOfferCount = previous.jobs.filter((job) => job.id.startsWith('offer-')).length;
  if (existingOfferCount >= TARGET_OFFER_COUNT) {
    console.log(`offer先生已有 ${existingOfferCount} 条，目标已达到，本次未调用 API`);
    return;
  }

  const today = chinaDate();
  const incoming = [];
  let calls = 0;
  // The provider currently returns an empty second page after hasMore=true.
  // Independent industry searches cover older records without repeating that empty request.
  for (const industry of INDUSTRIES) {
    const data = await request(key, 'search', { industry, limit: 100 });
    calls++;
    incoming.push(...data.items.map(normalizeOffer).filter(Boolean));
    console.log(`历史校招搜索：${industry} ${data.items.length} 条；hasMore=${Boolean(data.hasMore)}`);
    const offerCount = dedupeJobs([...previous.jobs, ...incoming]
      .filter((job) => currentCampusJob(job, today))
      .map((job) => ({ ...job, ...normalizeLocations(job.cities) })))
      .filter((job) => job.id.startsWith('offer-')).length;
    if (offerCount >= TARGET_OFFER_COUNT) {
      console.log(`达到本轮目标：offer先生 ${offerCount} 条，停止请求`);
      break;
    }
    if (calls < MAX_SEARCH_PAGES) await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (calls === MAX_SEARCH_PAGES) console.log(`历史搜索已达到 ${MAX_SEARCH_PAGES} 次请求上限，以保留日常更新额度`);

  const jobs = dedupeJobs([...previous.jobs, ...incoming]
    .filter((job) => currentCampusJob(job, today))
    .map((job) => ({ ...job, ...normalizeLocations(job.cities) })));
  if (JSON.stringify(jobs) !== JSON.stringify(previous.jobs)) {
    const dataset = validateDataset({ ...previous, generatedAt: new Date().toISOString(), jobs });
    await writeFile(DATA_PATH, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  }
  const previousOfferIds = new Set(previous.jobs.filter((job) => job.id.startsWith('offer-')).map((job) => job.id));
  const addedOffer = jobs.filter((job) => job.id.startsWith('offer-') && !previousOfferIds.has(job.id)).length;
  console.log(`本次 ${calls}/${MAX_SEARCH_PAGES} 次 API 请求，收到并标准化 ${incoming.length} 条，新增可展示 offer先生 ${addedOffer} 条；去重后网站 ${jobs.length} 条，offer先生 ${jobs.filter((job) => job.id.startsWith('offer-')).length} 条`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
