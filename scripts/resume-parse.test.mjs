import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResume } from '../src/resume/parse-resume.mjs';

const line = (text, x = 50, size = 10, right = 300) => ({ text, x, right, size, page: 1 });

test('parseResume splits a PDF resume into basics, entries and text sections', () => {
  const result = parseResume([
    line('张 伟', 250, 22),
    line('电话：139-1234-5678 | 邮箱：zhang@example.com | 现居：杭州 | 中共党员'),
    line('工作经历', 50, 12),
    line('某电商公司 | 数据分析实习生 | 2025年3月 - 2025年8月', 50, 10, 540),
    line('• 负责大促活动效果复盘，输出周报 12 份，其中 3 项建议被业', 62, 10, 540),
    line('务方采纳', 62),
    line('技能证书', 50, 12),
    line('• 证书：CET-6'),
  ]);
  assert.deepEqual({ ...result.basics, photo: undefined }, { name: '张伟', title: '', phone: '139-1234-5678', email: 'zhang@example.com', city: '杭州', link: '', photo: undefined });
  assert.deepEqual(result.sections, [
    { kind: 'entries', title: '工作经历', items: [{ name: '某电商公司', role: '数据分析实习生', date: '2025年3月 - 2025年8月', desc: '负责大促活动效果复盘，输出周报 12 份，其中 3 项建议被业务方采纳' }] },
    { kind: 'text', title: '技能证书', body: '证书：CET-6' },
    { kind: 'text', title: '其他内容', body: '中共党员' },
  ]);
});

test('parseResume keeps everything when no section heading is recognised', () => {
  const result = parseResume([line('一段没有任何标题的文字'), line('第二行内容也没有标题')]);
  assert.equal(result.sections.length, 1);
  assert.equal(result.sections[0].title, '其他内容');
  assert.equal(result.sections[0].body, '一段没有任何标题的文字\n第二行内容也没有标题');
});
