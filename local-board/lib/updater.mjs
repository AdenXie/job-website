// 在看板页面里一键更新。流程：
// 1. 读取网站上的 local-board-version.json，下载 local-board.zip，核对大小和 SHA-256；
// 2. 解压到内存，检查每个路径（只能落在看板文件夹内），确认包里的版本号和公布的一致；
// 3. 先完整写到 .update-staging/，再把当前程序文件备份到 update-backups/v旧版本-时间/；
// 4. 逐个用改名替换程序文件。任何一步失败都从备份恢复。
// data/（看板数据和每日备份）、config.json、update-backups/ 永远不会被改动或删除。
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { readZip } from './unzip.mjs';

export const PRESERVED = new Set(['data', 'config.json', 'update-backups', '.update-staging', 'node_modules', '.git']);
export const KEEP_BACKUPS = 3;
const MAX_ZIP = 20 * 1024 * 1024;
const REQUIRED = ['version.json', 'server.mjs', 'lib/app.mjs', 'public/index.html'];
const EXECUTABLE = /\.(sh|command)$/;

export function compareVersions(a, b) {
  const pa = String(a).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const pb = String(b).split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(pa.length, pb.length); index += 1) {
    if ((pa[index] || 0) !== (pb[index] || 0)) return (pa[index] || 0) - (pb[index] || 0);
  }
  return 0;
}

/** 压缩包里的路径必须是 local-board/ 下的普通相对路径；返回去掉前缀后的路径，不安全时返回 null。 */
export function safeEntryPath(name) {
  if (typeof name !== 'string' || !name.startsWith('local-board/')) return null;
  const path = name.slice('local-board/'.length);
  if (!path || path.includes('\\') || path.includes(':') || path.startsWith('/')) return null;
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return path;
}

const isPreserved = (path) => PRESERVED.has(path.split('/')[0]);

async function fetchOk(fetchImpl, url, accept) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(60000), headers: { Accept: accept }, cache: 'no-store' });
  if (!response.ok) throw new Error(`读取 ${url} 失败：HTTP ${response.status}`);
  return response;
}

/** 下载并校验更新包，返回 { version, files: [{ path, data }] }。不写任何文件。 */
export async function downloadUpdate({ siteUrl, currentVersion, fetchImpl = fetch }) {
  const base = siteUrl.replace(/\/+$/, '');
  const info = await (await fetchOk(fetchImpl, `${base}/downloads/local-board-version.json`, 'application/json')).json();
  const version = typeof info?.version === 'string' ? info.version : '';
  if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)) throw new Error('网站上的版本信息格式不正确');
  if (!/^[0-9a-f]{64}$/.test(info.sha256 || '') || !Number.isInteger(info.size) || info.size <= 0 || info.size > MAX_ZIP) throw new Error('网站上的更新包信息不完整');
  if (compareVersions(version, currentVersion) <= 0) throw new Error(`已是最新版本 v${currentVersion}`);

  const zip = Buffer.from(await (await fetchOk(fetchImpl, `${base}/downloads/local-board.zip`, 'application/zip')).arrayBuffer());
  // 网站正在部署时，版本信息和压缩包可能暂时对不上，校验失败就不安装
  if (zip.length !== info.size || createHash('sha256').update(zip).digest('hex') !== info.sha256) {
    throw new Error('下载的更新包没有通过完整性校验（网站可能正在更新），请过几分钟再试');
  }
  const files = [];
  for (const entry of readZip(zip)) {
    const path = safeEntryPath(entry.name);
    if (!path) throw new Error(`更新包里有不安全的路径：${entry.name}`);
    files.push({ path, data: entry.data });
  }
  for (const name of REQUIRED) if (!files.some((file) => file.path === name)) throw new Error(`更新包缺少 ${name}`);
  const packaged = JSON.parse(files.find((file) => file.path === 'version.json').data.toString('utf8')).version;
  if (packaged !== version) throw new Error('更新包里的版本号和网站公布的不一致');
  return { version, files };
}

/** 列出看板文件夹里的程序文件（相对路径），不含 data/、config.json 等保留项。 */
export function listProgramFiles(root, dir = root) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const name = relative(root, path).split(sep).join('/');
    if (isPreserved(name)) continue;
    if (entry.isDirectory()) files.push(...listProgramFiles(root, path));
    else if (entry.isFile()) files.push(name);
  }
  return files.sort();
}

function copyTree(fromRoot, toRoot, names) {
  for (const name of names) {
    const target = join(toRoot, ...name.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(fromRoot, ...name.split('/')), target);
  }
}

/** 把备份里的程序文件复制回看板文件夹。 */
export function restoreBackup(root, backupDir) {
  copyTree(backupDir, root, listProgramFiles(backupDir));
}

// 备份文件夹按本机时间命名，方便用户辨认
const pad = (value) => String(value).padStart(2, '0');
const stamp = (date) => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;

/** 安装已校验的更新，返回 { backupDir }。失败时恢复原状并抛出错误。 */
export function applyUpdate(root, { files }, { fromVersion, now = new Date() }) {
  const install = files.filter((file) => !isPreserved(file.path) || (file.path === 'config.json' && !existsSync(join(root, 'config.json'))));
  const staging = join(root, '.update-staging');
  rmSync(staging, { recursive: true, force: true });
  for (const file of install) {
    const target = join(staging, ...file.path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.data);
    if (EXECUTABLE.test(file.path)) chmodSync(target, 0o755);
  }

  const backupRoot = join(root, 'update-backups');
  const backupDir = join(backupRoot, `v${fromVersion}-${stamp(now)}`);
  copyTree(root, backupDir, listProgramFiles(root));
  try {
    // 改名替换：正在运行的启动脚本（macOS/Linux）仍读旧文件，不会读到一半被换掉
    for (const file of install) {
      const target = join(root, ...file.path.split('/'));
      mkdirSync(dirname(target), { recursive: true });
      renameSync(join(staging, ...file.path.split('/')), target);
    }
  } catch (error) {
    restoreBackup(root, backupDir);
    throw new Error(`替换文件失败，已恢复原来的版本：${error.message}`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  const old = readdirSync(backupRoot).filter((name) => /^v[\d.]+-\d{14}$/.test(name)).sort((a, b) => a.slice(-14).localeCompare(b.slice(-14)));
  for (const name of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) rmSync(join(backupRoot, name), { recursive: true, force: true });
  return { backupDir };
}

export function readVersion(root) {
  return JSON.parse(readFileSync(join(root, 'version.json'), 'utf8')).version;
}
