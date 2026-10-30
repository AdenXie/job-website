// 本地投递看板页面。所有内容都用 textContent 渲染，不拼接 HTML；链接只接受 http/https。
import { buildIcs, COLUMNS, createManualCard, exportRows, funnel, mergeImport, previewImport, safeUrl, sanitizeJob, scheduleItems, setStatus, STATUSES, urgency, weeklyApplied } from './board-core.js';
import { decodeSync } from './sync-codec.js';

// selected 只存在内存里，不写进 board.json
const state = { board: { cards: [] }, view: 'board', info: null, selected: new Set() };
const main = document.getElementById('main');
const dialog = document.getElementById('card-dialog');
const selectionBar = document.getElementById('selection-bar');
const printArea = document.getElementById('print-sheet');

// —— 小工具 ——
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    // 内容安全策略不允许 style 属性，用 CSSOM 赋值
    else if (key === 'style') node.style.cssText = value;
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}
const pad = (value) => String(value).padStart(2, '0');
const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; };
const localNow = () => { const now = new Date(); return `${localToday()}T${pad(now.getHours())}:${pad(now.getMinutes())}`; };
const statusLabel = (id) => STATUSES.find((status) => status.id === id)?.label || id;
const columnOf = (id) => STATUSES.find((status) => status.id === id)?.column || 'wish';
const shortDate = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const shortDateTime = (value) => `${shortDate(value.slice(0, 10))} ${value.slice(11, 16)}`;

function showMessage(text, warn = false) {
  const box = document.getElementById('message');
  box.textContent = text;
  box.className = warn ? 'message warn' : 'message';
  box.hidden = !text;
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
  return data;
}

async function saveBoard(board) {
  state.board = await api('/api/board', { method: 'PUT', body: JSON.stringify(board) });
  render();
}

