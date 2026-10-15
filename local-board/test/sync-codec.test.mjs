import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPRESS_THRESHOLD, decodeSync, encodeSync, pickSnapshot } from '../public/sync-codec.js';

const job = (index) => ({ id: `offer-${index}`, company: `公司${index}`, title: '后端开发工程师', program: '2027届校园招聘', cities: ['上海', '北京'], cohort: '2027届', deadline: '2026-10-30', applyUrl: 'https://example.com/apply', announcementUrl: null, industry: '不应同步', family: '后端开发' });

test('round-trips a small sync payload without compression and keeps only snapshot fields', async () => {
  const encoded = await encodeSync([job(1)]);
  assert.match(encoded, /^v1\.j\./);
  const [decoded] = await decodeSync(encoded);
  assert.deepEqual(decoded, pickSnapshot(job(1)));
  assert.equal('industry' in decoded, false);
  assert.equal(decoded.announcementUrl, '');
});

test('compresses large payloads and decodes them back', async () => {
  const jobs = Array.from({ length: 120 }, (_, index) => job(index));
  const encoded = await encodeSync(jobs);
  assert.match(encoded, /^v1\.z\./);
  const plainLength = Buffer.from(JSON.stringify({ v: 1, jobs: jobs.map(pickSnapshot) })).toString('base64url').length;
  assert.ok(plainLength > COMPRESS_THRESHOLD && encoded.length < plainLength / 3);
  assert.equal((await decodeSync(encoded)).length, 120);
});

test('rejects unknown versions, malformed strings and wrong content', async () => {
  const encoded = await encodeSync([job(1)]);
  await assert.rejects(decodeSync(encoded.replace(/^v1/, 'v2')), /版本 v2/);
  await assert.rejects(decodeSync('hello'), /格式不正确/);
  await assert.rejects(decodeSync('v1.j.<script>'), /格式不正确/);
  await assert.rejects(decodeSync(`v1.j.${Buffer.from('not json').toString('base64url')}`), /无法解析/);
  await assert.rejects(decodeSync(`v1.j.${Buffer.from(JSON.stringify({ v: 1, jobs: 'x' })).toString('base64url')}`), /内容不正确/);
  await assert.rejects(decodeSync(`v1.z.${Buffer.from('not deflate').toString('base64url')}`));
  await assert.rejects(decodeSync(''), /为空或过长/);
});
