// 秋招信库 · 本地投递看板的本地服务。用法：node server.mjs [--open]
// 只用 Node.js 内置模块，不需要 npm install。数据保存在同目录的 data/ 文件夹。
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from './lib/app.mjs';
import { probeBoard } from './lib/health.mjs';
import { createStore } from './lib/store.mjs';
import { restoreBackup } from './lib/updater.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const fail = (message) => { console.error(`\n[错误] ${message}\n`); process.exit(1); };

const [major] = process.versions.node.split('.').map(Number);
if (major < 18) fail(`当前 Node.js 版本是 ${process.versions.node}，本地看板需要 18 或更高版本。请到 https://nodejs.org/zh-cn/download 下载安装。`);

let config;
try {
  config = JSON.parse(readFileSync(join(root, 'config.json'), 'utf8'));
} catch {
  fail('无法读取 config.json，请确认文件存在且内容是有效的 JSON。');
}
const port = Number(config.port);
if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('config.json 里的 port 必须是 1024–65535 之间的整数。');
if (typeof config.siteUrl !== 'string' || !/^https?:\/\//.test(config.siteUrl)) fail('config.json 里的 siteUrl 必须是 http 或 https 地址。');
const { version } = JSON.parse(readFileSync(join(root, 'version.json'), 'utf8'));

const store = createStore(join(root, 'data'));
try {
  store.load();
} catch (error) {
  fail(error.message);
}

// 页面里一键更新后由这里接力：旧进程关闭端口，启动新版本的 server.mjs，自己留在后台等它退出。
// 新进程和旧进程共用同一个命令行窗口；关闭窗口或按 Ctrl+C 时两者一起停止。
let supervising = false;
function runUpdated(rollbackDir) {
  const startedAt = Date.now();
  const child = spawn(process.execPath, [join(root, 'server.mjs')], { cwd: root, stdio: 'inherit', env: { ...process.env, QIUZHAO_BOARD_RESTARTED: '1' } });
  child.on('error', (error) => fail(`无法启动新版本：${error.message}`));
  child.on('exit', (code, signal) => {
    // 新版本很快就异常退出：恢复更新前的程序文件，再启动一次
    if (rollbackDir && code !== 0 && code !== null && Date.now() - startedAt < 20000) {
      console.error('\n[错误] 新版本启动失败，正在恢复更新前的版本…');
      try { restoreBackup(root, rollbackDir); } catch (error) { fail(`恢复失败：${error.message}。备份在 ${rollbackDir}`); }
      runUpdated(null);
      return;
    }
    process.exit(code ?? (signal ? 0 : 1));
  });
}
function onUpdated({ from, to, backupDir }) {
  console.log(`\n已更新：v${from} → v${to}。更新前的程序备份在 ${backupDir}`);
  console.log('正在重启本地看板…');
  supervising = true;
  server.close(() => runUpdated(backupDir));
  server.closeAllConnections?.();
}

const server = createServer(createHandler({ getPort: () => port, store, publicDir: join(root, 'public'), config, version, appDir: root, onUpdated }));
const url = `http://127.0.0.1:${port}/`;
// 已经有一个看板在运行：启动脚本据此直接关闭窗口，不当成错误
const EXIT_ALREADY_RUNNING = 3;

function openBrowser() {
  if (!process.argv.includes('--open')) return;
  const [command, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(command, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); } catch { /* 打不开浏览器时用户可手动访问 */ }
}

server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE' && process.env.QIUZHAO_BOARD_RESTARTED && listenAttempts < 20) {
    // 更新后的重启：旧进程的端口可能还没完全释放，稍等重试
    setTimeout(listen, 250);
    return;
  }
  if (error.code === 'EADDRINUSE') {
    // 最常见的情况是重复双击了启动脚本：占用端口的就是看板自己，直接打开浏览器即可
    const running = await probeBoard(port);
    if (running !== null) {
      console.log(`本地看板已经在运行（v${running || '未知版本'}），已为你打开 ${url}`);
      console.log('不需要重复启动；这个窗口可以关闭，原来的看板窗口请保持打开。');
      openBrowser();
      setTimeout(() => process.exit(EXIT_ALREADY_RUNNING), 300);
      return;
    }
    fail(`端口 ${port} 已被其他程序占用。\n请关闭占用该端口的程序后重试；或修改 config.json 里的 port（注意：秋招信库网站上的“同步到本地看板”按钮固定使用 47321 端口，换端口后只能用“导入 JSON”导入）。`);
  }
  fail(`本地服务启动失败：${error.message}`);
});

// 关闭命令行窗口（Windows 上 Node 收到 SIGHUP）或按 Ctrl+C 时正常停止服务。
// 每次修改都已立即写入 data/board.json（原子写入），停止时没有待保存的内容。
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(signal, () => {
    // 已经交给新版本进程：它会收到同样的信号并自行停止，这里等它退出
    if (supervising) return;
    console.log('\n正在停止本地看板，数据已保存。');
    server.close();
    process.exit(0);
  });
}

// 只监听本机地址，局域网里的其他设备无法访问
let listenAttempts = 0;
function listen() {
  listenAttempts += 1;
  server.listen(port, '127.0.0.1');
}
server.on('listening', () => {
  console.log(`秋招信库 · 本地投递看板 v${version} 已启动：${url}`);
  console.log(`数据文件：${store.file}`);
  console.log('关闭这个窗口（或按 Ctrl+C）即可停止服务，数据会自动保存。');
  // 更新后的重启不再打开新的浏览器标签，原来的页面会自动刷新
  if (!process.env.QIUZHAO_BOARD_RESTARTED) openBrowser();
});
listen();
