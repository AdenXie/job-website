import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Bookmark, ChartColumn, Check, ChevronLeft, ChevronRight, ExternalLink, FileText, Filter, Info, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { fieldValues, hasFieldValue } from './job-fields.mjs';
import { normalizeIndustry } from './industries.mjs';
import { detectProfile, hasProfile, mergeDetected } from './recommend/profile.mjs';
import { familyStats, rankJobs } from './recommend/score.mjs';
import { loadProfile, ProfileCard, ProfileDialog, saveProfile, storedResume } from './recommend/ProfilePanel.jsx';
import LocalBoardPanel from './LocalBoardPanel.jsx';

const PAGE_SIZE = 30;
const STORAGE_KEY = 'campus-opportunities:favorites:v1';
const emptyFilters = { province: '', city: '', industry: '', family: '', cohort: '', batch: '', deadline: '' };
const DEADLINE_OPTIONS = ['7', '30', 'unknown'];
const SORT_OPTIONS = ['updated', 'deadline', 'recommend'];

// 筛选条件可以写在网址里（如 ?city=上海&family=算法），方便从数据洞察页跳转和分享
function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const filters = Object.fromEntries(Object.keys(emptyFilters).map((key) => [key, (params.get(key) || '').trim().slice(0, 60)]));
  if (!DEADLINE_OPTIONS.includes(filters.deadline)) filters.deadline = '';
  // 排序方式可以写进网址；画像只存在本地，不进网址。from=resume 表示从简历生成器跳转过来
  const sort = SORT_OPTIONS.includes(params.get('sort')) ? params.get('sort') : 'updated';
  return { filters, query: (params.get('q') || '').slice(0, 60), sort, fromResume: params.get('from') === 'resume' };
}

const industriesOf = (job) => [...new Set(fieldValues(job.industry).map(normalizeIndustry))];
const chinaDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });

function todayInChina() {
  return chinaDateFormatter.format(new Date());
}

