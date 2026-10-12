// 把 PDF 里的文字按版面位置还原成行，再用规则拆成简历各模块。
// 纯函数、不依赖浏览器，方便在 Node 里测试。

const clean = (text) => text.replace(/\s+/g, ' ').trim();

/** pdf.js 的文字片段 → 带位置和字号的行。间距很大的片段之间用制表符隔开（通常是右对齐的时间）。 */
export function buildLines(items, page = 1) {
  const glyphs = items
    .filter((item) => typeof item.str === 'string' && item.str.trim())
    .map((item) => ({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, size: Math.abs(item.transform[3]) || item.height || 10 }));
  glyphs.sort((a, b) => b.y - a.y || a.x - b.x);

  const rows = [];
  for (const glyph of glyphs) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row.y - glyph.y) <= Math.max(2, Math.min(row.size, glyph.size) * 0.45)) row.glyphs.push(glyph);
    else rows.push({ y: glyph.y, size: glyph.size, glyphs: [glyph] });
  }

  return rows.map((row) => {
    row.glyphs.sort((a, b) => a.x - b.x);
    let text = '';
    let previous = null;
    for (const glyph of row.glyphs) {
      if (previous) {
        const gap = glyph.x - (previous.x + previous.width);
        const size = Math.max(previous.size, glyph.size);
        if (gap > size * 1.2) text += '\t';
        else if (gap > size * 0.25 && !/\s$/.test(text) && !/^\s/.test(glyph.text)) text += ' ';
      }
      text += glyph.text;
      previous = glyph;
    }
    const main = row.glyphs.reduce((best, glyph) => (glyph.text.length > best.text.length ? glyph : best));
    return { text: text.split('\t').map(clean).filter(Boolean).join('\t'), x: row.glyphs[0].x, right: previous.x + previous.width, size: main.size, page };
  }).filter((line) => line.text);
}

const HEADINGS = [
  { kind: 'basics', re: /^(个人信息|基本信息|基本资料|个人资料|联系方式|个人简历|简历|resume|cv|curriculumvitae|contact)$/i },
  { kind: 'entries', re: /^(教育(背景|经历|信息)?|学历(背景)?|education)$/i },
  { kind: 'entries', re: /^((实习|工作|实践|职业|从业)(经历|经验|背景)|实习|(work|professional)?experiences?|internships?)$/i },
  { kind: 'entries', re: /^(项目(经历|经验|实践)?|科研(经历|项目)|projects?)$/i },
  { kind: 'entries', re: /^(校园(经历|活动|实践)|在校经历|社团(经历|活动)|学生工作|社会实践|培训经历|竞赛经历|开源(项目|贡献))$/ },
  { kind: 'text', re: /^((专业|个人|职业|相关|掌握)?技能(特长|清单|证书|与证书)?|技术栈|(technical)?skills?)$/i },
  { kind: 'text', re: /^(.{0,4}(获奖|荣誉|奖项|证书).{0,4}|awards?|honou?rs?(and|&)?awards?)$/i },
  { kind: 'text', re: /^(自我评价|个人评价|个人总结|个人简介|个人优势|自我介绍|论文(发表)?|科研成果|语言能力|兴趣爱好|其他(信息)?|summary|about(me)?|publications?|languages?|interests?)$/i },
];
const MARKER = /^\s*(?:[•·●○◦▪■□◆◇▸►➢➤✓√*]|[-–—](?=\s)|\d{1,2}[.、)）](?!\d))\s*/;
const DATE = '(?:19|20)\\d{2}\\s*(?:[./\\-年]\\s*\\d{1,2}\\s*月?)?';
const DATE_RANGE = new RegExp(`${DATE}\\s*(?:[-–—~～至到]|\\bto\\b)+\\s*(?:${DATE}|至今|现在|今|present|now)`, 'i');
const DATE_AT_END = new RegExp(`\\t((?:19|20)\\d{2}\\s*[./\\-年]\\s*\\d{1,2}\\s*月?)$`);
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE = /(?:\+?86[- ]?)?1[3-9]\d[- ]?\d{4}[- ]?\d{4}/;
const LINK = /https?:\/\/[^\s|｜]+|(?:www\.)?[\w-]+(?:\.[\w-]+)*\.(?:com|cn|io|me|dev|net|org|top|xyz|site|tech)(?:\/[^\s|｜]*)?/i;
const LABEL = /^(姓名|电话|手机(号码?)?|联系(电话|方式)|tel|phone|mobile|邮箱|电子邮[箱件]|e-?mail|微信|地址|现居(住地)?|所在地|居住地|城市|籍贯|个人(主页|网站)|主页|博客|github|网站)\s*[:：]\s*/i;
const TITLE = /(求职意向|应聘(岗位|职位)?|意向(岗位|职位)|目标(岗位|职位)|期望(岗位|职位|职业))/;
const CITIES = '北京|上海|广州|深圳|杭州|南京|成都|武汉|西安|苏州|天津|重庆|长沙|青岛|厦门|合肥|郑州|济南|大连|宁波|无锡|福州|东莞|佛山|珠海|沈阳|哈尔滨|长春|昆明|南昌|贵阳|南宁|太原|石家庄|兰州|乌鲁木齐|海口|香港|澳门|台北';
const CITY = new RegExp(`^(?:[\\u4e00-\\u9fa5]{2,3}省)?(${CITIES})市?$`);

