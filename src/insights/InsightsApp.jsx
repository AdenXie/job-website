import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import ThemeToggle from '../ThemeToggle.jsx';

// 省份方块图：每个省一格，位置大致对应地理方位，不是真实地图
const PROVINCE_TILES = {
  黑龙江: [7, 0], 内蒙古: [5, 1], 吉林: [7, 1],
  新疆: [1, 2], 甘肃: [2, 2], 宁夏: [3, 2], 山西: [4, 2], 河北: [5, 2], 北京: [6, 2], 辽宁: [7, 2],
  西藏: [1, 3], 青海: [2, 3], 陕西: [3, 3], 河南: [4, 3], 山东: [5, 3], 天津: [6, 3],
  四川: [2, 4], 重庆: [3, 4], 湖北: [4, 4], 安徽: [5, 4], 江苏: [6, 4],
  云南: [2, 5], 贵州: [3, 5], 湖南: [4, 5], 江西: [5, 5], 浙江: [6, 5], 上海: [7, 5],
  广西: [3, 6], 广东: [4, 6], 福建: [5, 6], 台湾: [7, 6],
  海南: [3, 7], 澳门: [4, 7], 香港: [5, 7],
};
const PROVINCE_STEPS = [100, 300, 700, 1500];
const WEEKS = 8;
const chinaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
const number = (value) => value.toLocaleString('zh-CN');
const percent = (value) => `${(value * 100).toFixed(1)}%`;
// 跳回岗位库并带上筛选条件，首页会从网址读取
const jobsLink = (key, value) => `${import.meta.env.BASE_URL}?${new URLSearchParams({ [key]: value })}`;


function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

const shortDate = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

// 截止日期按访问当天分周，已过去的日期不计入
function deadlineWeeks(byDate, today) {
  const weeks = Array.from({ length: WEEKS }, (_, index) => ({ start: addDays(today, index * 7), end: addDays(today, index * 7 + 6), count: 0 }));
  let later = 0;
  let upcoming = 0;
  for (const [date, count] of byDate) {
    if (date < today) continue;
    upcoming += count;
    const index = Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / (7 * 86400000));
    if (index < WEEKS) weeks[index].count += count; else later += count;
  }
  return { weeks, later, upcoming };
}

function Card({ title, caliber, wide, children }) {
  return <section className={wide ? 'card wide' : 'card'}>
    <h2>{title}</h2>
    <p className="caliber">{caliber}</p>
    {children}
  </section>;
}

function BarList({ rows, note, link }) {
  const max = Math.max(1, ...rows.map((row) => row[1]));
  return <ol className="bar-list">{rows.map(([name, count], index) => {
    const href = link?.(name);
    const content = <>
      <span className="bar-name">{name}</span>
      <span className="bar-track"><span className="bar" style={{ width: `${(count / max) * 100}%` }} /></span>
      <span className="bar-value">{number(count)}</span>
      {note?.(index) && <small className="bar-note">{note(index)}</small>}
    </>;
    return <li key={name}>{href
      ? <a className="bar-row" href={href} title={`${name}：${number(count)} 条，点击在岗位库中查看`}>{content}</a>
      : <div className="bar-row" title={`${name}：${number(count)} 条`}>{content}</div>}</li>;
  })}</ol>;
}

function ProvinceTiles({ provinces }) {
  const counts = new Map(provinces);
  const step = (count) => PROVINCE_STEPS.filter((limit) => count >= limit).length;
  return <div className="tiles-wrap">
    <div className="tiles" aria-label="各省份岗位数方块图">
      {Object.entries(PROVINCE_TILES).map(([name, [column, row]]) => {
        const count = counts.get(name) || 0;
        const style = { gridColumn: column, gridRow: row + 1 };
        const content = <><strong>{name}</strong><span>{number(count)}</span></>;
        return count
          ? <a key={name} className={`tile s${step(count)}`} style={style} href={jobsLink('province', name)} title={`${name}：${number(count)} 条，点击在岗位库中查看`}>{content}</a>
          : <div key={name} className="tile s0" style={style} title={`${name}：0 条`}>{content}</div>;
      })}
    </div>
    <div className="tile-legend" aria-hidden="true">
      {['< 100', '100–299', '300–699', '700–1,499', '≥ 1,500'].map((text, index) => <span key={text}><i className={`tile s${index}`} />{text}</span>)}
    </div>
  </div>;
}

