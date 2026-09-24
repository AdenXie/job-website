import { createHash } from 'node:crypto';
import { normalizeLocations } from './locations.mjs';

export function webUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function clean(value) {
  return typeof value === 'string' ? value.trim() || null : null;
}

function list(value) {
  if (Array.isArray(value)) return [...new Set(value.map(clean).filter(Boolean))];
  return typeof value === 'string' ? [...new Set(value.split(',').map(clean).filter(Boolean))] : [];
}

function isoDate(value) {
  const text = clean(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? text : null;
}

function chinaTimestamp(value) {
  const text = clean(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return `${text.replace(' ', 'T')}+08:00`;
  return Number.isNaN(Date.parse(text)) ? null : new Date(text).toISOString();
}

function hash(value) { return createHash('sha256').update(value).digest('hex').slice(0, 20); }

export function normalizeOffer(item) {
  if (!item || typeof item !== 'object' || !item.id) return null;
  const company = clean(item.enterpriseName);
  const title = list(item.recruitPosInfoNameList).join('、') || clean(item.recruitInfoName);
  if (!company || !title) return null;
  return {
    id: `offer-${String(item.id)}`,
    company,
    title,
    program: clean(item.recruitInfoName),
    industry: clean(item.recruitBusinessName),
    ...normalizeLocations(list(item.cityNameList)),
    cohort: item.date ? `${item.date}届` : clean(item.domesticGraduationDate),
    batch: clean(item.tag),
    deadline: isoDate(item.endTime),
    updatedAt: chinaTimestamp(item.updateTime),
    source: clean(item.releaseSource) || 'offer先生',
    sourceUrl: null,
    applyUrl: webUrl(item.url),
    announcementUrl: webUrl(item.announcementUrl),
    verification: 'unverified',
  };
}

// The site's owner opted in to this source for a personal, non-commercial index.
// This function preserves a link to the source dataset; it does not imply a license grant.
export function normalizeXixicc(item) {
  if (!item || typeof item !== 'object') return null;
  const company = clean(item.company);
  const title = list(item.positions).join('、') || clean(item.program) || '校招项目';
  if (!company) return null;
  const applyUrl = webUrl(item.apply_url);
  const sourceUrl = 'https://github.com/xixicc186/xixicc2027/blob/main/jobs.json';
  const stable = [company, title, item.cohort, item.batch, list(item.locations).join(',')].join('|');
  return {
    id: `xixicc-${hash(stable)}`,
    company,
    title,
    program: clean(item.program),
    industry: clean(item.industry),
    ...normalizeLocations(list(item.locations)),
    cohort: clean(item.cohort),
    batch: clean(item.batch),
    deadline: isoDate(item.deadline),
    updatedAt: chinaTimestamp(item.last_seen),
    source: 'xixicc2027',
    sourceUrl,
    applyUrl,
    announcementUrl: null,
    verification: 'unverified',
  };
}

export function currentCampusJob(job, today) {
  if (!job || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  if (job.deadline && job.deadline < today) return false;
  const year = Number.parseInt(job.cohort, 10);
  if (Number.isInteger(year) && year < Number(today.slice(0, 4))) return false;
  const details = [job.title, job.program, job.batch].filter(Boolean).join(' ');
  if (/实习|开放日|宣讲会|校园大使|训练营|暑期实践/.test(details)) return false;
  if (job.id.startsWith('offer-')) return /秋招|提前批|正式批/.test(details);
  if (job.id.startsWith('xixicc-')) return /^(正式批|提前批)$/.test(job.batch || '') || /秋招|校园招聘|校招/.test(details);
  return false;
}

function dedupeKey(job) {
  return [job.company, job.title, job.cohort, job.batch, [...(job.cities || [])].sort().join(',')]
    .map((value) => (value || '').toLowerCase().replace(/\s+/g, '')).join('|');
}

function richness(job) {
  return Number(Boolean(job.applyUrl)) * 4 + Number(Boolean(job.announcementUrl)) * 2 + Number(Boolean(job.deadline)) + Number(Boolean(job.updatedAt));
}

export function dedupeJobs(jobs) {
  const byKey = new Map();
  for (const job of jobs) {
    if (!job) continue;
    const key = dedupeKey(job);
    const current = byKey.get(key);
    if (!current || richness(job) > richness(current) || (richness(job) === richness(current) && (job.updatedAt || '') > (current.updatedAt || ''))) byKey.set(key, job);
  }
  return [...byKey.values()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function validateDataset(data) {
  if (data?.schemaVersion !== 1 || !Array.isArray(data.jobs) || !['demo', 'live'].includes(data.mode)) throw new Error('Invalid dataset envelope');
  const ids = new Set();
  for (const job of data.jobs) {
    if (!job.id || !job.company || !job.title || !Array.isArray(job.cities) || !job.source || !['demo', 'unverified'].includes(job.verification)) throw new Error(`Invalid job: ${job.id || '<missing id>'}`);
    if (job.provinces && (!Array.isArray(job.provinces) || job.provinces.some((value) => typeof value !== 'string'))) throw new Error(`Invalid provinces in ${job.id}`);
    if (ids.has(job.id)) throw new Error(`Duplicate id: ${job.id}`);
    ids.add(job.id);
    for (const field of ['sourceUrl', 'applyUrl', 'announcementUrl']) if (job[field] && !webUrl(job[field])) throw new Error(`Unsafe URL in ${job.id}`);
    if (job.deadline && !isoDate(job.deadline)) throw new Error(`Invalid deadline in ${job.id}`);
  }
  return data;
}
