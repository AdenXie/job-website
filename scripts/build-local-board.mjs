// 主站构建后运行（npm 的 postbuild）：把 local-board/ 打包成 dist/downloads/local-board.zip，
// 并生成 dist/downloads/local-board-version.json（版本号、生成时间、zip 的 SHA-256）。
// 排除用户数据 data/ 和测试文件；统一换行符（.bat 用 CRLF，.sh/.command 用 LF），并给启动脚本加上可执行权限。
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'local-board');
const outDir = join(root, 'dist', 'downloads');
const EXCLUDED_DIRS = new Set(['data', 'test', 'node_modules', '.git']);
const EXCLUDED_FILES = /(^|\/)(\.DS_Store|Thumbs\.db)$|\.test\.m?js$|\.tmp$/;
const TEXT = /\.(bat|sh|command|mjs|js|json|html|css|md|svg|txt)$/;
const EXECUTABLE = /\.(sh|command)$/;

export function listFiles(dir = source) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (!EXCLUDED_DIRS.has(entry.name)) files.push(...listFiles(path)); continue; }
    const name = relative(source, path).split(sep).join('/');
    if (!EXCLUDED_FILES.test(name)) files.push(name);
  }
  return files.sort();
}

function content(name) {
  const bytes = readFileSync(join(source, name));
  if (!TEXT.test(name)) return bytes;
  const text = bytes.toString('utf8').replace(/\r\n/g, '\n');
  return Buffer.from(name.endsWith('.bat') ? text.replace(/\n/g, '\r\n') : text, 'utf8');
}

export function buildZip() {
  const files = {};
  for (const name of listFiles()) {
    // os 3 = Unix，attrs 的高 16 位是文件权限：启动脚本 755，其余 644
    const mode = EXECUTABLE.test(name) ? 0o100755 : 0o100644;
    files[`local-board/${name}`] = [content(name), { os: 3, attrs: (mode << 16) >>> 0, mtime: statSync(join(source, name)).mtime }];
  }
  // AGPL 要求分发时附带许可证全文
  for (const name of ['LICENSE', 'NOTICE']) files[`local-board/${name}`] = [readFileSync(join(root, name)), { os: 3, attrs: (0o100644 << 16) >>> 0 }];
  return zipSync(files, { level: 9 });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { version } = JSON.parse(readFileSync(join(source, 'version.json'), 'utf8'));
  const zip = buildZip();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'local-board.zip'), zip);
  const info = { version, generatedAt: new Date().toISOString(), file: 'local-board.zip', size: zip.length, sha256: createHash('sha256').update(zip).digest('hex') };
  writeFileSync(join(outDir, 'local-board-version.json'), `${JSON.stringify(info, null, 2)}\n`);
  console.log(`已打包本地看板 v${version}：dist/downloads/local-board.zip（${(zip.length / 1024).toFixed(1)} KB，${listFiles().length} 个文件）`);
}