const headingKey = (text) => text.replace(/[^一-龥a-z&]/gi, '');
const splitParts = (text) => text.split(/\t|\s*[|｜]\s*|\s{2,}/).map(clean).filter(Boolean);

function matchHeading(line) {
  const key = headingKey(line.text);
  if (!key || key.length > 18 || line.text.length > 24 || MARKER.test(line.text) || /[:：\t].|\d/.test(line.text)) return null;
  const heading = HEADINGS.find((item) => item.re.test(key));
  return heading ? { kind: heading.kind, title: /[一-龥]/.test(key) ? key : clean(line.text) } : null;
}

function findDate(text) {
  const match = text.match(DATE_RANGE) || text.match(DATE_AT_END);
  if (!match) return null;
  const date = clean(match[1] || match[0]);
  const rest = (text.slice(0, match.index) + '\t' + text.slice(match.index + match[0].length)).replace(/[（(]\s*[)）]/g, '');
  return { date, rest };
}

// “公司 职位”这类标题行拆成名称和角色。
function splitHead(text) {
  let parts = splitParts(text);
  if (parts.length === 1) {
    // 只在第一个分隔处切开，角色里自带的“·”保持原样
    const gap = parts[0].match(/\s+[·•\-–—]\s+|\s+/);
    if (gap && (gap[0].trim() || /[一-龥]/.test(parts[0]))) parts = [parts[0].slice(0, gap.index), parts[0].slice(gap.index + gap[0].length)];
  }
  return { name: parts[0] || '', role: parts.slice(1).join(' · ') };
}

const join = (previous, next) => previous + (/[a-z0-9,.;:]$/i.test(previous) && /^[a-z0-9]/i.test(next) ? ' ' : '') + next;

function parseEntries(lines, maxRight) {
  const left = Math.min(...lines.map((line) => line.x));
  const entries = [];
  let current = null;
  let last = '';
  let previousFull = false;
  const start = (head, date, x) => { current = { ...head, date, desc: [], headX: x, descIndented: false }; entries.push(current); last = 'head'; };

  for (const line of lines) {
    const marked = MARKER.test(line.text);
    const dated = marked ? null : findDate(line.text);
    const text = clean(line.text.replace(MARKER, '').replace(/\t/g, '  '));
    const flush = line.x <= left + 3;
    if (dated) {
      const head = splitHead(dated.rest);
      // 时间单独在第二行的版式：补到上一条没有时间的标题上
      if (current && last === 'head' && !current.date && !current.desc.length) {
        current.date = dated.date;
        current.role = [current.role, head.name, head.role].filter(Boolean).join(' · ');
      } else start(head, dated.date, line.x);
    } else if (!marked && last === 'desc' && previousFull) {
      current.desc[current.desc.length - 1] = join(current.desc[current.desc.length - 1], text);
    } else if (!marked && current && last === 'head' && !current.role && Math.abs(line.x - current.headX) <= 3 && text.length <= 40) {
      current.role = text.replace(/\s{2,}/g, ' · ');
    } else if (!marked && flush && text.length <= 40 && !/[。；;，,：:]$/.test(text) && (!current || (current.desc.length && current.descIndented))) {
      start(splitHead(line.text), '', line.x);
    } else {
      if (!current) start({ name: '', role: '' }, '', line.x);
      current.desc.push(text);
      current.descIndented = current.descIndented || line.x > left + 3;
      last = 'desc';
    }
    previousFull = line.right >= maxRight - line.size * 1.5;
  }
  return entries.map(({ name, role, date, desc }) => ({ name, role, date, desc: desc.join('\n') }));
}

function parseText(lines, maxRight) {
  const body = [];
  let previousFull = false;
  for (const line of lines) {
    const marked = MARKER.test(line.text);
    const text = clean(line.text.replace(MARKER, '').replace(/\t/g, '  '));
    if (!marked && body.length && previousFull) body[body.length - 1] = join(body[body.length - 1], text);
    else body.push(text);
    previousFull = line.right >= maxRight - line.size * 1.5;
  }
  return body.join('\n');
}

