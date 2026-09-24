import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Bookmark, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, ExternalLink, Filter, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';

const PAGE_SIZE = 8;
const STORAGE_KEY = 'campus-opportunities:favorites:v1';
const emptyFilters = { city: '', industry: '', cohort: '', batch: '', deadline: '' };

function todayInChina() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function daysUntil(date) {
  if (!date) return null;
  const today = todayInChina();
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
  return [...new Set(jobs.flatMap((job) => key === 'city' ? job.cities || [] : [job[key]]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function statusOf(job) {
  if (job.verification === 'demo') return { label: '演示记录', tone: 'demo' };
  if (daysUntil(job.deadline) !== null && daysUntil(job.deadline) < 0) return { label: '已过截止日', tone: 'expired' };
  if (!safeUrl(job.applyUrl)) return { label: '缺少网申链接', tone: 'caution' };
  return { label: '招聘状态待核验', tone: 'caution' };
}

function deadlineLabel(job) {
  if (!job.deadline) return '截止日期未提供';
  const days = daysUntil(job.deadline);
  if (days < 0) return `已过截止日 · ${job.deadline}`;
  if (days === 0) return `今天截止 · ${job.deadline}`;
  if (days <= 7) return `${days} 天后截止 · ${job.deadline}`;
  return `截止 ${job.deadline}`;
}

function JobCard({ job, favorite, onFavorite }) {
  const status = statusOf(job);
  const apply = safeUrl(job.applyUrl);
  const announcement = safeUrl(job.announcementUrl);
  const source = safeUrl(job.sourceUrl);
  return (
    <article className="job-card">
      <div className="job-card-main">
        <div className="card-heading">
          <div>
            <div className="company-row"><span className="company-mark" aria-hidden="true">{job.company?.slice(0, 1) || '岗'}</span><span className="company-name">{job.company}</span></div>
            <h3>{job.title}</h3>
          </div>
          <button className={`bookmark-button ${favorite ? 'is-saved' : ''}`} type="button" onClick={() => onFavorite(job.id)} aria-label={favorite ? `取消收藏 ${job.title}` : `收藏 ${job.title}`} title={favorite ? '取消收藏' : '收藏'}><Bookmark size={19} fill={favorite ? 'currentColor' : 'none'} /></button>
        </div>
        <div className="tags"><span>{job.industry || '行业未提供'}</span><span>{job.cohort || '届别未提供'}</span><span>{job.batch || '批次未提供'}</span><span><MapPin size={13} />{job.cities?.length ? job.cities.join('、') : '城市未提供'}</span></div>
        <div className="card-meta"><span className={daysUntil(job.deadline) !== null && daysUntil(job.deadline) >= 0 && daysUntil(job.deadline) <= 7 ? 'urgent' : ''}><CalendarDays size={15} />{deadlineLabel(job)}</span><span><Clock3 size={15} />数据更新 {job.updatedAt ? job.updatedAt.slice(0, 10) : '未提供'}</span></div>
      </div>
      <div className="job-card-foot">
        <div className="provenance"><span className={`status status-${status.tone}`}>{status.label}</span><span>来源：{job.source || '未提供'}</span>{source && <a href={source} target="_blank" rel="noopener noreferrer">来源记录 <ExternalLink size={12} /></a>}</div>
        <div className="card-actions">{announcement && <a href={announcement} target="_blank" rel="noopener noreferrer" className="text-link">原始公告 <ArrowUpRight size={15} /></a>}{apply ? <a href={apply} target="_blank" rel="noopener noreferrer" className="apply-link">网申地址 <ArrowUpRight size={16} /></a> : <span className="apply-disabled">暂无网申地址</span>}</div>
      </div>
    </article>
  );
}

function SelectFilter({ label, value, options, onChange }) {
  return <label className="filter-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">全部{label}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

export default function App() {
  const [dataset, setDataset] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('updated');
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
  useEffect(() => { setPage(1); }, [query, filters, tab, sort]);

  const jobs = dataset?.jobs || [];
  const options = useMemo(() => ({ city: uniqueOptions(jobs, 'city'), industry: uniqueOptions(jobs, 'industry'), cohort: uniqueOptions(jobs, 'cohort'), batch: uniqueOptions(jobs, 'batch') }), [jobs]);
  const filtered = useMemo(() => jobs.filter((job) => {
    if (tab === 'saved' && !favorites.includes(job.id)) return false;
    const days = daysUntil(job.deadline);
    if (tab === 'soon' && (days === null || days < 0 || days > 7)) return false;
    if (query.trim() && ![job.company, job.title, job.industry, job.batch, ...(job.cities || [])].join(' ').toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (filters.city && !job.cities?.includes(filters.city)) return false;
    if (filters.industry && job.industry !== filters.industry) return false;
    if (filters.cohort && job.cohort !== filters.cohort) return false;
    if (filters.batch && job.batch !== filters.batch) return false;
    if (filters.deadline === '7' && (days === null || days < 0 || days > 7)) return false;
    if (filters.deadline === '30' && (days === null || days < 0 || days > 30)) return false;
    if (filters.deadline === 'unknown' && days !== null) return false;
    return true;
  }).sort((a, b) => sort === 'deadline' ? (a.deadline || '9999').localeCompare(b.deadline || '9999') : (b.updatedAt || '').localeCompare(a.updatedAt || '')), [jobs, favorites, tab, query, filters, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeCount = Object.values(filters).filter(Boolean).length;
  const updateFilter = (name, value) => setFilters((current) => ({ ...current, [name]: value }));
  const toggleFavorite = (id) => setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const clearFilters = () => { setFilters(emptyFilters); setQuery(''); };

  return <div className="app-shell">
    <header className="topbar"><div className="topbar-inner"><a className="brand" href={import.meta.env.BASE_URL} aria-label="秋招信库首页"><span className="brand-icon">秋</span><span><strong>秋招信库</strong><small>CAMPUS OPPORTUNITIES</small></span></a><div className="topbar-right"><span className="topbar-caption">把每一次投递，建立在可追溯的信息上</span><span className="edition">2026 / 2027 校招</span></div></div></header>
    <div className="workspace">
      <section className="intro"><div><span className="eyebrow">中国校招 · 岗位信息库</span><h1>找到适合你的下一站<span className="title-dot">.</span></h1><p>按城市、行业与届别缩小范围，查看来源，再决定是否投递。</p></div><div className="intro-aside"><span className="intro-number">{jobs.length.toLocaleString('zh-CN')}</span><span>条{dataset?.mode === 'demo' ? '演示' : ''}信息</span><small>仅展示原始数据，不代替企业公告</small></div></section>
      {dataset?.mode === 'demo' && <div className="demo-notice"><span className="notice-dot" />当前展示演示数据，用于体验搜索、筛选和收藏；这些公司与岗位均不代表真实招聘。</div>}
      <div className="toolbar"><nav className="tabs" aria-label="岗位列表"><button type="button" className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>招聘机会</button><button type="button" className={tab === 'soon' ? 'active' : ''} onClick={() => setTab('soon')}>即将截止</button><button type="button" className={tab === 'saved' ? 'active' : ''} onClick={() => setTab('saved')}>我的收藏 <span>{favorites.length}</span></button></nav><label className="search-box"><Search size={18} /><span className="sr-only">搜索公司、岗位或城市</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、岗位、城市..." />{query && <button type="button" onClick={() => setQuery('')} aria-label="清空搜索"><X size={16} /></button>}</label></div>
      <div className="content-grid"><aside className={`filter-panel ${mobileFiltersOpen ? 'open' : ''}`} aria-label="筛选条件"><div className="filter-header"><div><SlidersHorizontal size={17} /><strong>筛选条件</strong>{activeCount > 0 && <span className="filter-badge">{activeCount}</span>}</div><button type="button" className="mobile-close" onClick={() => setMobileFiltersOpen(false)} aria-label="关闭筛选"><X size={20} /></button></div><div className="filter-body"><SelectFilter label="城市" value={filters.city} options={options.city} onChange={(value) => updateFilter('city', value)} /><SelectFilter label="行业" value={filters.industry} options={options.industry} onChange={(value) => updateFilter('industry', value)} /><SelectFilter label="届别" value={filters.cohort} options={options.cohort} onChange={(value) => updateFilter('cohort', value)} /><SelectFilter label="批次" value={filters.batch} options={options.batch} onChange={(value) => updateFilter('batch', value)} /><fieldset className="deadline-filter"><legend>截止日期</legend>{[['', '全部日期'], ['7', '7 天内'], ['30', '30 天内'], ['unknown', '日期未提供']].map(([value, label]) => <label key={label}><input type="radio" name="deadline" checked={filters.deadline === value} onChange={() => updateFilter('deadline', value)} /><span>{label}</span>{filters.deadline === value && <Check size={14} />}</label>)}</fieldset><button type="button" className="reset-button" onClick={clearFilters}>清空筛选条件</button></div><div className="filter-bottom"><span className="mini-icon">i</span>招聘信息可能变化，投递前请核对原始公告。</div></aside>
      <main className="results"><div className="result-head"><div><h2>{tab === 'saved' ? '我的收藏' : tab === 'soon' ? '即将截止' : '全部岗位'}<span>{filtered.length}</span></h2><p>按你选择的条件显示结果</p></div><div className="result-controls"><button type="button" className="mobile-filter-button" onClick={() => setMobileFiltersOpen(true)}><Filter size={16} />筛选{activeCount > 0 ? ` ${activeCount}` : ''}</button><label>排序 <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated">最近更新</option><option value="deadline">截止日期</option></select></label></div></div>
      {loadError ? <div className="empty-state"><h3>岗位数据暂时无法加载</h3><p>请刷新页面重试；如果问题持续，可检查网站部署状态。</p><button type="button" onClick={() => window.location.reload()}>重新加载</button></div> : !dataset ? <div className="empty-state"><p>正在加载岗位信息…</p></div> : visible.length ? <><div className="job-list">{visible.map((job) => <JobCard key={job.id} job={job} favorite={favorites.includes(job.id)} onFavorite={toggleFavorite} />)}</div><div className="pagination"><span>显示 {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} / {filtered.length} 条</span><div><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} aria-label="上一页"><ChevronLeft size={18} /></button><strong>{page} / {totalPages}</strong><button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} aria-label="下一页"><ChevronRight size={18} /></button></div></div></> : <div className="empty-state"><div className="empty-icon"><Search size={24} /></div><h3>{tab === 'saved' && favorites.length === 0 ? '还没有收藏的岗位' : '没有找到匹配的岗位'}</h3><p>{tab === 'saved' && favorites.length === 0 ? '点击岗位卡片右上角的收藏图标，稍后可在这里查看。' : '换个关键词，或清空筛选条件后再试。'}</p><button type="button" onClick={clearFilters}>清空筛选</button></div>}
      </main></div><footer className="footer"><span>秋招信库 · 招聘信息索引</span><span>收藏只保存在当前浏览器 · 数据来源与更新时间见每条记录</span></footer></div>
      {mobileFiltersOpen && <button type="button" className="filter-backdrop" onClick={() => setMobileFiltersOpen(false)} aria-label="关闭筛选面板" />}
    </div>;
}
