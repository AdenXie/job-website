import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Download, Eye, FileDown, ImagePlus, Link as LinkIcon, Mail, MapPin, PencilLine, Phone, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { emptyResume, normalizeResume, sampleResume, uid } from './sample.js';

const STORAGE_KEY = 'campus-opportunities:resume:v1';
const PAGE_WIDTH = 210 * 96 / 25.4;
const PAGE_HEIGHT = 297 * 96 / 25.4;
const MIN_FIT_SCALE = 0.7;
const TEMPLATES = [
  { id: 'classic', name: '经典', hint: '居中抬头 · 通栏标题线' },
  { id: 'compact', name: '紧凑', hint: '左右抬头 · 单行条目' },
  { id: 'banner', name: '色带', hint: '强调色 · 条目色带' },
];
const ACCENTS = ['#195766', '#1f4e8c', '#8a3b2e', '#3d5a3a', '#2b2b2b'];

function loadResume() {
  try {
    return normalizeResume(JSON.parse(localStorage.getItem(STORAGE_KEY))) || sampleResume();
  } catch {
    return sampleResume();
  }
}

function lines(text) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

function move(list, index, step) {
  const target = index + step;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
}

// 把头像裁成 3:4 并压缩，避免原图撑满本地存储。
function readPhoto(file, onDone) {
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 400;
      const ratio = Math.max(300 / image.width, 400 / image.height);
      const width = image.width * ratio;
      const height = image.height * ratio;
      canvas.getContext('2d').drawImage(image, (300 - width) / 2, (400 - height) / 2, width, height);
      onDone(canvas.toDataURL('image/jpeg', 0.85));
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function Field({ label, value, onChange, placeholder, wide, rows }) {
  return <label className={wide ? 'rz-field wide' : 'rz-field'}><span>{label}</span>{rows
    ? <textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />}</label>;
}

function RowActions({ label, onUp, onDown, onRemove }) {
  return <span className="rz-row-actions">
    <button type="button" onClick={onUp} disabled={!onUp} aria-label={`上移${label}`}><ArrowUp size={14} /></button>
    <button type="button" onClick={onDown} disabled={!onDown} aria-label={`下移${label}`}><ArrowDown size={14} /></button>
    <button type="button" className="danger" onClick={onRemove} aria-label={`删除${label}`}><Trash2 size={14} /></button>
  </span>;
}

function TextLine({ line }) {
  const match = line.match(/^([^：:]{1,12})[：:]\s*(.+)$/);
  return match ? <li><strong>{match[1]}：</strong>{match[2]}</li> : <li>{line}</li>;
}

function Sheet({ resume, sheetRef }) {
  const { basics, sections } = resume;
  const href = basics.link && (/^https?:\/\//.test(basics.link) ? basics.link : `https://${basics.link}`);
  return <table className="sheet" ref={sheetRef}>
    <thead><tr><td className="sheet-margin" /></tr></thead>
    <tfoot><tr><td className="sheet-margin" /></tr></tfoot>
    <tbody><tr><td className="sheet-body">
      <header className={basics.photo ? 'r-header has-photo' : 'r-header'}>
        {basics.photo && <img className="r-photo" src={basics.photo} alt="" />}
        <div className="r-id"><h1 className="r-name">{basics.name || '你的姓名'}</h1>{basics.title && <p className="r-title">{basics.title}</p>}</div>
        <div className="r-contact">
          {basics.phone && <span><Phone />{basics.phone}</span>}
          {basics.email && <span><Mail />{basics.email}</span>}
          {basics.city && <span><MapPin />{basics.city}</span>}
          {basics.link && <span><LinkIcon /><a href={href}>{basics.link}</a></span>}
        </div>
      </header>
      {sections.map((section) => {
        const items = section.kind === 'entries' ? section.items.filter((item) => item.name || item.role || item.date || item.desc.trim()) : lines(section.body);
        if (!items.length) return null;
        return <section className="r-section" key={section.id}>
          <h2>{section.title}</h2>
          {section.kind === 'text' ? <ul className="r-text">{items.map((line, index) => <TextLine key={index} line={line} />)}</ul> : items.map((item) => <div className="r-entry" key={item.id}>
            <div className="r-entry-head"><span className="r-entry-main"><strong>{item.name}</strong>{item.role && <span className="r-role">{item.role}</span>}</span>{item.date && <span className="r-date">{item.date}</span>}</div>
            {item.desc.trim() && <ul>{lines(item.desc).map((line, index) => <li key={index}>{line}</li>)}</ul>}
          </div>)}
        </section>;
      })}
    </td></tr></tbody>
  </table>;
}

export default function ResumeApp() {
  const [resume, setResume] = useState(loadResume);
  const [pane, setPane] = useState('edit');
  const [zoom, setZoom] = useState(1);
  const [layout, setLayout] = useState({ scale: 1, height: PAGE_HEIGHT });
  const sheetRef = useRef(null);
  const stageRef = useRef(null);
  const importRef = useRef(null);
  const { basics, sections, style } = resume;

  const update = (mutate) => setResume((current) => { const next = structuredClone(current); mutate(next); return next; });
  const setBasic = (key) => (value) => update((draft) => { draft.basics[key] = value; });
  const setStyle = (key, value) => update((draft) => { draft.style[key] = value; });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(resume)); } catch { /* 存储不可用时仍可编辑和导出 */ }
  }, [resume]);

  useEffect(() => {
    document.title = basics.name ? `${basics.name}-简历` : '简历生成器 · 秋招信库';
  }, [basics.name]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width > 0) setZoom(Math.min(1, width / PAGE_WIDTH));
    });
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  // 内容超出一页时，在字号下限内二分查找刚好放进一页的缩放比例。
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const fits = (scale) => { sheet.style.setProperty('--scale', scale); return sheet.offsetHeight <= PAGE_HEIGHT - 4; };
    let scale = style.scale;
    if (!fits(scale) && style.autoFit) {
      let low = MIN_FIT_SCALE;
      let high = scale;
      for (let step = 0; step < 7; step += 1) {
        const middle = (low + high) / 2;
        if (fits(middle)) low = middle; else high = middle;
      }
      scale = low;
      fits(scale);
    }
    const height = Math.max(sheet.offsetHeight, PAGE_HEIGHT);
    setLayout((current) => (current.scale === scale && current.height === height ? current : { scale, height }));
  }, [resume, pane, zoom]);

  const pages = Math.ceil((layout.height - 4) / PAGE_HEIGHT);
  const shrunk = layout.scale < style.scale - 0.001;
  const status = pages > 1
    ? { warn: true, text: style.autoFit ? `已压到最小字号仍约 ${pages} 页，建议精简内容或调小边距` : `内容约 ${pages} 页，可开启“自动压缩到一页”` }
    : { warn: false, text: shrunk ? `一页 · 已自动压缩至 ${Math.round(layout.scale * 100)}%` : '一页' };

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(resume, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${basics.name || '简历'}-数据.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importJson = async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    let next = null;
    try { next = normalizeResume(JSON.parse(await file.text())); } catch { /* 交给下面统一提示 */ }
    if (next) setResume(next); else window.alert('无法识别这个文件，请选择本页导出的 JSON 数据。');
  };
  const replaceAll = (next, message) => { if (window.confirm(message)) setResume(next); };

  return <div className="rz-app" data-pane={pane}>
    <header className="rz-topbar">
      <a className="rz-back" href={import.meta.env.BASE_URL} aria-label="返回秋招信库"><ArrowLeft size={16} /><span>秋招信库</span></a>
      <strong className="rz-heading">简历生成器</strong>
      <div className="rz-actions">
        <button type="button" onClick={() => replaceAll(sampleResume(), '用示例内容替换当前简历？')} title="载入示例"><RotateCcw size={15} /><span>示例</span></button>
        <button type="button" onClick={() => replaceAll(emptyResume(style), '清空当前简历内容？')} title="清空内容"><Trash2 size={15} /><span>清空</span></button>
        <button type="button" onClick={() => importRef.current.click()} title="导入 JSON 数据"><Upload size={15} /><span>导入</span></button>
        <button type="button" onClick={exportJson} title="导出 JSON 数据备份"><Download size={15} /><span>备份</span></button>
        <button type="button" className="primary" onClick={() => window.print()}><FileDown size={16} /><span>导出 PDF</span></button>
        <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importJson} />
      </div>
    </header>
    <nav className="rz-pane-tabs" aria-label="视图切换">
      <button type="button" className={pane === 'edit' ? 'active' : ''} onClick={() => setPane('edit')}><PencilLine size={15} />编辑</button>
      <button type="button" className={pane === 'preview' ? 'active' : ''} onClick={() => setPane('preview')}><Eye size={15} />预览</button>
    </nav>
    <div className="rz-main">
      <aside className="rz-editor">
        <section className="rz-card">
          <h2>模板与排版</h2>
          <div className="rz-templates" role="radiogroup" aria-label="模板">{TEMPLATES.map((template) => <button type="button" role="radio" aria-checked={style.template === template.id} className={style.template === template.id ? 'active' : ''} key={template.id} onClick={() => setStyle('template', template.id)}><strong>{template.name}</strong><small>{template.hint}</small></button>)}</div>
          <div className="rz-style-row">
            <span className="rz-swatches" role="radiogroup" aria-label="强调色">{ACCENTS.map((color) => <button type="button" role="radio" aria-checked={style.accent === color} aria-label={color} className={style.accent === color ? 'active' : ''} key={color} style={{ background: color }} onClick={() => setStyle('accent', color)} />)}</span>
            <label className="rz-select"><span>字体</span><select value={style.font} onChange={(event) => setStyle('font', event.target.value)}><option value="sans">黑体</option><option value="serif">宋体</option></select></label>
          </div>
          <label className="rz-range"><span>字号 {Math.round(style.scale * 100)}%</span><input type="range" min="0.8" max="1.15" step="0.01" value={style.scale} onChange={(event) => setStyle('scale', Number(event.target.value))} /></label>
          <label className="rz-range"><span>行距 {style.lineHeight.toFixed(2)}</span><input type="range" min="1.25" max="1.9" step="0.05" value={style.lineHeight} onChange={(event) => setStyle('lineHeight', Number(event.target.value))} /></label>
          <label className="rz-range"><span>页边距 {style.margin}mm</span><input type="range" min="8" max="25" step="1" value={style.margin} onChange={(event) => setStyle('margin', Number(event.target.value))} /></label>
          <label className="rz-check"><input type="checkbox" checked={style.autoFit} onChange={(event) => setStyle('autoFit', event.target.checked)} />自动压缩到一页（内容超出时等比缩小字号与间距）</label>
        </section>

        <section className="rz-card">
          <h2>基本信息</h2>
          <div className="rz-grid">
            <Field label="姓名" value={basics.name} onChange={setBasic('name')} placeholder="李明" />
            <Field label="求职意向 / 一句话介绍" value={basics.title} onChange={setBasic('title')} placeholder="求职意向：后端开发工程师" />
            <Field label="电话" value={basics.phone} onChange={setBasic('phone')} />
            <Field label="邮箱" value={basics.email} onChange={setBasic('email')} />
            <Field label="所在城市" value={basics.city} onChange={setBasic('city')} />
            <Field label="个人链接" value={basics.link} onChange={setBasic('link')} placeholder="github.com/yourname" />
          </div>
          <div className="rz-photo-row">
            <label className="rz-ghost"><ImagePlus size={15} />{basics.photo ? '更换照片' : '添加照片（可选）'}<input type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files[0]; event.target.value = ''; if (file) readPhoto(file, setBasic('photo')); }} /></label>
            {basics.photo && <button type="button" className="rz-ghost" onClick={() => setBasic('photo')('')}>移除照片</button>}
          </div>
        </section>

        {sections.map((section, sectionIndex) => <section className="rz-card" key={section.id}>
          <div className="rz-card-head">
            <input className="rz-title-input" value={section.title} onChange={(event) => update((draft) => { draft.sections[sectionIndex].title = event.target.value; })} aria-label="模块标题" placeholder="模块标题" />
            <RowActions label="模块" onUp={sectionIndex > 0 ? () => update((draft) => move(draft.sections, sectionIndex, -1)) : null} onDown={sectionIndex < sections.length - 1 ? () => update((draft) => move(draft.sections, sectionIndex, 1)) : null} onRemove={() => { if (window.confirm(`删除“${section.title || '未命名'}”模块？`)) update((draft) => { draft.sections.splice(sectionIndex, 1); }); }} />
          </div>
          {section.kind === 'text'
            ? <Field wide rows={4} label="每行一条；“标签：内容”会自动加粗标签" value={section.body} onChange={(value) => update((draft) => { draft.sections[sectionIndex].body = value; })} />
            : <>{section.items.map((item, itemIndex) => {
              const setItem = (key) => (value) => update((draft) => { draft.sections[sectionIndex].items[itemIndex][key] = value; });
              return <div className="rz-item" key={item.id}>
                <div className="rz-item-head"><span>{item.name || `第 ${itemIndex + 1} 条`}</span><RowActions label="条目" onUp={itemIndex > 0 ? () => update((draft) => move(draft.sections[sectionIndex].items, itemIndex, -1)) : null} onDown={itemIndex < section.items.length - 1 ? () => update((draft) => move(draft.sections[sectionIndex].items, itemIndex, 1)) : null} onRemove={() => update((draft) => { draft.sections[sectionIndex].items.splice(itemIndex, 1); })} /></div>
                <div className="rz-grid">
                  <Field label="学校 / 公司 / 项目" value={item.name} onChange={setItem('name')} />
                  <Field label="专业 / 职位 / 角色" value={item.role} onChange={setItem('role')} />
                  <Field wide label="时间" value={item.date} onChange={setItem('date')} placeholder="2026.06 – 2026.09" />
                  <Field wide rows={3} label="描述（每行一条要点）" value={item.desc} onChange={setItem('desc')} />
                </div>
              </div>;
            })}
            <button type="button" className="rz-ghost" onClick={() => update((draft) => { draft.sections[sectionIndex].items.push({ id: uid(), name: '', role: '', date: '', desc: '' }); })}><Plus size={15} />添加一条</button></>}
        </section>)}

        <div className="rz-add-section">
          <button type="button" className="rz-ghost" onClick={() => update((draft) => { draft.sections.push({ id: uid(), kind: 'entries', title: '新模块', items: [{ id: uid(), name: '', role: '', date: '', desc: '' }] }); })}><Plus size={15} />经历类模块</button>
          <button type="button" className="rz-ghost" onClick={() => update((draft) => { draft.sections.push({ id: uid(), kind: 'text', title: '新模块', body: '' }); })}><Plus size={15} />文本类模块</button>
        </div>
        <p className="rz-note">内容只保存在当前浏览器，不会上传。导出 PDF 会打开打印窗口：目标选“另存为 PDF”，纸张 A4，边距选“默认”或“无”。</p>
      </aside>

      <main className="rz-preview">
        <div className={status.warn ? 'rz-status warn' : 'rz-status'} role="status">{status.text}</div>
        <div className="rz-stage" ref={stageRef}>
          <div className="rz-paper-box" style={{ width: PAGE_WIDTH * zoom, height: layout.height * zoom }}>
            <div className={`paper t-${style.template} f-${style.font}`} style={{ transform: `scale(${zoom})`, '--accent': style.accent, '--lh': style.lineHeight, '--m': `${style.margin}mm` }}>
              <Sheet resume={resume} sheetRef={sheetRef} />
              {Array.from({ length: pages - 1 }, (_, index) => <div className="page-guide" key={index} style={{ top: `${(index + 1) * 297}mm` }}><span>第 {index + 2} 页</span></div>)}
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>;
}
