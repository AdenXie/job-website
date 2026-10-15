// 本地投递看板的核心逻辑：数据校验、合并、状态流转、统计与日历导出。
// 纯函数，不依赖浏览器或 Node，看板页面和本地服务共用，也直接被测试引用。

export const BOARD_VERSION = 1;

// 状态顺序即看板列顺序；rejected / withdrawn 同在“已结束”一列
export const STATUSES = [
  { id: 'wish', label: '想投', column: 'wish' },
  { id: 'applied', label: '已投递', column: 'applied' },
  { id: 'assessment', label: '测评/笔试', column: 'assessment' },
  { id: 'interview', label: '面试中', column: 'interview' },
  { id: 'offer', label: 'Offer', column: 'offer' },
  { id: 'rejected', label: '未通过', column: 'closed' },
  { id: 'withdrawn', label: '已放弃', column: 'closed' },
];
export const COLUMNS = [
  { id: 'wish', label: '想投' },
  { id: 'applied', label: '已投递' },
  { id: 'assessment', label: '测评/笔试' },
  { id: 'interview', label: '面试中' },
  { id: 'offer', label: 'Offer' },
  { id: 'closed', label: '已结束' },
];
const STATUS_IDS = STATUSES.map((status) => status.id);
// 漏斗只看推进阶段，结束状态不算推进
const STAGES = ['wish', 'applied', 'assessment', 'interview', 'offer'];

const LIMITS = { company: 100, title: 300, program: 200, city: 30, cities: 30, cohort: 60, url: 2000, notes: 5000, tag: 20, tags: 10, next: 200, timeline: 60, cards: 5000 };

