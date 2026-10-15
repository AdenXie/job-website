import { useEffect, useRef, useState } from 'react';
import { FileUp, PencilLine, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { FAMILY_NAMES, OTHER_FAMILY } from '../job-families.mjs';
import { detectProfile, editProfile, emptyProfile, hasProfile, MAX_FAMILIES, mergeDetected, parseProfile, PROFILE_KEY, readStoredResume } from './profile.mjs';

const DIRECTIONS = FAMILY_NAMES.filter((name) => name !== OTHER_FAMILY);

export function loadProfile() {
  try { return parseProfile(JSON.parse(localStorage.getItem(PROFILE_KEY))); } catch { return null; }
}

export function saveProfile(profile) {
  try {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); else localStorage.removeItem(PROFILE_KEY);
  } catch { /* 存储不可用时画像只在本次访问有效 */ }
}

export function storedResume() {
  try { return readStoredResume(window.localStorage); } catch { return null; }
}

function Chips({ values, onRemove, empty }) {
  if (!values.length) return <span className="profile-empty">{empty}</span>;
  return <span className="profile-chips">{values.map((value) => <span key={value} className="profile-chip">{value}{onRemove && <button type="button" onClick={() => onRemove(value)} aria-label={`移除${value}`}><X size={12} /></button>}</span>)}</span>;
}

/** 筛选面板顶部的画像摘要。 */
export function ProfileCard({ profile, active, onEdit, onRecommend }) {
  if (!hasProfile(profile)) {
    return <section className="profile-card is-empty">
      <div className="profile-card-head"><Sparkles size={16} /><strong>为你推荐</strong></div>
      <p>设置求职方向、城市和届别，按相关程度排序岗位。只在当前浏览器计算，不上传简历。</p>
      <button type="button" className="profile-primary" onClick={onEdit}>设置求职画像</button>
    </section>;
  }
  return <section className="profile-card">
    <div className="profile-card-head"><Sparkles size={16} /><strong>求职画像</strong><button type="button" className="profile-edit" onClick={onEdit}><PencilLine size={14} />编辑</button></div>
    <dl>
      <div><dt>方向</dt><dd><Chips values={profile.families} empty="未设置" /></dd></div>
      <div><dt>城市</dt><dd><Chips values={profile.cities} empty="不限" /></dd></div>
      <div><dt>届别</dt><dd><Chips values={profile.cohort ? [profile.cohort] : []} empty="不限" /></dd></div>
      {profile.industries.length > 0 && <div><dt>行业</dt><dd><Chips values={profile.industries} /></dd></div>}
    </dl>
    {!active && <button type="button" className="profile-primary" onClick={onRecommend}>按画像推荐排序</button>}
  </section>;
}

