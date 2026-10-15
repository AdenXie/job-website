import { fieldValues } from '../src/job-fields.mjs';

// 岗位族词典：按标题里的每个职位片段匹配，一条记录可属于多个岗位族。
// 补充词典时只改这里。exclude：片段同时含这些词时不计入；fallback：只在片段没命中其他岗位族时才计入；
// yieldTo：同一条记录已命中更具体的岗位族时，这个笼统的岗位族不再计入。
export const JOB_FAMILIES = [
  { name: '后端开发', pattern: /后端|后台开发|服务端|服务器开发|java|golang|(^|[^a-z])go(开发|工程师)|c\+\+|php|全栈|架构师|分布式|中间件|数据库|大数据开发|数据开发|运维|devops|(^|[^a-z])sre(?![a-z])|云计算|云原生/i },
  { name: '前端开发', pattern: /前端|web开发|(^|[^a-z])h5|ios|android|安卓|客户端|移动端|移动开发|小程序|鸿蒙|flutter/i },
  { name: '算法', pattern: /算法|人工智能|(^|[^a-z])ai(?![a-z])|机器学习|深度学习|大模型|llm|nlp|自然语言|计算机视觉|图像|语音|推荐|自动驾驶|感知|机器人/i, exclude: /产品|销售|运营|市场/ },
  { name: '数据分析', pattern: /数据分析|数据科学|数据挖掘|商业分析|大数据|(^|[^a-z])bi(?![a-z])|分析师|统计|量化|数据类|数据岗/i },
  { name: '测试', pattern: /测试|(^|[^a-z])qa(?![a-z])|质量保证/i },
  { name: '软件开发（综合）', pattern: /软件|(^|[^a-z])it(?![a-z])|it技术|计算机|开发工程师|程序员|编程|信息技术|信息化|网络工程|网络安全|信息安全|系统工程师|^开发$|开发类/i, yieldTo: ['后端开发', '前端开发', '算法', '数据分析', '测试'] },
  { name: '硬件/嵌入式', pattern: /硬件|嵌入式|芯片|(^|[^a-z])ic(?![a-z])|集成电路|fpga|射频|电子|电路|单片机|驱动|半导体|光学|光电|通信|微电子|版图|封装|pcb/i },
  { name: '产品', pattern: /产品(经理|策划|助理|专员|岗|类|管培|运营)|^产品$/ },
  { name: '运营', pattern: /运营(?!工程)|新媒体|内容|社群|用户增长|电商|直播|策划|传媒|编辑|记者|主播/ },
  { name: '设计', pattern: /(^|[^a-z])ui|ux|视觉|交互设计|平面设计|美术|动画|原画|游戏设计|品牌设计|工业设计|设计师|^设计(类|岗)?$/i },
  { name: '金融/财务', pattern: /财务|会计|审计|税务|出纳|资金|银行|证券|保险|基金|投资|投行|风控|风险|金融|信贷|理财|精算|资产|期货|信托|柜员|财会|财经/ },
  { name: '销售/市场', pattern: /销售|市场|营销|商务|客户经理|大客户|渠道|品牌|推广|广告|(^|[^a-z])bd(?![a-z])|业务拓展|招商|门店|店长|零售|外贸|贸易/i },
  { name: '管培生', pattern: /管培|管理培训生|培训生|储备|轮岗|未来领袖/ },
  { name: '职能', pattern: /人事|行政|人力|(^|[^a-z])hr(?![a-z])|hrbp|人资|项目(助理|专员)|计划专员|招聘|法务|合规|律师|法律|法学|战略|采购|供应链|物流|仓储|文秘|秘书|党建|党务|综合管理|职能|内控|企业管理|经营管理|管理类|翻译|客服|档案|后勤/i },
  { name: '教育', pattern: /讲师|教师|老师|教研|助教|辅导员|课程|培训师/ },
  { name: '医药/医疗', pattern: /医药|医学|临床|药物|药学|制剂|医生|医师|护士|护理|医疗|生物/ },
  { name: '研发/工程', pattern: /研发|工程|机械|工艺|电气|结构|自动化|设备|材料|化工|化学|土木|建筑|项目管理|项目经理|造价|施工|质量|质检|生产|制造|能源|动力|环境|技术员|技术类|技术岗|实验|仿真|热能|给排水|暖通|测绘|地质|研究员|技术支持|解决方案|(^|[^a-z])ie(?![a-z])|安全|机电|测控|仪器|力学|航空|航天|飞行器|检修|运行|油气|储运|模具|建造|规划|基础设施|产品(设计|开发)/i, fallback: true },
];
export const OTHER_FAMILY = '其他';
export const FAMILY_NAMES = [...JOB_FAMILIES.map((family) => family.name), OTHER_FAMILY];

function familiesOf(segment) {
  const hits = JOB_FAMILIES.filter((family) => family.pattern.test(segment) && !family.exclude?.test(segment));
  const specific = hits.filter((family) => !family.fallback);
  return (specific.length ? specific : hits).map((family) => family.name);
}

/** 标题 → 岗位族，多个时用“、”连接；都对不上时为“其他”。 */
export function classifyFamily(title) {
  const matched = new Set(fieldValues(title).flatMap(familiesOf));
  for (const family of JOB_FAMILIES) {
    if (family.yieldTo && matched.has(family.name) && family.yieldTo.some((name) => matched.has(name))) matched.delete(family.name);
  }
  return FAMILY_NAMES.filter((name) => matched.has(name)).join('、') || OTHER_FAMILY;
}

/** 统计“其他”的占比和高频未归类的职位片段，方便补充词典。 */
export function familyReport(jobs, limit = 30) {
  const unmatched = new Map();
  let other = 0;
  for (const job of jobs) {
    if (classifyFamily(job.title) === OTHER_FAMILY) other += 1;
    for (const segment of fieldValues(job.title)) {
      if (!familiesOf(segment).length) unmatched.set(segment, (unmatched.get(segment) || 0) + 1);
    }
  }
  return {
    total: jobs.length,
    other,
    otherShare: jobs.length ? other / jobs.length : 0,
    unmatched: [...unmatched].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN')).slice(0, limit),
  };
}
