// 求职画像：从简历里提取推荐需要的少数字段（方向、城市、届别、行业）。纯函数，不读写浏览器存储。
import { fieldValues } from '../job-fields.mjs';
import { familiesOf, JOB_FAMILIES, OTHER_FAMILY } from '../job-families.mjs';
import { normalizeResume } from '../resume/sample.js';

export const RESUME_KEY = 'campus-opportunities:resume:v1';
export const PROFILE_KEY = 'campus-opportunities:profile:v1';
export const PROFILE_FIELDS = ['families', 'cities', 'cohort', 'industries'];
export const MAX_FAMILIES = 3;
export const BROAD_LOCATIONS = ['全国', '海外'];

// 求职意向最能代表目标方向；经历和专业次之；技能只作补充
const SOURCE_WEIGHTS = { title: 4, role: 1.5, major: 1, skills: 0.5 };

// 早期版本的简历生成器没有 sample 标记，按示例的联系方式识别
function isSampleResume(resume) {
  return resume.sample === true || (resume.basics.name === '李明' && resume.basics.email === 'liming@example.com' && resume.basics.phone === '138-0000-0000');
}

function hasContent(resume) {
  if (Object.entries(resume.basics).some(([key, value]) => key !== 'photo' && value.trim())) return true;
  return resume.sections.some((section) => (section.kind === 'text'
    ? section.body.trim()
    : section.items.some((item) => [item.name, item.role, item.date, item.desc].some((value) => value.trim()))));
}

/** 读简历生成器保存的原始数据。没有、读不出、是示例或是空白时返回 null，绝不回落到示例简历。 */
export function readStoredResume(storage) {
  let raw = null;
  try { raw = storage?.getItem(RESUME_KEY); } catch { return null; }
  if (!raw) return null;
  let resume = null;
  try { resume = normalizeResume(JSON.parse(raw)); } catch { return null; }
  return resume && !isSampleResume(resume) && hasContent(resume) ? resume : null;
}

const isEducation = (section) => /教育|学历|education/i.test(section.title);

// “2024.09 – 2027.06”取结束时间；9 月及以后毕业算下一届（例如 2026.12 毕业属于 2027 届）
function graduationCohort(dates) {
  let latest = null;
  for (const text of dates) {
    const matches = [...String(text).matchAll(/((?:19|20)\d{2})\s*(?:[./\-年]\s*(\d{1,2})(?!\d))?/g)];
    if (!matches.length || /至今|现在|present|now/i.test(text) && matches.length < 2) continue;
    const last = matches[matches.length - 1];
    const year = Number(last[1]);
    const month = last[2] ? Number(last[2]) : 6;
    const cohort = month >= 9 ? year + 1 : year;
    if (!latest || cohort > latest) latest = cohort;
  }
  return latest ? `${latest}届` : '';
}

function scoreFamilies(texts) {
  const scores = new Map();
  for (const { text, weight } of texts) {
    // 同一段文字里重复出现的岗位族只计一次
    const hits = new Set(fieldValues(String(text).replace(/[：:]/g, '、')).flatMap(familiesOf));
    for (const family of hits) if (family !== OTHER_FAMILY) scores.set(family, (scores.get(family) || 0) + weight);
  }
  // 与岗位归类一致：已识别出更具体的方向时，去掉笼统的岗位族（如“软件开发（综合）”）
  for (const family of JOB_FAMILIES) if (family.yieldTo?.some((name) => scores.has(name))) scores.delete(family.name);
  return [...scores].sort((a, b) => b[1] - a[1]).slice(0, MAX_FAMILIES).map(([name]) => name);
}

function findCities(texts, cityNames) {
  const names = [...new Set(cityNames)].filter((name) => name.length >= 2 && !BROAD_LOCATIONS.includes(name)).sort((a, b) => b.length - a.length);
  const found = [];
  for (const text of texts) {
    let rest = String(text || '');
    for (const name of names) {
      if (rest.includes(name)) { found.push(name); rest = rest.split(name).join(' '); }
    }
  }
  return [...new Set(found)];
}

/** 简历（简历生成器或 PDF 识别的结构）→ 识别出的画像字段。行业从公司名推断不可靠，默认留空。 */
export function detectProfile(resume, cityNames = []) {
  const { basics, sections } = resume;
  const texts = [{ text: basics.title, weight: SOURCE_WEIGHTS.title }];
  for (const section of sections) {
    if (section.kind === 'text') {
      if (/技能|skill|技术/i.test(section.title)) texts.push(...section.body.split('\n').map((line) => ({ text: line, weight: SOURCE_WEIGHTS.skills })));
      continue;
    }
    for (const item of section.items) texts.push({ text: item.role, weight: isEducation(section) ? SOURCE_WEIGHTS.major : SOURCE_WEIGHTS.role });
  }
  return {
    families: scoreFamilies(texts.filter((item) => item.text)),
    cities: findCities([basics.city, basics.title], cityNames),
    cohort: graduationCohort(sections.filter(isEducation).flatMap((section) => section.items.map((item) => item.date))),
    industries: [],
  };
}

export function emptyProfile() {
  return { version: 1, source: 'manual', families: [], cities: [], cohort: '', industries: [], edited: {}, updatedAt: null };
}

/** 合并新识别结果：用户改过的字段保留用户的值；reset 为 true（“从简历重新识别”）时全部采用识别结果。 */
export function mergeDetected(profile, detected, { source, reset = false, now = new Date().toISOString() } = {}) {
  const base = profile || emptyProfile();
  const edited = reset ? {} : { ...base.edited };
  const next = { ...base, version: 1, source: source || base.source, edited, updatedAt: now };
  for (const field of PROFILE_FIELDS) if (!edited[field]) next[field] = detected[field];
  return next;
}

/** 用户手动修改某一项：记下 edited，之后的自动识别不再覆盖。 */
export function editProfile(profile, field, value, now = new Date().toISOString()) {
  const base = profile || emptyProfile();
  return { ...base, [field]: value, edited: { ...base.edited, [field]: true }, updatedAt: now };
}

export const hasProfile = (profile) => Boolean(profile && (profile.families.length || profile.cities.length || profile.cohort || profile.industries.length));

/** 校验存储里读出的画像，只保留已知字段，避免把别的内容带进来。 */
export function parseProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const list = (value) => (Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim().slice(0, 30)))] : []);
  const edited = raw.edited && typeof raw.edited === 'object' ? Object.fromEntries(PROFILE_FIELDS.filter((field) => raw.edited[field] === true).map((field) => [field, true])) : {};
  return {
    version: 1,
    source: ['resume', 'pdf', 'manual'].includes(raw.source) ? raw.source : 'manual',
    families: list(raw.families).slice(0, MAX_FAMILIES),
    cities: list(raw.cities).slice(0, 10),
    cohort: typeof raw.cohort === 'string' && /^((19|20)\d{2}届)?$/.test(raw.cohort) ? raw.cohort : '',
    industries: list(raw.industries).slice(0, 5),
    edited,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  };
}