const text = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '');
const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const isDateTime = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}:00Z`));

/** 只允许 http/https 链接，其余（javascript:、data: 等）一律丢弃。与主站 safeUrl 同一思路。 */
export function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > LIMITS.url) return null;
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** 岗位快照：来自网站同步或用户手动填写，一律当作不可信数据清洗。缺少公司或岗位名称时返回 null。 */
export function sanitizeJob(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const job = {
    id: text(raw.id, 120),
    company: text(raw.company, LIMITS.company),
    title: text(raw.title, LIMITS.title),
    program: text(raw.program, LIMITS.program),
    cities: Array.isArray(raw.cities) ? [...new Set(raw.cities.map((city) => text(city, LIMITS.city)).filter(Boolean))].slice(0, LIMITS.cities) : [],
    cohort: text(raw.cohort, LIMITS.cohort),
    deadline: isDate(raw.deadline) ? raw.deadline : '',
    applyUrl: safeUrl(raw.applyUrl) || '',
    announcementUrl: safeUrl(raw.announcementUrl) || '',
  };
  // 网站岗位 id 可能带 base64 的 =、+、/（如 offer-ext_OTMyMTc=）；只在 JSON 和 textContent 里使用，不拼进 HTML
  if (!/^[\w.:=+/-]{1,120}$/.test(job.id) || !job.company || !job.title) return null;
  return job;
}

function sanitizeCard(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const job = sanitizeJob(raw.job);
  if (!job) return null;
  const status = STATUS_IDS.includes(raw.status) ? raw.status : 'wish';
  const timeline = (Array.isArray(raw.timeline) ? raw.timeline : [])
    .filter((entry) => entry && STATUS_IDS.includes(entry.status) && isDate(entry.date))
    .map((entry) => ({ status: entry.status, date: entry.date }))
    .slice(-LIMITS.timeline);
  const next = raw.next && typeof raw.next === 'object' ? { text: text(raw.next.text, LIMITS.next), at: isDateTime(raw.next.at) ? raw.next.at : '' } : { text: '', at: '' };
  return {
    id: job.id,
    source: raw.source === 'manual' ? 'manual' : 'site',
    job,
    status,
    timeline,
    next,
    notes: text(raw.notes, LIMITS.notes),
    tags: Array.isArray(raw.tags) ? [...new Set(raw.tags.map((tag) => text(tag, LIMITS.tag)).filter(Boolean))].slice(0, LIMITS.tags) : [],
    removed: raw.removed === true,
    createdAt: text(raw.createdAt, 40),
    updatedAt: text(raw.updatedAt, 40),
  };
}

export function emptyBoard() {
  return { version: BOARD_VERSION, cards: [], updatedAt: '' };
}

/** 整个看板（读文件、导入 JSON、页面提交）都经过这里，丢弃无法识别的内容，同一 id 只保留第一张。 */
export function sanitizeBoard(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.cards)) return null;
  const seen = new Set();
  const cards = [];
  for (const item of raw.cards.slice(0, LIMITS.cards)) {
    const card = sanitizeCard(item);
    if (card && !seen.has(card.id)) { seen.add(card.id); cards.push(card); }
  }
  return { version: BOARD_VERSION, cards, updatedAt: text(raw.updatedAt, 40) };
}

const SNAPSHOT_FIELDS = ['company', 'title', 'program', 'cities', 'cohort', 'deadline', 'applyUrl', 'announcementUrl'];

/** 预览导入：返回将新增、已存在的条数。 */
export function previewImport(board, jobs) {
  const ids = new Set(board.cards.map((card) => card.id));
  const added = jobs.filter((job) => !ids.has(job.id)).length;
  return { added, existing: jobs.length - added };
}

/** 按 id 合并网站同步来的岗位：新岗位进“想投”；已存在的只更新快照字段，不改状态、时间线、备注和标签。 */
export function mergeImport(board, jobs, today) {
  const byId = new Map(board.cards.map((card) => [card.id, card]));
  let added = 0;
  let updated = 0;
  for (const raw of jobs) {
    const job = sanitizeJob(raw);
    if (!job) continue;
    const current = byId.get(job.id);
    if (current) {
      byId.set(job.id, { ...current, job: { ...current.job, ...Object.fromEntries(SNAPSHOT_FIELDS.map((field) => [field, job[field]])) }, removed: false, updatedAt: today });
      updated += 1;
    } else {
      byId.set(job.id, { id: job.id, source: 'site', job, status: 'wish', timeline: [{ status: 'wish', date: today }], next: { text: '', at: '' }, notes: '', tags: [], removed: false, createdAt: today, updatedAt: today });
      added += 1;
    }
  }
  return { board: { ...board, cards: [...byId.values()], updatedAt: today }, added, updated };
}

/** 换列：状态变化时在时间线上自动记一笔当天日期，日期之后可以手动修改。 */
export function setStatus(card, status, today) {
  if (!STATUS_IDS.includes(status) || card.status === status) return card;
  return { ...card, status, timeline: [...card.timeline, { status, date: today }].slice(-LIMITS.timeline), updatedAt: today };
}

/** 手动新增不在秋招信库里的岗位。 */
export function createManualCard(fields, today, randomId) {
  const job = sanitizeJob({ ...fields, id: `local-${randomId}` });
  if (!job) return null;
  return { id: job.id, source: 'manual', job, status: 'wish', timeline: [{ status: 'wish', date: today }], next: { text: '', at: '' }, notes: '', tags: [], removed: false, createdAt: today, updatedAt: today };
}

/** 刷新岗位信息：用网站最新数据更新快照；网站上已经没有的岗位标记“原岗位已下架”，不删除卡片。 */
export function refreshSnapshots(board, siteJobs, today) {
  const latest = new Map();
  for (const raw of siteJobs) {
    const job = sanitizeJob(raw);
    if (job) latest.set(job.id, job);
  }
  let updated = 0;
  let removed = 0;
  const cards = board.cards.map((card) => {
    if (card.source !== 'site') return card;
    const job = latest.get(card.id);
    if (!job) { removed += card.removed ? 0 : 1; return { ...card, removed: true }; }
    updated += 1;
    return { ...card, job: { ...card.job, ...Object.fromEntries(SNAPSHOT_FIELDS.map((field) => [field, job[field]])) }, removed: false };
  });
  return { board: { ...board, cards, updatedAt: today }, updated, removed };
}

const dayMs = 86400000;
const toDay = (date) => Date.parse(`${date}T00:00:00Z`);

/** 需要高亮的卡片：截止日期在今天起 3 天内，或下一步事项在 24 小时内。已结束的不提醒。now 为本地时间“YYYY-MM-DDTHH:mm”。 */
export function urgency(card, now) {
  if (STATUSES.find((status) => status.id === card.status)?.column === 'closed') return null;
  const today = now.slice(0, 10);
  if (card.job.deadline) {
    const days = (toDay(card.job.deadline) - toDay(today)) / dayMs;
    if (days >= 0 && days <= 3) return { type: 'deadline', days };
  }
  if (card.next.at) {
    const hours = (Date.parse(`${card.next.at}:00Z`) - Date.parse(`${now}:00Z`)) / 3600000;
    if (hours >= 0 && hours <= 24) return { type: 'next', hours };
  }
  return null;
}

/** 投递漏斗：按每张卡片到达过的最远阶段统计（跳过的阶段也计入），转化率 = 本阶段 / 上一阶段。 */
export function funnel(cards) {
  const reach = STAGES.map(() => 0);
  for (const card of cards) {
    const orders = [card.status, ...card.timeline.map((entry) => entry.status)].map((status) => STAGES.indexOf(status));
    const furthest = Math.max(0, ...orders);
    for (let index = 0; index <= furthest; index += 1) reach[index] += 1;
  }
  return STAGES.map((id, index) => ({
    id,
    label: STATUSES.find((status) => status.id === id).label,
    count: reach[index],
    rate: index === 0 ? null : reach[index - 1] ? reach[index] / reach[index - 1] : null,
  }));
}

/** 每周投递数：按时间线里“已投递”的日期计数，周一为一周开始，返回最近 weeks 周（含本周）。 */
export function weeklyApplied(cards, today, weeks = 8) {
  const weekday = (new Date(toDay(today)).getUTCDay() + 6) % 7;
  const thisMonday = toDay(today) - weekday * dayMs;
  const buckets = Array.from({ length: weeks }, (_, index) => ({ start: new Date(thisMonday - (weeks - 1 - index) * 7 * dayMs).toISOString().slice(0, 10), count: 0 }));
  for (const card of cards) {
    const entry = card.timeline.find((item) => item.status === 'applied');
    if (!entry) continue;
    const index = Math.floor((toDay(entry.date) - toDay(buckets[0].start)) / (7 * dayMs));
    if (index >= 0 && index < weeks) buckets[index].count += 1;
  }
  return buckets;
}

/** 日程：所有截止日期和下一步事项，按时间排序。已结束的卡片不列入。 */
export function scheduleItems(cards) {
  const items = [];
  for (const card of cards) {
    if (STATUSES.find((status) => status.id === card.status)?.column === 'closed') continue;
    if (card.job.deadline) items.push({ id: `${card.id}-deadline`, cardId: card.id, kind: 'deadline', date: card.job.deadline, time: '', title: `截止：${card.job.company} · ${card.job.title}` });
    if (card.next.at) items.push({ id: `${card.id}-next`, cardId: card.id, kind: 'next', date: card.next.at.slice(0, 10), time: card.next.at.slice(11), title: `${card.next.text || '下一步'}：${card.job.company}` });
  }
  return items.sort((a, b) => `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`));
}

// RFC 5545：转义 \ ; , 和换行；每行不超过 75 个字节，按 UTF-8 字符边界折行
function escapeIcs(value) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function foldLine(line) {
  const encoder = new TextEncoder();
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > (parts.length ? 74 : 75)) { parts.push(current); current = ''; bytes = 0; }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compact = (date) => date.replace(/-/g, '');

/** 生成 .ics 日历：截止日期为全天事件，下一步事项为 1 小时的本地时间事件（不带时区，按设备本地时间显示）。 */
export function buildIcs(cards, stamp) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//qiuzhaoxinku//local-board//CN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:秋招投递日程'];
  const dtstamp = stamp.replace(/[-:]/g, '').replace(/\.\d+/, '');
  for (const item of scheduleItems(cards)) {
    lines.push('BEGIN:VEVENT', `UID:${item.id}@local-board`, `DTSTAMP:${dtstamp}`);
    if (item.kind === 'deadline') {
      lines.push(`DTSTART;VALUE=DATE:${compact(item.date)}`, `DTEND;VALUE=DATE:${compact(new Date(toDay(item.date) + dayMs).toISOString().slice(0, 10))}`);
    } else {
      const start = `${compact(item.date)}T${item.time.replace(':', '')}00`;
      const end = new Date(Date.parse(`${item.date}T${item.time}:00Z`) + 3600000).toISOString();
      lines.push(`DTSTART:${start}`, `DTEND:${compact(end.slice(0, 10))}T${end.slice(11, 16).replace(':', '')}00`);
    }
    lines.push(`SUMMARY:${escapeIcs(item.title)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