function DeadlineChart({ deadlines, total, today }) {
  const [active, setActive] = useState(null);
  const [width, setWidth] = useState(640);
  const boxRef = useRef(null);
  useLayoutEffect(() => {
    // 按容器实际宽度绘制，字号不随图表缩放；首帧前先量一次，避免窄屏溢出
    setWidth(Math.max(280, boxRef.current.clientWidth));
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(boxRef.current);
    return () => observer.disconnect();
  }, []);
  const { weeks, later, upcoming } = deadlineWeeks(deadlines.byDate, today);
  const max = Math.max(1, ...weeks.map((week) => week.count));
  const tick = max <= 10 ? 5 : max <= 100 ? 50 : max <= 400 ? 100 : 500;
  const top = Math.ceil(max / tick) * tick;
  const height = 240;
  const pad = { left: 40, right: 8, top: 14, bottom: 30 };
  const band = (width - pad.left - pad.right) / WEEKS;
  const barWidth = Math.min(24, band * 0.55);
  const y = (value) => pad.top + (1 - value / top) * (height - pad.top - pad.bottom);
  const ticks = Array.from({ length: Math.round(top / tick) + 1 }, (_, index) => index * tick);
  return <>
    <p className="coverage"><strong>基于 {number(deadlines.withDeadline)} 条有截止日期的岗位</strong>，只占全部 {number(total)} 条的 {percent(deadlines.withDeadline / total)}；其余岗位没有提供截止日期，不代表仍在招聘。今天及以后截止的共 {number(upcoming)} 条，其中 8 周以后 {number(later)} 条。</p>
    <div className="column-chart" ref={boxRef}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="未来 8 周每周截止的岗位数">
        {ticks.map((value) => <g key={value}><line className="grid" x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} /><text className="axis" x={pad.left - 6} y={y(value) + 4} textAnchor="end">{number(value)}</text></g>)}
        {weeks.map((week, index) => {
          const x = pad.left + index * band + (band - barWidth) / 2;
          const barHeight = y(0) - y(week.count);
          const radius = Math.min(4, barHeight);
          return <g key={week.start} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} tabIndex={0} aria-label={`${week.start} 至 ${week.end}：${week.count} 条`}>
            <rect className="hit" x={pad.left + index * band} y={pad.top} width={band} height={height - pad.top - pad.bottom} />
            {week.count > 0 && <path className={active === index ? 'column active' : 'column'} d={`M${x},${y(0)} V${y(week.count) + radius} Q${x},${y(week.count)} ${x + radius},${y(week.count)} H${x + barWidth - radius} Q${x + barWidth},${y(week.count)} ${x + barWidth},${y(week.count) + radius} V${y(0)} Z`} />}
            {(band >= 46 || index % 2 === 0) && <text className="axis" x={pad.left + index * band + band / 2} y={height - 10} textAnchor="middle">{index === 0 ? '本周' : shortDate(week.start)}</text>}
            {(index === 0 || week.count === max) && week.count > 0 && <text className="value" x={x + barWidth / 2} y={y(week.count) - 6} textAnchor="middle">{number(week.count)}</text>}
          </g>;
        })}
        <line className="baseline" x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} />
      </svg>
      {active !== null && <div className="tooltip" style={{ left: `${((pad.left + active * band + band / 2) / width) * 100}%` }}>
        <strong>{shortDate(weeks[active].start)}–{shortDate(weeks[active].end)}</strong>{number(weeks[active].count)} 条截止
      </div>}
    </div>
  </>;
}

