// 本地服务的请求处理：静态页面 + 少量 JSON 接口。只用 Node 内置模块。
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { refreshSnapshots } from '../public/board-core.js';
import { healthPayload } from './health.mjs';
import { checkRequest } from './security.mjs';

const MAX_BODY = 5 * 1024 * 1024;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon' };
// 页面只加载自己的脚本和样式；不允许被其他网站嵌入
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

export function localToday(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const pb = String(b).split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(pa.length, pb.length); index += 1) {
    if ((pa[index] || 0) !== (pb[index] || 0)) return (pa[index] || 0) - (pb[index] || 0);
  }
  return 0;
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('提交的数据过大'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); } catch { reject(Object.assign(new Error('提交的内容不是有效的 JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`读取 ${url} 失败：HTTP ${response.status}`);
  return response.json();
}

/** getPort 返回实际监听的端口（测试时监听 0 号端口，由系统分配）。 */
export function createHandler({ getPort, store, publicDir, config, version, fetchImpl = fetch, today = localToday }) {
  const siteUrl = config.siteUrl.replace(/\/+$/, '');

  async function api(req, res, path) {
    if (req.method === 'GET' && path === '/api/health') return send(res, 200, healthPayload(version));
    if (req.method === 'GET' && path === '/api/board') return send(res, 200, store.load());
    if (req.method === 'PUT' && path === '/api/board') return send(res, 200, store.save(await readBody(req)));
    if (req.method === 'GET' && path === '/api/info') {
      return send(res, 200, { version, port: getPort(), siteUrl, downloadUrl: `${siteUrl}/downloads/local-board.zip`, llmEnabled: Boolean(config.llm?.provider && config.llm?.apiKey) });
    }
    if (req.method === 'POST' && path === '/api/refresh') {
      await readBody(req);
      const data = await fetchJson(fetchImpl, `${siteUrl}/jobs.json`);
      if (!Array.isArray(data?.jobs)) throw new Error('秋招信库返回的岗位数据格式不正确');
      const result = refreshSnapshots(store.load(), data.jobs, today());
      return send(res, 200, { board: store.save(result.board), updated: result.updated, removed: result.removed });
    }
    if (req.method === 'GET' && path === '/api/check-update') {
      const latest = await fetchJson(fetchImpl, `${siteUrl}/downloads/local-board-version.json`);
      const latestVersion = typeof latest?.version === 'string' ? latest.version.slice(0, 20) : '';
      return send(res, 200, { current: version, latest: latestVersion, hasUpdate: Boolean(latestVersion) && compareVersions(latestVersion, version) > 0, downloadUrl: `${siteUrl}/downloads/local-board.zip` });
    }
    return send(res, 404, { error: '没有这个接口' });
  }

  async function staticFile(req, res, path) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: '不支持的请求方式' });
    const relative = path === '/' ? 'index.html' : decodeURIComponent(path).replace(/^\/+/, '');
    const file = normalize(join(publicDir, relative));
    if (!file.startsWith(normalize(publicDir) + sep)) return send(res, 404, '没有这个页面', 'text/plain; charset=utf-8');
    try {
      const body = await readFile(file);
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      send(res, 404, '没有这个页面', 'text/plain; charset=utf-8');
    }
  }

  return async function handle(req, res) {
    const rejected = checkRequest(req, getPort());
    if (rejected) return send(res, rejected[0], { error: rejected[1] });
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    try {
      if (path.startsWith('/api/')) await api(req, res, path);
      else await staticFile(req, res, path);
    } catch (error) {
      if (!res.headersSent) send(res, error.status || 500, { error: error.message || '本地服务出错' });
    }
  };
}
