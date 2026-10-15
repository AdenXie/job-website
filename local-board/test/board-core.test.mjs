import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIcs, emptyBoard, funnel, mergeImport, previewImport, refreshSnapshots, sanitizeBoard, sanitizeJob, setStatus, urgency, weeklyApplied } from '../public/board-core.js';

const job = (id, extra = {}) => ({ id, company: '某公司', title: '后端开发工程师', program: '', cities: ['上海'], cohort: '2027届', deadline: '2026-10-30', applyUrl: 'https://example.com/a', announcementUrl: '', ...extra });

test('treats imported jobs as untrusted: only http(s) links, bounded text, valid ids', () => {
  const clean = sanitizeJob(job('offer-1', { applyUrl: 'javascript:alert(1)', announcementUrl: 'data:text/html,x', title: 'x'.repeat(1000), cities: ['上海', 1, '上海'], deadline: '2026-13-40' }));
  assert.equal(clean.applyUrl, '');
  assert.equal(clean.announcementUrl, '');
  assert.equal(clean.title.length, 300);
  assert.deepEqual(clean.cities, ['上海']);
  assert.equal(clean.deadline, '');
  assert.equal(sanitizeJob(job('bad id <script>')), null);
  assert.equal(sanitizeJob(job('offer-ext_OTMyMTc=')).id, 'offer-ext_OTMyMTc=');
  assert.equal(sanitizeJob({ id: 'offer-2', company: '', title: '岗位' }), null);
  assert.equal(sanitizeBoard({ cards: [{ job: job('offer-1'), status: 'hacked', notes: 3 }] }).cards[0].status, 'wish');
});

test('merges by id: new jobs go to wish, existing ones only refresh the snapshot', () => {
  let { board, added } = mergeImport(emptyBoard(), [job('offer-1'), job('offer-2')], '2026-10-16');
  assert.equal(added, 2);
  assert.deepEqual(board.cards[0].timeline, [{ status: 'wish', date: '2026-10-16' }]);
  board.cards[0] = { ...setStatus(board.cards[0], 'interview', '2026-10-18'), notes: '二面准备', tags: ['重点'] };
  assert.deepEqual(previewImport(board, [job('offer-1', { deadline: '2026-11-05' }), job('offer-3')]), { added: 1, existing: 1 });
  const result = mergeImport(board, [job('offer-1', { deadline: '2026-11-05', title: '后端开发工程师（更新）' }), job('offer-3')], '2026-10-20');
  const card = result.board.cards.find((item) => item.id === 'offer-1');
  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
  assert.equal(card.status, 'interview');
  assert.equal(card.notes, '二面准备');
  assert.deepEqual(card.tags, ['重点']);
  assert.equal(card.job.deadline, '2026-11-05');
  assert.equal(card.job.title, '后端开发工程师（更新）');
  assert.equal(result.board.cards.length, 3);
});

test('marks jobs missing from the site as removed instead of deleting them', () => {
  const { board } = mergeImport(emptyBoard(), [job('offer-1'), job('offer-2')], '2026-10-16');
  const result = refreshSnapshots(board, [job('offer-1', { deadline: '2026-11-01' })], '2026-10-17');
  assert.equal(result.board.cards.length, 2);
  assert.equal(result.board.cards.find((card) => card.id === 'offer-2').removed, true);
  assert.equal(result.board.cards.find((card) => card.id === 'offer-1').job.deadline, '2026-11-01');
  assert.deepEqual([result.updated, result.removed], [1, 1]);
});

test('computes the funnel from the furthest stage reached and weekly applications', () => {
  let { board } = mergeImport(emptyBoard(), ['a', 'b', 'c', 'd'].map((id) => job(`offer-${id}`)), '2026-10-01');
  const [a, b, c, d] = board.cards;
  const cards = [
    setStatus(setStatus(a, 'applied', '2026-10-06'), 'interview', '2026-10-10'),
    setStatus(setStatus(b, 'applied', '2026-10-13'), 'rejected', '2026-10-14'),
    setStatus(c, 'applied', '2026-10-14'),
    d,
  ];
  assert.deepEqual(funnel(cards).map((stage) => [stage.id, stage.count, stage.rate]), [
    ['wish', 4, null], ['applied', 3, 0.75], ['assessment', 1, 1 / 3], ['interview', 1, 1], ['offer', 0, 0],
  ]);
  const weeks = weeklyApplied(cards, '2026-10-16', 3);
  assert.deepEqual(weeks, [{ start: '2026-09-28', count: 0 }, { start: '2026-10-05', count: 1 }, { start: '2026-10-12', count: 2 }]);
});

test('highlights deadlines within 3 days and next steps within 24 hours', () => {
  const card = sanitizeBoard({ cards: [{ job: job('offer-1', { deadline: '2026-10-19' }), status: 'applied', next: { text: '二面', at: '2026-10-17T14:00' } }] }).cards[0];
  assert.equal(urgency(card, '2026-10-16T09:00').type, 'deadline');
  assert.equal(urgency({ ...card, job: { ...card.job, deadline: '2026-10-25' } }, '2026-10-16T15:00').type, 'next');
  assert.equal(urgency({ ...card, job: { ...card.job, deadline: '2026-10-25' } }, '2026-10-16T09:00'), null);
  assert.equal(urgency({ ...card, status: 'rejected' }, '2026-10-16T09:00'), null);
});

test('builds an RFC 5545 calendar with escaping, all-day deadlines and timed steps', () => {
  const card = sanitizeBoard({ cards: [{ job: job('offer-1', { company: '某公司;北京,分部', deadline: '2026-10-30' }), status: 'applied', next: { text: '二面', at: '2026-10-28T14:00' } }] }).cards[0];
  const ics = buildIcs([card], '2026-10-16T08:00:00.000Z');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.match(ics, /DTSTART;VALUE=DATE:20261030\r\nDTEND;VALUE=DATE:20261031/);
  assert.match(ics, /DTSTART:20261028T140000\r\nDTEND:20261028T150000/);
  assert.match(ics, /SUMMARY:截止：某公司\\;北京\\,分部/);
  assert.match(ics, /DTSTAMP:20261016T080000Z/);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  const long = sanitizeBoard({ cards: [{ job: job('offer-2', { title: '很长的岗位名称'.repeat(20) }), status: 'wish' }] }).cards;
  assert.match(buildIcs(long, '2026-10-16T08:00:00.000Z'), /\r\n /);
});
