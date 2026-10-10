export const uid = () => Math.random().toString(36).slice(2, 10);

export const defaultStyle = { template: 'classic', accent: '#195766', font: 'sans', scale: 1, lineHeight: 1.5, margin: 15, autoFit: true };

const entry = (name, role, date, desc) => ({ id: uid(), name, role, date, desc });

// 示例内容均为虚构，仅用于展示排版效果。
export function sampleResume() {
  return {
    basics: { name: '李明', title: '求职意向：后端开发工程师', phone: '138-0000-0000', email: 'liming@example.com', city: '上海', link: 'github.com/liming-example', photo: '' },
    sections: [
      { id: uid(), kind: 'entries', title: '教育背景', items: [
        entry('华东某大学', '计算机科学与技术 · 硕士', '2024.09 – 2027.06', 'GPA 3.8/4.0，专业前 10%\n主修课程：分布式系统、数据库系统、机器学习'),
        entry('华东某大学', '软件工程 · 本科', '2020.09 – 2024.06', 'GPA 3.7/4.0，连续两年获校级一等奖学金'),
      ] },
      { id: uid(), kind: 'entries', title: '实习经历', items: [
        entry('某互联网公司', '后端开发实习生', '2026.06 – 2026.09', '参与订单服务重构，将核心接口拆分为 3 个独立服务，P99 延迟由 420ms 降至 180ms\n设计并落地基于 Redis 的幂等方案，重复下单投诉下降 90%\n编写压测脚本与监控看板，支撑大促期间 5 倍流量峰值'),
        entry('某科技公司', '数据开发实习生', '2025.07 – 2025.09', '维护日均 2 亿条的日志清洗任务，优化 Spark 作业使运行时间缩短 35%\n搭建数据质量校验规则 40 余条，提前发现 6 次上游异常'),
      ] },
      { id: uid(), kind: 'entries', title: '项目经历', items: [
        entry('校园二手交易平台', '项目负责人', '2025.03 – 2025.06', '基于 Spring Boot + MySQL + Vue 搭建，上线后累计注册用户 3000+\n使用消息队列削峰，秒杀场景下单成功率由 71% 提升至 99%'),
      ] },
      { id: uid(), kind: 'text', title: '专业技能', body: '编程语言：Java、Go、Python、SQL\n框架与中间件：Spring Boot、MyBatis、Redis、Kafka、MySQL\n其他：Linux、Docker、Git；英语 CET-6（580）' },
      { id: uid(), kind: 'text', title: '获奖与证书', body: '2025 年全国大学生数学建模竞赛省级一等奖\n2024 年校级优秀毕业生' },
    ],
    style: { ...defaultStyle },
  };
}

export function emptyResume(style = defaultStyle) {
  return {
    basics: { name: '', title: '', phone: '', email: '', city: '', link: '', photo: '' },
    sections: [
      { id: uid(), kind: 'entries', title: '教育背景', items: [entry('', '', '', '')] },
      { id: uid(), kind: 'entries', title: '实习经历', items: [entry('', '', '', '')] },
      { id: uid(), kind: 'text', title: '专业技能', body: '' },
    ],
    style: { ...style },
  };
}

// 导入或读取本地存档时补全缺失字段，结构不对则返回 null。
export function normalizeResume(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sections)) return null;
  const text = (value) => (typeof value === 'string' ? value : '');
  const basics = raw.basics && typeof raw.basics === 'object' ? raw.basics : {};
  const style = { ...defaultStyle, ...(raw.style && typeof raw.style === 'object' ? raw.style : {}) };
  const clamp = (value, min, max, fallback) => (Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback);
  return {
    basics: Object.fromEntries(['name', 'title', 'phone', 'email', 'city', 'link', 'photo'].map((key) => [key, text(basics[key])])),
    sections: raw.sections.filter((section) => section && typeof section === 'object').map((section) => section.kind === 'text'
      ? { id: uid(), kind: 'text', title: text(section.title), body: text(section.body) }
      : { id: uid(), kind: 'entries', title: text(section.title), items: (Array.isArray(section.items) ? section.items : []).filter((item) => item && typeof item === 'object').map((item) => entry(text(item.name), text(item.role), text(item.date), text(item.desc))) }),
    style: {
      template: ['classic', 'compact', 'banner'].includes(style.template) ? style.template : defaultStyle.template,
      accent: /^#[0-9a-f]{6}$/i.test(style.accent) ? style.accent : defaultStyle.accent,
      font: style.font === 'serif' ? 'serif' : 'sans',
      scale: clamp(style.scale, 0.8, 1.15, defaultStyle.scale),
      lineHeight: clamp(style.lineHeight, 1.25, 1.9, defaultStyle.lineHeight),
      margin: clamp(style.margin, 8, 25, defaultStyle.margin),
      autoFit: style.autoFit !== false,
    },
  };
}