function daysUntil(date, today = todayInChina()) {
  if (!date) return null;
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function readFavorites() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function uniqueOptions(jobs, key) {
  return [...new Set(jobs.flatMap((job) => key === 'city' ? job.cities || [] : key === 'province' ? job.provinces || [] : key === 'industry' ? industriesOf(job) : fieldValues(job[key])).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function statusOf(job) {
  if (job.verification === 'demo') return { label: '演示记录', tone: 'demo' };
  if (daysUntil(job.deadline) !== null && daysUntil(job.deadline) < 0) return { label: '已过截止日', tone: 'expired' };
  if (!safeUrl(job.applyUrl)) return { label: '缺少网申链接', tone: 'caution' };
  return { label: '招聘状态待核验', tone: 'caution' };
}

// 撕条上的倒计时：3 天内换成黄色告示纸，7 天内文字提醒
function deadlineInfo(job) {
  if (!job.deadline) return { date: '未提供', note: '截止日期未提供', tone: 'unknown' };
  const days = daysUntil(job.deadline);
  const date = job.deadline.slice(5).replace('-', '月') + '日';
  if (days < 0) return { date, note: '已过截止日', tone: 'expired' };
  if (days === 0) return { date, note: '今天截止', tone: 'urgent' };
  if (days <= 3) return { date, note: `还剩 ${days} 天`, tone: 'urgent' };
  if (days <= 7) return { date, note: `还剩 ${days} 天`, tone: 'soon' };
  return { date, note: `还剩 ${days} 天`, tone: 'later' };
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function JobCard({ job, favorite, onFavorite, reasons, index }) {
  const [tearing, setTearing] = useState(false);
  const status = statusOf(job);
  const apply = safeUrl(job.applyUrl);
  const announcement = safeUrl(job.announcementUrl);
  const source = safeUrl(job.sourceUrl);
  const deadline = deadlineInfo(job);
  const updated = job.updatedAt ? `数据更新 ${job.updatedAt.slice(0, 10)}` : job.manualUpdatedAt ? `手动更新 ${job.manualUpdatedAt.slice(0, 10)}` : '更新时间未提供';
  // 收藏 = 把撕条撕下来带走：先播放撕下的动画，再更新收藏
  const toggle = () => {
    if (favorite || tearing || reducedMotion()) { onFavorite(job.id); return; }
    setTearing(true);
    window.setTimeout(() => { setTearing(false); onFavorite(job.id); }, 380);
  };
  return (
    <article className={`notice tone-${deadline.tone}${favorite ? ' is-saved' : ''}`} style={{ '--i': Math.min(index, 12) }}>
      <div className="notice-body">
        <p className="notice-company">{job.company}</p>
        <h3 className="notice-title">{job.title}</h3>
        {job.program && job.program !== job.title && <p className="notice-program">{job.program}</p>}
        {reasons?.length > 0 && <div className="match-reasons" aria-label="推荐原因">{reasons.map((reason) => <span key={`${reason.type}-${reason.label}`} className={`reason-${reason.type}`}><Check size={12} aria-hidden="true" />{reason.label}</span>)}</div>}
        <ul className="notice-facts" aria-label="岗位信息">
          <li><MapPin size={13} aria-hidden="true" />{job.cities?.length ? job.cities.join('、') : '城市未提供'}</li>
          <li>{job.cohort || '届别未提供'}</li>
          <li>{job.batch || '批次未提供'}</li>
          <li>{job.industry || '行业未提供'}</li>
        </ul>
        <div className="notice-foot">
          <p className="provenance"><span className={`status status-${status.tone}`}>{status.label}</span><span>来源：{job.source || '未提供'}</span><span>{updated}</span>{source && <a href={source} target="_blank" rel="noopener noreferrer">来源记录 <ExternalLink size={12} aria-hidden="true" /></a>}</p>
          <div className="card-actions">{announcement && <a href={announcement} target="_blank" rel="noopener noreferrer" className="text-link">原始公告 <ArrowUpRight size={15} aria-hidden="true" /></a>}{apply ? <a href={apply} target="_blank" rel="noopener noreferrer" className="apply-link">去网申 <ArrowUpRight size={16} aria-hidden="true" /></a> : <span className="apply-disabled">暂无网申地址</span>}</div>
        </div>
      </div>
      <div className={`tear-strip${tearing ? ' is-tearing' : ''}`}>
        <div className="strip-deadline">
          <span className="strip-label">截止</span>
          <strong className="strip-date">{deadline.date}</strong>
          <span className="strip-note">{deadline.note}</span>
        </div>
        <button type="button" className="strip-save" onClick={toggle} aria-pressed={favorite} aria-label={favorite ? `取消收藏 ${job.title}` : `收藏 ${job.title}`}>
          <Bookmark size={15} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />{favorite ? '已收藏' : '收藏'}
        </button>
      </div>
    </article>
  );
}

// 分段切换：选中块在按钮之间滑动（参照 BoardUI 的 Segmented Control）
function SegmentedTabs({ tabs, value, onChange }) {
  const ref = useRef(null);
  const [thumb, setThumb] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const active = ref.current?.querySelector('[aria-selected="true"]');
      if (active) setThumb({ x: active.offsetLeft, w: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, tabs]);
  return <div className="segmented" role="tablist" aria-label="岗位列表" ref={ref}>
    {thumb && <span className="segmented-thumb" aria-hidden="true" style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }} />}
    {tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={value === item.id} onClick={() => onChange(item.id)}>{item.label}{item.count !== undefined && <span className="tab-count" key={item.count}>{item.count}</span>}</button>)}
  </div>;
}

function NoticeSkeleton() {
  return <div className="job-list" aria-busy="true" aria-label="正在加载岗位信息">{[0, 1, 2, 3].map((item) => <div key={item} className="notice notice-skeleton"><div className="notice-body"><span /><span /><span /></div><div className="tear-strip" /></div>)}</div>;
}

function SelectFilter({ label, value, options, onChange }) {
  return <label className="filter-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">全部{label}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

export default function App() {
  const today = todayInChina();
  const [dataset, setDataset] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [initialUrl] = useState(readUrlState);
  const [query, setQuery] = useState(initialUrl.query);
  const [filters, setFilters] = useState(initialUrl.filters);
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState(initialUrl.sort);
  const [profile, setProfile] = useState(loadProfile);
  const [profileDialog, setProfileDialog] = useState(null);
  const [page, setPage] = useState(1);
  const [favorites, setFavorites] = useState(readFavorites);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}jobs.json`, { cache: 'no-cache' })
      .then((response) => { if (!response.ok) throw new Error('data unavailable'); return response.json(); })
      .then((data) => { if (!Array.isArray(data.jobs)) throw new Error('invalid data'); setDataset(data); })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites)); } catch { /* Browsers may block local storage. */ } }, [favorites]);
  useEffect(() => { setPage(1); }, [query, filters, tab, sort, profile]);
  useEffect(() => { saveProfile(profile); }, [profile]);

  const jobs = useMemo(() => (dataset?.jobs || []).filter((job) => !job.deadline || job.deadline >= today), [dataset, today]);
  useEffect(() => {
    const ids = new Set(jobs.map((job) => job.id));
    if (dataset) setFavorites((current) => current.filter((id) => ids.has(id)));
  }, [dataset, jobs]);
  const options = useMemo(() => ({
    province: uniqueOptions(jobs, 'province'),
    city: filters.province
      ? [...new Set(jobs.flatMap((job) => (job.locations || []).filter((location) => location.province === filters.province).map((location) => location.city)))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
      : uniqueOptions(jobs, 'city'),
    industry: uniqueOptions(jobs, 'industry'), family: uniqueOptions(jobs, 'family'), cohort: uniqueOptions(jobs, 'cohort'), batch: uniqueOptions(jobs, 'batch'),
  }), [jobs, filters.province]);
  const cityNames = useMemo(() => uniqueOptions(jobs, 'city').filter((city) => !['全国', '海外'].includes(city)), [jobs]);
  const stats = useMemo(() => familyStats(jobs), [jobs]);
  // 画像来自简历时，每次打开都按最新简历刷新没被手动改过的字段；从简历生成器跳转过来时也一样
  useEffect(() => {
    if (!dataset) return;
    const resume = storedResume();
    if (resume && (initialUrl.fromResume || profile?.source === 'resume')) {
      setProfile((current) => mergeDetected(current, detectProfile(resume, cityNames), { source: 'resume' }));
    } else if (initialUrl.fromResume) {
      setProfileDialog({ intro: { warn: true, text: '简历生成器里还没有你自己的简历（示例内容不会用于推荐）。可以上传 PDF 或手动设置画像。' } });
    }
    // 只在数据加载完成时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset]);
  // 网址里带来的值不在当前数据里时清掉，避免下拉框显示空白却仍在筛选
  useEffect(() => {
    if (!dataset) return;
    setFilters((current) => {
      const next = { ...current };
      for (const key of ['province', 'city', 'industry', 'family', 'cohort', 'batch']) if (next[key] && !options[key].includes(next[key])) next[key] = '';
      return Object.keys(next).some((key) => next[key] !== current[key]) ? next : current;
    });
  }, [dataset, options]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    if (sort !== 'updated') params.set('sort', sort);
    const search = params.toString();
    if (search !== window.location.search.slice(1)) window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
  }, [filters, query, sort]);
  const matched = useMemo(() => jobs.filter((job) => {
    if (tab === 'saved' && !favorites.includes(job.id)) return false;
    const days = daysUntil(job.deadline, today);
    if (tab === 'soon' && (days === null || days < 0 || days > 7)) return false;
    if (query.trim() && ![job.company, job.title, job.program, job.industry, job.family, job.batch, ...(job.cities || [])].join(' ').toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (filters.province && filters.city && !job.locations?.some((location) => location.province === filters.province && location.city === filters.city)) return false;
    if (filters.province && !filters.city && !job.provinces?.includes(filters.province)) return false;
    if (filters.city && !filters.province && !job.cities?.includes(filters.city)) return false;
    if (filters.industry && !industriesOf(job).includes(filters.industry)) return false;
    if (!hasFieldValue(job.family, filters.family)) return false;
    if (!hasFieldValue(job.cohort, filters.cohort)) return false;
    if (!hasFieldValue(job.batch, filters.batch)) return false;
    if (filters.deadline === '7' && (days === null || days < 0 || days > 7)) return false;
    if (filters.deadline === '30' && (days === null || days < 0 || days > 30)) return false;
    if (filters.deadline === 'unknown' && days !== null) return false;
    return true;
  }).sort((a, b) => sort === 'deadline' ? (a.deadline || '9999').localeCompare(b.deadline || '9999') : (b.updatedAt || b.manualUpdatedAt || '').localeCompare(a.updatedAt || a.manualUpdatedAt || '')), [jobs, favorites, tab, query, filters, sort, today]);
  // “为你推荐”在现有筛选结果上打分排序，同分保持最近更新的顺序；届别不符的岗位被排除
  const recommending = sort === 'recommend' && hasProfile(profile);
  const ranked = useMemo(() => (recommending ? rankJobs(matched, profile, { stats, today }) : null), [recommending, matched, profile, stats, today]);
  const filtered = ranked ? ranked.map((item) => item.job) : matched;
  const reasonsById = useMemo(() => new Map((ranked || []).map((item) => [item.job.id, item.reasons])), [ranked]);
  const chooseSort = (value) => { setSort(value); if (value === 'recommend' && !hasProfile(profile)) setProfileDialog({}); };
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeCount = Object.values(filters).filter(Boolean).length;
  const updateFilter = (name, value) => setFilters((current) => ({ ...current, [name]: value, ...(name === 'province' ? { city: '' } : {}) }));
  const toggleFavorite = (id) => setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const clearFilters = () => { setFilters(emptyFilters); setQuery(''); };
  const soonCount = useMemo(() => jobs.filter((job) => { const days = daysUntil(job.deadline, today); return days !== null && days >= 0 && days <= 7; }).length, [jobs, today]);
  const generated = dataset?.generatedAt ? chinaDateFormatter.format(new Date(dataset.generatedAt)) : '';
  // 列表的 key：翻页、换标签或筛选时重新挂载，卡片按顺序贴上来
  const listKey = `${tab}|${page}|${sort}|${query}|${Object.values(filters).join(',')}`;
  const tabs = [{ id: 'all', label: '招聘机会' }, { id: 'soon', label: '即将截止' }, { id: 'saved', label: '我的收藏', count: favorites.length }];
  const base = import.meta.env.BASE_URL;

  return <div className="app-shell">
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href={base} aria-label="秋招信库首页"><span className="brand-seal" aria-hidden="true">秋</span><span className="brand-name">秋招信库</span></a>
        <span className="edition">2026 / 2027 届校招</span>
        <nav className="topbar-nav" aria-label="站内工具">
          <a href={`${base}insights/`}><ChartColumn size={16} aria-hidden="true" /><span>数据洞察</span></a>
          <a href={`${base}resume/`}><FileText size={16} aria-hidden="true" /><span>简历生成器</span></a>
          <a className="blog-link" href="https://www.adenxie.com.cn/" target="_blank" rel="noopener noreferrer"><img src={`${base}blog-avatar.jpg`} width="24" height="24" alt="" decoding="async" /><span>我的主页</span><span className="sr-only">（在新标签页打开）</span></a>
        </nav>
      </div>
      <div className="head-rule" aria-hidden="true" />
    </header>
    <div className="workspace">
      <section className="intro">
        <h1>找到适合你的下一站</h1>
        <p className="intro-line">{dataset ? <>共 <strong>{jobs.length.toLocaleString('zh-CN')}</strong> 条{dataset.mode === 'demo' ? '演示' : '在招'}岗位，其中 <strong className="intro-soon">{soonCount.toLocaleString('zh-CN')}</strong> 条 7 天内截止{generated && <> · 数据更新于 {generated}</>}</> : '正在读取岗位数据…'}</p>
        <p className="intro-sub">按城市、行业与届别缩小范围，查看原始公告，再决定是否投递。信息不代替企业公告。</p>
      </section>
      {dataset?.mode === 'demo' && <div className="demo-notice"><Info size={16} aria-hidden="true" />当前展示演示数据，用于体验搜索、筛选和收藏；这些公司与岗位均不代表真实招聘。</div>}
      <div className="toolbar">
        <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />
        <label className="search-box"><Search size={17} aria-hidden="true" /><span className="sr-only">搜索公司、岗位或城市</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、岗位、城市" />{query && <button type="button" onClick={() => setQuery('')} aria-label="清空搜索"><X size={15} /></button>}</label>
      </div>
      <div className="content-grid">
        <aside className={`filter-panel ${mobileFiltersOpen ? 'open' : ''}`} aria-label="筛选条件">
          <div className="filter-header"><div><SlidersHorizontal size={16} aria-hidden="true" /><strong>筛选条件</strong>{activeCount > 0 && <span className="filter-badge">{activeCount}</span>}</div><button type="button" className="mobile-close" onClick={() => setMobileFiltersOpen(false)} aria-label="关闭筛选"><X size={20} /></button></div>
          <div className="filter-body">
            <ProfileCard profile={profile} active={recommending} onEdit={() => setProfileDialog({})} onRecommend={() => { setSort('recommend'); setMobileFiltersOpen(false); }} />
            <SelectFilter label="省份" value={filters.province} options={options.province} onChange={(value) => updateFilter('province', value)} />
            <SelectFilter label="城市" value={filters.city} options={options.city} onChange={(value) => updateFilter('city', value)} />
            <SelectFilter label="行业" value={filters.industry} options={options.industry} onChange={(value) => updateFilter('industry', value)} />
            <SelectFilter label="岗位族" value={filters.family} options={options.family} onChange={(value) => updateFilter('family', value)} />
            <SelectFilter label="届别" value={filters.cohort} options={options.cohort} onChange={(value) => updateFilter('cohort', value)} />
            <SelectFilter label="批次" value={filters.batch} options={options.batch} onChange={(value) => updateFilter('batch', value)} />
            <fieldset className="deadline-filter"><legend>截止日期</legend>{[['', '全部日期'], ['7', '7 天内'], ['30', '30 天内'], ['unknown', '日期未提供']].map(([value, label]) => <label key={label}><input type="radio" name="deadline" checked={filters.deadline === value} onChange={() => updateFilter('deadline', value)} /><span>{label}</span>{filters.deadline === value && <Check size={14} aria-hidden="true" />}</label>)}</fieldset>
            <button type="button" className="reset-button" onClick={clearFilters} disabled={!activeCount && !query}>清空筛选条件</button>
          </div>
          <p className="filter-bottom"><Info size={14} aria-hidden="true" />招聘信息可能变化，投递前请核对原始公告。</p>
        </aside>
        <main className="results">
          <div className="result-head">
            <div className="result-title"><h2>{tab === 'saved' ? '我的收藏' : tab === 'soon' ? '即将截止' : '全部岗位'}</h2><span className="result-count">{filtered.length.toLocaleString('zh-CN')} 条</span>{visible.length > 1 && <span className="guide-words" title="本页第一家和最后一家公司">{visible[0].company}<span aria-hidden="true">—</span>{visible[visible.length - 1].company}</span>}</div>
            <div className="result-controls"><button type="button" className="mobile-filter-button" onClick={() => setMobileFiltersOpen(true)}><Filter size={16} aria-hidden="true" />筛选{activeCount > 0 ? ` ${activeCount}` : ''}</button><label>排序<select value={sort} onChange={(event) => chooseSort(event.target.value)}><option value="updated">最近更新</option><option value="deadline">截止日期</option><option value="recommend">为你推荐</option></select></label></div>
          </div>
          {tab === 'saved' && dataset && <LocalBoardPanel jobs={jobs.filter((job) => favorites.includes(job.id))} />}
          {sort === 'recommend' && !recommending && <div className="recommend-notice"><span>“为你推荐”需要先设置求职画像（方向、城市、届别），目前按最近更新显示。</span><button type="button" onClick={() => setProfileDialog({})}>设置画像</button></div>}
          {recommending && <p className="recommend-caption">岗位没有职位描述，推荐只比较方向、城市、届别和行业；带 ✓ 的标签是命中的原因。{profile.cohort && `已隐藏不面向 ${profile.cohort} 的岗位。`}</p>}
          {loadError ? <div className="empty-state"><h3>岗位数据暂时无法加载</h3><p>请刷新页面重试；如果问题持续，可检查网站部署状态。</p><button type="button" onClick={() => window.location.reload()}>重新加载</button></div>
            : !dataset ? <NoticeSkeleton />
            : visible.length ? <><div className="job-list" key={listKey}>{visible.map((job, index) => <JobCard key={job.id} index={index} job={job} favorite={favorites.includes(job.id)} onFavorite={toggleFavorite} reasons={reasonsById.get(job.id)} />)}</div><div className="pagination"><span>显示 {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} / {filtered.length} 条</span><div><button type="button" disabled={page <= 1} onClick={() => { setPage((current) => current - 1); window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); }} aria-label="上一页"><ChevronLeft size={18} /></button><strong>{page} / {totalPages}</strong><button type="button" disabled={page >= totalPages} onClick={() => { setPage((current) => current + 1); window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); }} aria-label="下一页"><ChevronRight size={18} /></button></div></div></>
            : <div className="empty-state"><div className="empty-icon"><Search size={22} aria-hidden="true" /></div><h3>{tab === 'saved' && favorites.length === 0 ? '还没有收藏的岗位' : '没有找到匹配的岗位'}</h3><p>{tab === 'saved' && favorites.length === 0 ? '点击岗位右侧撕条上的“收藏”，就能在这里集中查看，并同步到本地投递看板。' : '换个关键词，或清空筛选条件后再试。'}</p>{!(tab === 'saved' && favorites.length === 0) && <button type="button" onClick={clearFilters}>清空筛选</button>}</div>}
        </main>
      </div>
      <footer className="footer"><span>秋招信库 · 校招信息索引 · <a href="https://github.com/AdenXie/job-website" target="_blank" rel="noopener noreferrer">源码（AGPL-3.0）</a></span><span>收藏只保存在当前浏览器 · 数据来源与更新时间见每条记录</span></footer>
    </div>
      {mobileFiltersOpen && <button type="button" className="filter-backdrop" onClick={() => setMobileFiltersOpen(false)} aria-label="关闭筛选面板" />}
      {profileDialog && <ProfileDialog profile={profile} onChange={setProfile} onClose={() => { setProfileDialog(null); setMobileFiltersOpen(false); }} cityNames={cityNames} industryOptions={options.industry} cohortOptions={options.cohort.filter((cohort) => /^\d{4}届$/.test(cohort))} intro={profileDialog.intro} />}
    </div>;
}