function updateCard(id, change) {
  const cards = state.board.cards.map((card) => (card.id === id ? change(card) : card));
  return saveBoard({ ...state.board, cards, updatedAt: localToday() });
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = el('a', { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** 页面内的确认框，返回 Promise<boolean>。 */
function confirmDialog(title, lines, confirmText = '确定') {
  return new Promise((resolve) => {
    const finish = (value) => { dialog.close(); resolve(value); };
    dialog.replaceChildren(el('div', { className: 'dialog-body confirm' }, [
      el('header', {}, [el('h2', { text: title })]),
      ...lines.map((line) => el('p', { text: line })),
      el('footer', {}, [el('button', { type: 'button', text: '取消', onClick: () => finish(false) }), el('button', { type: 'button', className: 'primary', text: confirmText, onClick: () => finish(true) })]),
    ]));
    dialog.addEventListener('cancel', () => resolve(false), { once: true });
    dialog.showModal();
  });
}

// —— 看板视图 ——
function statusSelect(card) {
  return el('select', { 'aria-label': `${card.job.company} 的状态`, onChange: (event) => updateCard(card.id, (current) => setStatus(current, event.target.value, localToday())) },
    STATUSES.map((status) => el('option', { value: status.id, text: status.label, selected: status.id === card.status })));
}

function cardView(card, now) {
  const alert = urgency(card, now);
  const meta = [card.job.cities.slice(0, 3).join('、') + (card.job.cities.length > 3 ? ' 等' : ''), card.job.cohort].filter(Boolean).join(' · ');
  const node = el('article', { className: `card${alert ? ' urgent' : ''}${card.removed ? ' removed' : ''}`, draggable: 'true', dataset: { id: card.id } }, [
    // 按住复选框时关闭拖拽，松开后恢复
    el('label', { className: 'card-check', onPointerdown: () => { node.draggable = false; document.addEventListener('pointerup', () => { node.draggable = true; }, { once: true }); } }, [
      el('input', { type: 'checkbox', checked: state.selected.has(card.id), 'aria-label': `选择 ${card.job.company} · ${card.job.title}`, onChange: (event) => setSelected([card.id], event.target.checked) }),
      el('span', { text: '选择' }),
    ]),
    el('div', { className: 'card-company', text: card.job.company }),
    el('h3', { text: card.job.title }),
    meta && el('p', { className: 'card-meta', text: meta }),
    el('div', { className: 'badges' }, [
      card.removed && el('span', { className: 'badge muted', text: '原岗位已下架' }),
      card.source === 'manual' && el('span', { className: 'badge', text: '手动添加' }),
      card.status === 'rejected' && el('span', { className: 'badge muted', text: '未通过' }),
      card.status === 'withdrawn' && el('span', { className: 'badge muted', text: '已放弃' }),
      card.job.deadline && el('span', { className: alert?.type === 'deadline' ? 'badge warn' : 'badge', text: `截止 ${shortDate(card.job.deadline)}` }),
      card.next.at && el('span', { className: alert?.type === 'next' ? 'badge warn' : 'badge', text: `${shortDateTime(card.next.at)} ${card.next.text || '下一步'}` }),
      ...card.tags.map((tag) => el('span', { className: 'badge tag', text: `#${tag}` })),
    ]),
    el('div', { className: 'card-actions' }, [statusSelect(card), el('button', { type: 'button', text: '详情', onClick: () => openCard(card.id) })]),
  ]);
  node.addEventListener('dragstart', (event) => { event.dataTransfer.setData('text/plain', card.id); event.dataTransfer.effectAllowed = 'move'; node.classList.add('dragging'); });
  node.addEventListener('dragend', () => node.classList.remove('dragging'));
  return node;
}

function renderBoard() {
  const now = localNow();
  if (!state.board.cards.length) {
    main.append(el('section', { className: 'empty' }, [
      el('h2', { text: '还没有岗位' }),
      el('p', { text: '在秋招信库网站上收藏岗位，然后在“我的收藏”里点击“同步到本地看板”；也可以点上方“新增岗位”手动添加不在秋招信库里的岗位。' }),
    ]));
    return;
  }
  const columns = el('div', { className: 'columns' });
  for (const column of COLUMNS) {
    const cards = state.board.cards.filter((card) => columnOf(card.status) === column.id);
    const list = el('div', { className: 'column-cards' }, cards.map((card) => cardView(card, now)));
    const selectAll = el('button', { type: 'button', className: 'link', text: '全选本列', disabled: !cards.length, onClick: () => setSelected(cards.map((card) => card.id), true) });
    const section = el('section', { className: 'column', dataset: { column: column.id } }, [
      el('h2', {}, [el('span', { text: column.label }), el('span', { className: 'column-tools' }, [selectAll, el('span', { className: 'count', text: String(cards.length) })])]),
      column.id === 'closed' && el('p', { className: 'column-hint', text: '拖到这里记为“未通过”，可在下拉框改为“已放弃”' }),
      list,
    ]);
    section.addEventListener('dragover', (event) => { event.preventDefault(); section.classList.add('over'); });
    section.addEventListener('dragleave', () => section.classList.remove('over'));
    section.addEventListener('drop', (event) => {
      event.preventDefault();
      section.classList.remove('over');
      const id = event.dataTransfer.getData('text/plain');
      const card = state.board.cards.find((item) => item.id === id);
      if (!card || columnOf(card.status) === column.id) return;
      updateCard(id, (current) => setStatus(current, column.id === 'closed' ? 'rejected' : column.id, localToday()));
    });
    columns.append(section);
  }
  main.append(el('p', { className: 'hint', text: '拖动卡片换列，或用卡片上的下拉框修改状态；截止日期 3 天内、下一步事项 24 小时内的卡片会高亮。勾选卡片后可以导出 PDF 分享投递进度。' }), columns);
}

// —— 统计视图 ——
function renderStats() {
  const stages = funnel(state.board.cards);
  const max = Math.max(1, stages[0].count);
  const weeks = weeklyApplied(state.board.cards, localToday(), 8);
  const weekMax = Math.max(1, ...weeks.map((week) => week.count));
  main.append(
    el('section', { className: 'panel' }, [
      el('h2', { text: '投递漏斗' }),
      el('p', { className: 'caliber', text: '按每个岗位到达过的最远阶段统计，跳过的阶段也计入；之后结束（未通过、已放弃）的岗位仍按到达过的阶段计数。转化率 = 本阶段 / 上一阶段。' }),
      el('ol', { className: 'bars' }, stages.map((stage) => el('li', {}, [
        el('span', { className: 'bar-label', text: stage.label }),
        el('span', { className: 'bar-track' }, [el('span', { className: 'bar', style: `width:${(stage.count / max) * 100}%` })]),
        el('span', { className: 'bar-value', text: `${stage.count}${stage.rate === null ? '' : `（${Math.round(stage.rate * 100)}%）`}` }),
      ]))),
    ]),
    el('section', { className: 'panel' }, [
      el('h2', { text: '每周投递数量' }),
      el('p', { className: 'caliber', text: '按时间线里第一次进入“已投递”的日期统计，周一为一周开始，最近 8 周。' }),
      el('ol', { className: 'bars' }, weeks.map((week, index) => el('li', {}, [
        el('span', { className: 'bar-label', text: index === weeks.length - 1 ? '本周' : `${shortDate(week.start)} 起` }),
        el('span', { className: 'bar-track' }, [el('span', { className: 'bar', style: `width:${(week.count / weekMax) * 100}%` })]),
        el('span', { className: 'bar-value', text: String(week.count) }),
      ]))),
    ]),
  );
}

// —— 日程视图 ——
function renderSchedule() {
  const items = scheduleItems(state.board.cards);
  const today = localToday();
  main.append(el('section', { className: 'panel' }, [
    el('h2', { text: '日程' }),
    el('p', { className: 'caliber', text: '列出所有截止日期和下一步事项（已结束的岗位不列入）。点上方“导出日历 .ics”可导入手机或电脑日历；截止日期为全天事件，下一步事项按 1 小时计。' }),
    items.length
      ? el('ol', { className: 'schedule' }, items.map((item) => el('li', { className: item.date < today ? 'past' : '' }, [
        el('span', { className: 'schedule-time', text: `${item.date}${item.time ? ` ${item.time}` : ''}` }),
        el('span', { className: item.kind === 'deadline' ? 'badge warn' : 'badge', text: item.kind === 'deadline' ? '截止' : '事项' }),
        el('button', { type: 'button', className: 'link', text: item.title, onClick: () => openCard(item.cardId) }),
      ])))
      : el('p', { className: 'empty-line', text: '还没有截止日期或下一步事项。可以在卡片详情里填写“下一步事项”。' }),
  ]));
}

function render() {
  // 卡片被删除后，从选中集合里移除
  const ids = new Set(state.board.cards.map((card) => card.id));
  for (const id of state.selected) if (!ids.has(id)) state.selected.delete(id);
  main.replaceChildren();
  document.querySelectorAll('.views button').forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));
  if (state.view === 'stats') renderStats();
  else if (state.view === 'schedule') renderSchedule();
  else renderBoard();
  syncSelection();
}

// —— 勾选与导出 PDF ——
function setSelected(ids, selected) {
  for (const id of ids) {
    if (selected) state.selected.add(id);
    else state.selected.delete(id);
  }
  syncSelection();
}

/** 把复选框和工具栏同步到选中集合；不重新渲染，键盘焦点留在原处。 */
function syncSelection() {
  for (const input of main.querySelectorAll('.card-check input')) input.checked = state.selected.has(input.closest('.card').dataset.id);
  selectionBar.hidden = !state.selected.size;
  document.getElementById('selected-count').textContent = `已选 ${state.selected.size} 张`;
}

/** 导出前的确认框。返回 Promise<boolean | null>：null 表示取消，否则为是否包含下一步事项和备注（默认不包含）。 */
function exportDialogFor(count) {
  return new Promise((resolve) => {
    const notes = el('input', { type: 'checkbox' });
    const finish = (value) => { dialog.close(); resolve(value); };
    dialog.replaceChildren(el('div', { className: 'dialog-body confirm' }, [
      el('header', {}, [el('h2', { text: '导出 PDF' })]),
      el('p', { text: `将导出 ${count} 张卡片，按看板列顺序排列。` }),
      el('label', { className: 'check' }, [notes, el('span', { text: '包含下一步事项和备注' })]),
      el('p', { className: 'hint', text: '备注可能包含私人内容，分享前请确认。' }),
      el('p', { text: '确认后会打开打印对话框，请在打印机里选择“另存为 PDF”。' }),
      el('footer', {}, [el('button', { type: 'button', text: '取消', onClick: () => finish(null) }), el('button', { type: 'button', className: 'primary', text: '导出', onClick: () => finish(notes.checked) })]),
    ]));
    dialog.addEventListener('cancel', () => resolve(null), { once: true });
    dialog.showModal();
  });
}

function printJob(row) {
  return el('article', { className: 'sheet-job' }, [
    el('div', { className: 'sheet-top' }, [el('span', { className: 'sheet-company', text: row.company }), el('span', { className: 'sheet-status', text: row.status })]),
    el('h2', { className: 'sheet-title', text: row.title }),
    el('dl', { className: 'sheet-facts' }, [['项目', row.program], ['城市', row.cities], ['届别', row.cohort], ['截止日期', row.deadline]]
      .flatMap(([label, value]) => [el('dt', { text: label }), el('dd', { text: value || '—' })])),
    row.removed && el('p', { className: 'sheet-flag', text: '原岗位已下架' }),
    el('p', { className: 'sheet-label', text: '状态时间线' }),
    el('ol', { className: 'sheet-timeline' }, row.timeline.map((entry) => el('li', { text: `${entry.status} · ${entry.date}` }))),
    row.applyUrl && el('p', { className: 'sheet-link', text: `投递链接：${row.applyUrl}` }),
    'next' in row && el('div', { className: 'sheet-notes' }, [
      el('p', { text: `下一步事项：${row.next.text || '—'}${row.next.at ? `（${row.next.at.replace('T', ' ')}）` : ''}` }),
      el('p', { text: `备注：${row.notes || '—'}` }),
    ]),
  ]);
}

async function exportPdf() {
  const cards = state.board.cards.filter((card) => state.selected.has(card.id));
  if (!cards.length) return;
  const includeNotes = await exportDialogFor(cards.length);
  if (includeNotes === null) return;
  printArea.replaceChildren(
    el('header', { className: 'sheet-head' }, [el('h1', { text: '投递进度' }), el('p', { text: `导出日期 ${localToday()} · 共 ${cards.length} 个职位` })]),
    ...exportRows(cards, { includeNotes }).map(printJob),
  );
  // Chrome 等浏览器把 document.title 作为 PDF 的默认文件名；打印结束后恢复
  const title = document.title;
  document.title = `投递进度-${localToday()}`;
  try {
    window.print();
  } finally {
    document.title = title;
    printArea.replaceChildren();
  }
}

// —— 卡片详情 ——
function field(label, input, hint) {
  return el('label', { className: 'field' }, [el('span', { text: label }), input, hint && el('small', { text: hint })]);
}

function openCard(id) {
  const card = state.board.cards.find((item) => item.id === id);
  if (!card) return;
  const draft = structuredClone(card);
  const status = el('select', {}, STATUSES.map((item) => el('option', { value: item.id, text: item.label, selected: item.id === draft.status })));
  const timeline = el('ol', { className: 'timeline' });
  const drawTimeline = () => timeline.replaceChildren(...draft.timeline.map((entry, index) => el('li', {}, [
    el('span', { text: statusLabel(entry.status) }),
    el('input', { type: 'date', value: entry.date, 'aria-label': `${statusLabel(entry.status)}的日期`, onChange: (event) => { if (event.target.value) draft.timeline[index].date = event.target.value; } }),
    el('button', { type: 'button', className: 'icon', text: '删除', onClick: () => { draft.timeline.splice(index, 1); drawTimeline(); } }),
  ])));
  drawTimeline();
  const nextText = el('input', { type: 'text', value: draft.next.text, maxlength: '200', placeholder: '例如：二面、笔试、HR 面' });
  const nextAt = el('input', { type: 'datetime-local', value: draft.next.at });
  const notes = el('textarea', { rows: '4', maxlength: '5000' });
  notes.value = draft.notes;
  const tags = el('input', { type: 'text', value: draft.tags.join('，'), placeholder: '用逗号分隔，例如：内推，重点' });
  const manual = card.source === 'manual';
  const jobInputs = manual ? {
    company: el('input', { type: 'text', value: draft.job.company, maxlength: '100' }),
    title: el('input', { type: 'text', value: draft.job.title, maxlength: '300' }),
    cities: el('input', { type: 'text', value: draft.job.cities.join('，') }),
    deadline: el('input', { type: 'date', value: draft.job.deadline }),
    applyUrl: el('input', { type: 'url', value: draft.job.applyUrl, placeholder: 'https://' }),
  } : null;
  const links = [['网申地址', card.job.applyUrl], ['原始公告', card.job.announcementUrl]]
    .map(([label, url]) => (safeUrl(url) ? el('a', { href: safeUrl(url), target: '_blank', rel: 'noopener noreferrer', text: `${label} ↗` }) : null)).filter(Boolean);

  const save = async () => {
    let next = { ...draft, next: { text: nextText.value, at: nextAt.value }, notes: notes.value, tags: tags.value.split(/[，,、\s]+/).filter(Boolean) };
    if (status.value !== card.status) next = setStatus(next, status.value, localToday());
    if (jobInputs) {
      const job = sanitizeJob({ ...draft.job, company: jobInputs.company.value, title: jobInputs.title.value, cities: jobInputs.cities.value.split(/[，,、\s]+/).filter(Boolean), deadline: jobInputs.deadline.value, applyUrl: jobInputs.applyUrl.value });
      if (!job) { showMessage('公司和岗位名称不能为空。', true); return; }
      next.job = job;
    }
    dialog.close();
    await updateCard(card.id, () => next).catch((error) => showMessage(error.message, true));
  };
  const remove = async () => {
    if (!(await confirmDialog('删除这张卡片？', [`${card.job.company} · ${card.job.title}`, '状态、时间线、备注和标签会一起删除。'], '删除'))) return;
    await saveBoard({ ...state.board, cards: state.board.cards.filter((item) => item.id !== card.id) }).catch((error) => showMessage(error.message, true));
  };

  dialog.replaceChildren(el('form', { method: 'dialog', className: 'dialog-body', onSubmit: (event) => { event.preventDefault(); save(); } }, [
    el('header', {}, [el('div', {}, [el('p', { className: 'card-company', text: card.job.company }), el('h2', { text: card.job.title })]), el('button', { type: 'button', className: 'icon', text: '关闭', onClick: () => dialog.close() })]),
    card.removed && el('p', { className: 'message warn', text: '秋招信库上已经没有这个岗位（可能已截止或下架），卡片保留供你记录。' }),
    links.length > 0 && el('p', { className: 'links' }, links),
    jobInputs && el('div', { className: 'grid' }, [field('公司', jobInputs.company), field('岗位', jobInputs.title), field('城市', jobInputs.cities, '用逗号分隔'), field('截止日期', jobInputs.deadline), field('网申地址', jobInputs.applyUrl)]),
    field('状态', status),
    el('div', { className: 'field' }, [el('span', { text: '状态时间线' }), timeline, el('small', { text: '每次换状态会自动记录当天日期，可以在这里修改。' })]),
    el('div', { className: 'grid' }, [field('下一步事项', nextText), field('时间', nextAt)]),
    field('备注', notes),
    field('标签', tags),
    el('footer', {}, [el('button', { type: 'button', className: 'danger', text: '删除卡片', onClick: remove }), el('button', { type: 'submit', className: 'primary', text: '保存' })]),
  ]));
  dialog.showModal();
}

function openNewCard() {
  const inputs = {
    company: el('input', { type: 'text', maxlength: '100', required: true }),
    title: el('input', { type: 'text', maxlength: '300', required: true }),
    cities: el('input', { type: 'text', placeholder: '用逗号分隔' }),
    cohort: el('input', { type: 'text', placeholder: '例如：2027届' }),
    deadline: el('input', { type: 'date' }),
    applyUrl: el('input', { type: 'url', placeholder: 'https://' }),
  };
  const create = async () => {
    const card = createManualCard({ company: inputs.company.value, title: inputs.title.value, cities: inputs.cities.value.split(/[，,、\s]+/).filter(Boolean), cohort: inputs.cohort.value, deadline: inputs.deadline.value, applyUrl: inputs.applyUrl.value }, localToday(), crypto.randomUUID().slice(0, 12));
    if (!card) { showMessage('公司和岗位名称不能为空。', true); return; }
    dialog.close();
    await saveBoard({ ...state.board, cards: [card, ...state.board.cards] }).catch((error) => showMessage(error.message, true));
  };
  dialog.replaceChildren(el('form', { method: 'dialog', className: 'dialog-body', onSubmit: (event) => { event.preventDefault(); create(); } }, [
    el('header', {}, [el('h2', { text: '新增岗位' }), el('button', { type: 'button', className: 'icon', text: '关闭', onClick: () => dialog.close() })]),
    el('p', { className: 'hint', text: '用于记录不在秋招信库里的岗位，新增后进入“想投”。' }),
    el('div', { className: 'grid' }, [field('公司', inputs.company), field('岗位', inputs.title), field('城市', inputs.cities), field('届别', inputs.cohort), field('截止日期', inputs.deadline), field('网申地址', inputs.applyUrl)]),
    el('footer', {}, [el('span'), el('button', { type: 'submit', className: 'primary', text: '新增' })]),
  ]));
  dialog.showModal();
}

// —— 从网站同步：地址里的 #import=… ——
async function importFromHash() {
  if (!location.hash.startsWith('#import=')) return;
  const value = location.hash.slice('#import='.length);
  // 无论成功与否都先清掉地址里的数据，避免刷新时重复导入
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const jobs = (await decodeSync(value)).map(sanitizeJob).filter(Boolean);
    if (!jobs.length) { showMessage('同步数据里没有可导入的岗位。', true); return; }
    const { added, existing } = previewImport(state.board, jobs);
    const ok = await confirmDialog(`从秋招信库同步 ${jobs.length} 个收藏岗位`, [
      `将新增 ${added} 条，放进“想投”。`,
      `已存在 ${existing} 条，只更新岗位信息（截止日期、链接等），不改动状态、时间线、备注和标签。`,
      '同步是单向的：之后在网站上取消收藏，不会删除这里的卡片。',
    ], '确认导入');
    if (!ok) { showMessage('已取消导入。'); return; }
    const result = mergeImport(state.board, jobs, localToday());
    await saveBoard(result.board);
    showMessage(`导入完成：新增 ${result.added} 条，更新 ${result.updated} 条。在网站上取消收藏不会删除这里的卡片。`);
  } catch (error) {
    showMessage(`同步失败：${error.message}`, true);
  }
}

