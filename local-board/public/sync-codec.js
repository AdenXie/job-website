// 网站 → 本地看板的同步编码。数据放在看板地址的 # 后面，浏览器不会把它发给任何服务器。
// 格式：“<版本>.<编码>.<数据>”
//   v1.j.<base64url(JSON)>                       未压缩
//   v1.z.<base64url(deflate-raw(JSON))>          压缩（CompressionStream）
// JSON 内容：{ "v": 1, "jobs": [ { id, company, title, program, cities, cohort, deadline, applyUrl, announcementUrl } ] }
// 主站和看板页面都引用这个文件，测试也直接引用；在浏览器和 Node 18+ 中都能运行。

export const SYNC_VERSION = 1;
export const SNAPSHOT_KEYS = ['id', 'company', 'title', 'program', 'cities', 'cohort', 'deadline', 'applyUrl', 'announcementUrl'];
// 未压缩超过这个长度就压缩；压缩后仍超过上限时报错，避免浏览器截断地址
export const COMPRESS_THRESHOLD = 2000;
export const MAX_ENCODED_LENGTH = 60000;
const MAX_DECODED_BYTES = 2 * 1024 * 1024;
const MAX_JOBS = 2000;

function toBase64Url(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('同步数据包含无效字符');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function transform(bytes, stream) {
  const chunks = [];
  let total = 0;
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_DECODED_BYTES) { await reader.cancel(); throw new Error('同步数据过大'); }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

/** 从网站岗位记录里只挑出快照字段。 */
export function pickSnapshot(job) {
  return Object.fromEntries(SNAPSHOT_KEYS.map((key) => [key, key === 'cities' ? (Array.isArray(job.cities) ? job.cities : []) : (job[key] ?? '')]));
}

/** 岗位列表 → 同步字符串。超过上限时抛出错误，由调用方提示用户。 */
export async function encodeSync(jobs) {
  const json = JSON.stringify({ v: SYNC_VERSION, jobs: jobs.map(pickSnapshot) });
  const bytes = new TextEncoder().encode(json);
  let encoded = `v${SYNC_VERSION}.j.${toBase64Url(bytes)}`;
  if (encoded.length > COMPRESS_THRESHOLD && typeof CompressionStream === 'function') {
    encoded = `v${SYNC_VERSION}.z.${toBase64Url(await transform(bytes, new CompressionStream('deflate-raw')))}`;
  }
  if (encoded.length > MAX_ENCODED_LENGTH) throw new Error(`收藏太多，同步地址过长（${encoded.length} 字符）。请分批取消一部分收藏后再同步。`);
  return encoded;
}

/** 同步字符串 → 原始岗位对象数组（尚未逐条校验，调用方再用 sanitizeJob 清洗）。格式不对时抛出错误。 */
export async function decodeSync(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_ENCODED_LENGTH) throw new Error('同步数据为空或过长');
  const match = value.match(/^v(\d+)\.([jz])\.([A-Za-z0-9_-]+)$/);
  if (!match) throw new Error('同步数据格式不正确');
  if (Number(match[1]) !== SYNC_VERSION) throw new Error(`同步数据版本 v${match[1]} 不受支持，请升级本地看板`);
  let bytes = fromBase64Url(match[3]);
  if (match[2] === 'z') {
    if (typeof DecompressionStream !== 'function') throw new Error('当前浏览器不支持解压同步数据，请更换新版浏览器');
    bytes = await transform(bytes, new DecompressionStream('deflate-raw'));
  }
  if (bytes.length > MAX_DECODED_BYTES) throw new Error('同步数据过大');
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('同步数据无法解析'); }
  if (!data || data.v !== SYNC_VERSION || !Array.isArray(data.jobs)) throw new Error('同步数据内容不正确');
  if (data.jobs.length > MAX_JOBS) throw new Error(`一次最多同步 ${MAX_JOBS} 条岗位`);
  return data.jobs;
}