/** 编辑画像的弹窗：从简历识别、上传 PDF 识别，或逐项手动修改。 */
export function ProfileDialog({ profile, onChange, onClose, cityNames, industryOptions, cohortOptions, intro }) {
  const current = profile || emptyProfile();
  const [cityInput, setCityInput] = useState('');
  const [message, setMessage] = useState(intro || null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const dialogRef = useRef(null);
  const resume = storedResume();

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const edit = (field, value) => onChange(editProfile(current, field, value));
  const toggleFamily = (name) => {
    if (current.families.includes(name)) edit('families', current.families.filter((item) => item !== name));
    else if (current.families.length >= MAX_FAMILIES) setMessage({ warn: true, text: `最多选择 ${MAX_FAMILIES} 个方向，先去掉一个再添加。` });
    else edit('families', [...current.families, name]);
  };
  const addCity = () => {
    const city = cityInput.trim().replace(/市$/, '');
    if (!city) return;
    if (!cityNames.includes(city)) { setMessage({ warn: true, text: `岗位库里没有“${city}”的岗位，请从下拉建议里选择城市。` }); return; }
    if (!current.cities.includes(city)) edit('cities', [...current.cities, city]);
    setCityInput('');
  };
  const fromResume = () => {
    if (!resume) return;
    onChange(mergeDetected(current, detectProfile(resume, cityNames), { source: 'resume', reset: true }));
    setMessage({ text: '已从简历生成器里的简历重新识别，手动修改已清除。识别结果可能不准，请逐项核对。' });
  };
  const fromPdf = async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setMessage({ text: '正在识别 PDF…' });
    try {
      const { importPdf } = await import('../resume/pdf-import.js');
      const result = await importPdf(file);
      if (!result) setMessage({ warn: true, text: '这份 PDF 里没有可提取的文字（可能是扫描件或图片），请手动设置画像。' });
      else {
        // 只用识别结果生成画像，不保存简历内容，也不改动简历生成器里的简历
        onChange(mergeDetected(current, detectProfile(result, cityNames), { source: 'pdf', reset: true }));
        setMessage({ text: '已从 PDF 识别画像。PDF 内容没有保存，也没有上传。识别结果可能不准，请逐项核对。' });
      }
    } catch {
      setMessage({ warn: true, text: '无法读取这个 PDF，文件可能已损坏或设有密码。' });
    } finally {
      setBusy(false);
    }
  };

  return <div className="profile-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title" tabIndex={-1} ref={dialogRef}>
      <header className="profile-dialog-head">
        <div><h2 id="profile-title">求职画像</h2><p>只保存方向、城市、届别和行业，存在当前浏览器，不会上传。</p></div>
        <button type="button" className="profile-close" onClick={onClose} aria-label="关闭"><X size={20} /></button>
      </header>
      <div className="profile-dialog-body">
        <div className="profile-sources">
          <button type="button" onClick={fromResume} disabled={!resume}><RotateCcw size={15} />从简历重新识别</button>
          <button type="button" onClick={() => fileRef.current.click()} disabled={busy}><FileUp size={15} />上传 PDF 识别</button>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={fromPdf} />
        </div>
        {!resume && <p className="profile-hint">简历生成器里还没有你自己的简历（示例内容不会用于推荐）。可以先去<a href={`${import.meta.env.BASE_URL}resume/`}>简历生成器</a>填写，或上传 PDF、直接手动设置。</p>}
        {message && <p className={message.warn ? 'profile-message warn' : 'profile-message'} role="status">{message.text}</p>}

        <fieldset className="profile-field">
          <legend>求职方向 <small>最多 {MAX_FAMILIES} 个，按选择顺序决定优先级</small></legend>
          <div className="profile-options">{DIRECTIONS.map((name) => {
            const index = current.families.indexOf(name);
            return <button type="button" key={name} className={index >= 0 ? 'active' : ''} aria-pressed={index >= 0} onClick={() => toggleFamily(name)}>{index >= 0 && <b>{index + 1}</b>}{name}</button>;
          })}</div>
        </fieldset>

        <fieldset className="profile-field">
          <legend>意向城市 <small>不设置则不按城市排序</small></legend>
          <Chips values={current.cities} onRemove={(city) => edit('cities', current.cities.filter((item) => item !== city))} empty="不限城市" />
          <div className="profile-add">
            <input list="profile-city-list" value={cityInput} onChange={(event) => setCityInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCity(); } }} placeholder="输入城市，如 上海" aria-label="添加意向城市" />
            <datalist id="profile-city-list">{cityNames.map((city) => <option key={city} value={city} />)}</datalist>
            <button type="button" onClick={addCity}><Plus size={15} />添加</button>
          </div>
        </fieldset>

        <fieldset className="profile-field">
          <legend>届别 <small>设置后只显示面向这一届（或不限届别）的岗位</small></legend>
          <select value={current.cohort} onChange={(event) => edit('cohort', event.target.value)} aria-label="届别">
            <option value="">不限</option>
            {cohortOptions.map((cohort) => <option key={cohort} value={cohort}>{cohort}</option>)}
          </select>
        </fieldset>

        <fieldset className="profile-field">
          <legend>行业偏好 <small>可选</small></legend>
          <Chips values={current.industries} onRemove={(industry) => edit('industries', current.industries.filter((item) => item !== industry))} empty="不限行业" />
          <select value="" onChange={(event) => { if (event.target.value && !current.industries.includes(event.target.value)) edit('industries', [...current.industries, event.target.value].slice(0, 5)); }} aria-label="添加行业偏好">
            <option value="">添加行业…</option>
            {industryOptions.filter((industry) => !current.industries.includes(industry)).map((industry) => <option key={industry} value={industry}>{industry}</option>)}
          </select>
        </fieldset>
      </div>
      <footer className="profile-dialog-foot">
        <button type="button" className="profile-clear" onClick={() => { onChange(null); setMessage({ text: '画像已清除。' }); }} disabled={!profile}><Trash2 size={15} />清除画像</button>
        <button type="button" className="profile-primary" onClick={onClose}>完成</button>
      </footer>
    </div>
  </div>;
}