// —— 顶部按钮 ——
document.querySelectorAll('.views button').forEach((button) => button.addEventListener('click', () => { state.view = button.dataset.view; render(); }));
document.getElementById('add-card').addEventListener('click', openNewCard);
document.getElementById('export-pdf').addEventListener('click', exportPdf);
document.getElementById('clear-selection').addEventListener('click', () => { state.selected.clear(); syncSelection(); });
document.getElementById('refresh').addEventListener('click', async (event) => {
  event.target.disabled = true;
  showMessage('正在从秋招信库读取最新岗位信息…');
  try {
    const result = await api('/api/refresh', { method: 'POST', body: '{}' });
    state.board = result.board;
    render();
    showMessage(`已更新 ${result.updated} 张卡片的岗位信息${result.removed ? `，${result.removed} 个岗位在网站上已下架（卡片保留）` : ''}。`);
  } catch (error) {
    showMessage(`刷新失败：${error.message}`, true);
  } finally {
    event.target.disabled = false;
  }
});
document.getElementById('export-json').addEventListener('click', () => download(`投递看板-${localToday()}.json`, `${JSON.stringify(state.board, null, 2)}\n`, 'application/json'));
document.getElementById('import-json').addEventListener('click', () => document.getElementById('import-file').click());
document.getElementById('import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data?.cards)) throw new Error('这不是本地看板导出的 JSON 文件');
    if (!(await confirmDialog('用这个文件替换当前看板？', [`文件里有 ${data.cards.length} 张卡片，当前看板有 ${state.board.cards.length} 张。`, '当前内容会先自动备份到 data/backups 文件夹。'], '替换'))) return;
    await saveBoard(data);
    showMessage(`已导入 ${state.board.cards.length} 张卡片。`);
  } catch (error) {
    showMessage(`导入失败：${error.message}`, true);
  }
});
document.getElementById('export-ics').addEventListener('click', () => {
  if (!scheduleItems(state.board.cards).length) { showMessage('还没有截止日期或下一步事项，日历是空的。', true); return; }
  download(`秋招投递日程-${localToday()}.ics`, buildIcs(state.board.cards, new Date().toISOString()), 'text/calendar');
});
document.getElementById('check-update').addEventListener('click', async () => {
  showMessage('正在检查更新…');
  try {
    const result = await api('/api/check-update');
    showMessage(result.hasUpdate
      ? `有新版本 v${result.latest}（当前 v${result.current}）。请到秋招信库下载新版压缩包：${result.downloadUrl}。升级时保留旧文件夹里的 data 文件夹，复制到新文件夹即可。`
      : `已是最新版本 v${result.current}。`);
  } catch (error) {
    showMessage(`检查更新失败：${error.message}`, true);
  }
});

// —— 启动 ——
(async () => {
  try {
    [state.board, state.info] = await Promise.all([api('/api/board'), api('/api/info')]);
    document.getElementById('version-line').textContent = `本地看板 v${state.info.version} · 数据文件 data/board.json · 端口 ${state.info.port}`;
  } catch (error) {
    showMessage(`无法连接本地服务：${error.message}。请确认启动窗口没有关闭。`, true);
  }
  render();
  await importFromHash();
})();
window.addEventListener('hashchange', importFromHash);