export default function InsightsApp() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const today = chinaDate.format(new Date());

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}insights.json`, { cache: 'no-cache' })
      .then((response) => { if (!response.ok) throw new Error('data unavailable'); return response.json(); })
      .then((value) => { if (!value?.totals) throw new Error('invalid data'); setData(value); })
      .catch(() => setFailed(true));
  }, []);


  const updated = data?.generatedAt ? new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '未提供';

  return <div className="page">
    <header className="topbar"><div className="topbar-inner">
      <a className="brand" href={import.meta.env.BASE_URL} aria-label="秋招信库首页"><span className="brand-icon">秋</span><span><strong>秋招信库</strong><small>CAMPUS OPPORTUNITIES</small></span></a>
      <div className="topbar-right">
        <ThemeToggle />
        <a className="back-link" href={import.meta.env.BASE_URL}><ArrowLeft size={16} /><span>返回岗位库</span></a>
      </div>
    </div></header>

    <main className="workspace">
      <section className="intro">
        <span className="eyebrow">秋招信库 · 数据洞察</span>
        <h1>今年秋招的岗位，都在哪里<span className="title-dot">.</span></h1>
        <p>按城市、行业、岗位族和截止日期汇总岗位库的整体情况。每张图下方写明了计数口径，一条岗位可能同时计入多个城市、行业或岗位族。点击条目可跳到岗位库查看对应岗位；岗位库不显示今天之前已截止的记录，数量可能略少。</p>
      </section>

      {failed && <div className="notice">统计数据暂时无法加载，请稍后刷新。</div>}
      {!data && !failed && <div className="notice">正在加载统计数据…</div>}

      {data && <>
        <section className="stats" aria-label="概览">
          <div className="stat"><span>岗位总数</span><strong>{number(data.totals.jobs)}</strong><small>当前在库的校招记录</small></div>
          <div className="stat"><span>招聘公司</span><strong>{number(data.totals.companies)}</strong><small>{percent(data.companies.singleRecord / data.totals.companies)} 的公司只有 1 条记录</small></div>
          <div className="stat"><span>覆盖城市</span><strong>{number(data.totals.cities)}</strong><small>分布在 {data.totals.provinces} 个省级地区</small></div>
          <div className="stat"><span>数据更新</span><strong className="stat-date">{updated}</strong><small>约每 12 小时随岗位同步更新</small></div>
        </section>

        <div className="grid">
          <Card title="岗位最多的城市" caliber={`一条岗位列出多个城市时，每个城市各计 1 次（${percent(data.totals.multiCityJobs / data.totals.jobs)} 的岗位不止一个城市）。“全国”${number(data.broadLocations[0][1])} 条、“海外”${number(data.broadLocations[1][1])} 条不是具体城市，不参与排行；${number(data.totals.noCityJobs)} 条未提供地点。`}>
            <BarList rows={data.cities.slice(0, 15)} link={(name) => jobsLink('city', name)} />
          </Card>
          <Card title="省份分布" caliber="按岗位所在城市归到省级地区，同一条岗位在一个省内的多个城市只计 1 次。方块位置只表示大致方位，不是地图。">
            <ProvinceTiles provinces={data.provinces} />
          </Card>
          <Card title="行业分布" caliber="行业来自数据源标注，写法不同的同一行业已合并（如“通信/电子/半导体”并入“电子/通信/半导体”）；一条岗位标注多个行业时各计 1 次。">
            <BarList rows={data.industries.slice(0, 15)} link={(name) => jobsLink('industry', name)} />
          </Card>
          <Card title="岗位族分布" caliber={`按岗位标题里的职位关键词归类，一条岗位可属于多个岗位族；对不上任何关键词的归为“其他”，占全部岗位的 ${percent(data.otherFamilyShare)}。小字为该岗位族岗位最多的城市。`}>
            <BarList rows={data.families.map((family) => [family.name, family.count])} link={(name) => jobsLink('family', name)} note={(index) => data.families[index].topCities.length ? `最多：${data.families[index].topCities.map(([city, count]) => `${city} ${number(count)}`).join(' · ')}` : ''} />
          </Card>
          <Card title="未来 8 周的截止日期" caliber="按截止日期所在的周统计，从今天起每 7 天一组。" wide>
            <DeadlineChart deadlines={data.deadlines} total={data.totals.jobs} today={today} />
          </Card>
          <Card title="届别分布" caliber="届别来自数据源标注；一条岗位同时面向多届时各计 1 次，无法识别的写法归为“其他”。">
            <BarList rows={data.cohorts} link={(name) => (name === '其他' ? null : jobsLink('cohort', name))} />
          </Card>
          <Card title="记录最多的公司" caliber={`按公司的岗位记录条数排行，一条记录通常是一次招聘公告，不等于招聘人数。岗位库里 ${number(data.companies.singleRecord)} 家公司只有 1 条记录，排行差距很小。`}>
            <BarList rows={data.companies.top} link={(name) => jobsLink('q', name)} />
          </Card>
        </div>
      </>}
    </main>

    <footer className="footer">
      <p><strong>数据说明</strong>招聘状态未经逐条人工核验，投递前请以企业公告为准。已知截止日期过期的记录会在同步时移除；没有截止日期的记录无法据此判断是否仍在招聘。</p>
      <p>岗位数据来自 <a href="https://developer.offerxiansheng.com/docs/quickstart" target="_blank" rel="noopener noreferrer">offer先生校招 API</a> 与 <a href="https://github.com/xixicc186/xixicc2027" target="_blank" rel="noopener noreferrer">xixicc2027</a>，以及本站手动整理的校招公告（记录中标注为“手动导入”）{data && `；本次统计中三者分别为 ${data.sources.map(([name, count]) => `${name} ${number(count)} 条`).join('、')}`}。每条记录的来源与原始链接见岗位库。</p>
      <p>秋招信库 · 招聘信息索引 · <a href="https://github.com/AdenXie/job-website/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">源码 Apache 2.0</a></p>
    </footer>
  </div>;
}