function parseBasics(lines, bodySize) {
  const basics = { name: '', title: '', phone: '', email: '', city: '', link: '', photo: '' };
  const leftovers = [];
  const biggest = lines.reduce((best, line) => (!best || line.size > best.size ? line : best), null);
  const take = (text, key, pattern) => {
    const match = text.match(pattern);
    if (!match) return text;
    if (!basics[key]) basics[key] = match[0].replace(/[，,。;；]$/, '');
    return text.replace(match[0], '\t');
  };

  for (const line of lines) {
    let text = take(take(line.text, 'email', EMAIL), 'phone', PHONE);
    text = take(text, 'link', LINK);
    const rest = [];
    for (const raw of splitParts(text)) {
      const label = (raw.match(LABEL) || [''])[0];
      const value = clean(raw.slice(label.length));
      if (!value || /^(电话|手机|邮箱|微信|地址|主页|github|e-?mail|tel|phone)[:：]?$/i.test(value)) continue;
      if (TITLE.test(raw)) basics.title = basics.title || raw;
      else if (/^姓名/.test(label)) basics.name = value;
      else if (/^(地址|现居|所在地|居住地|城市)/.test(label) || CITY.test(value)) basics.city = basics.city || value;
      else if (!basics.name && line === biggest && line.size > bodySize * 1.15 && value.length <= 20) basics.name = value;
      else rest.push(label && !/^(电话|手机|联系|tel|phone|mobile|邮箱|电子|e-?mail|个人|主页|博客|github|网站)/i.test(label) ? raw : value);
    }
    if (rest.length) leftovers.push(rest);
  }
  // 没有明显大字号的姓名时，取第一个像人名的片段
  if (!basics.name) {
    const row = leftovers.slice(0, 2).find((parts) => /^[一-龥·]{2,5}$/.test(parts[0]) || /^[A-Z][a-z]+(?: [A-Z][a-z]+){1,2}$/.test(parts[0]));
    if (row) basics.name = row.shift();
  }
  basics.name = basics.name.replace(/(?<=[一-龥])\s+(?=[一-龥])/g, '');
  return { basics, leftovers: leftovers.filter((parts) => parts.length).map((parts) => parts.join(' · ')) };
}

/** 行 → { basics, sections, stats }。认不出归属的内容放进“其他内容”。 */
export function parseResume(lines) {
  const weights = new Map();
  for (const line of lines) {
    const size = Math.round(line.size * 2) / 2;
    weights.set(size, (weights.get(size) || 0) + line.text.length);
  }
  const bodySize = [...weights].sort((a, b) => b[1] - a[1])[0]?.[0] || 10;
  const maxRight = Math.max(0, ...lines.map((line) => line.right));

  // 用已认出的标题字号，识别关键词表之外的同级标题
  const known = lines.map(matchHeading);
  const headingSizes = known.map((heading, index) => (heading && heading.kind !== 'basics' ? lines[index].size : 0)).filter((size) => size > bodySize * 1.05);
  const firstHeading = known.findIndex(Boolean);
  const headings = known.map((heading, index) => {
    if (heading || index < firstHeading || firstHeading < 0) return heading;
    const line = lines[index];
    const key = headingKey(line.text);
    const sameSize = headingSizes.some((size) => Math.abs(size - line.size) < 0.3);
    return sameSize && key.length >= 2 && key.length <= 10 && !/\t/.test(line.text) && !MARKER.test(line.text) ? { kind: 'text', title: clean(line.text) } : null;
  });

  const blocks = [{ kind: 'basics', title: '', lines: [] }];
  lines.forEach((line, index) => {
    if (headings[index]) blocks.push({ ...headings[index], lines: [] });
    else blocks[blocks.length - 1].lines.push(line);
  });

  const { basics, leftovers } = parseBasics(blocks.filter((block) => block.kind === 'basics').flatMap((block) => block.lines), bodySize);
  const sections = [];
  for (const block of blocks) {
    if (block.kind === 'basics' || !block.lines.length) continue;
    if (block.kind === 'entries') sections.push({ kind: 'entries', title: block.title, items: parseEntries(block.lines, maxRight) });
    else sections.push({ kind: 'text', title: block.title, body: parseText(block.lines, maxRight) });
  }
  if (leftovers.length) sections.push({ kind: 'text', title: '其他内容', body: leftovers.join('\n') });

  return {
    basics,
    sections,
    stats: {
      chars: lines.reduce((total, line) => total + line.text.length, 0),
      basics: ['name', 'title', 'phone', 'email', 'city', 'link'].filter((key) => basics[key]).length,
      sections: sections.length - (leftovers.length ? 1 : 0),
      leftovers: leftovers.length,
    },
  };
}
