// 端口被占用时，先确认占用者是不是已经在运行的本地看板（用户重复双击启动脚本是最常见的情况）。
import { request } from 'node:http';

export const APP_ID = 'qiuzhao-local-board';

export function healthPayload(version) {
  return { app: APP_ID, version, status: 'ok' };
}

/** 请求 http://127.0.0.1:端口/api/health，确认是本地看板时返回它的版本号，否则返回 null。 */
export function probeBoard(port, timeout = 2000) {
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port, path: '/api/health', method: 'GET', headers: { host: `127.0.0.1:${port}` }, timeout }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => { chunks.push(chunk); if (Buffer.concat(chunks).length > 4096) req.destroy(); });
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(res.statusCode === 200 && data?.app === APP_ID ? String(data.version || '') : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.end();
  });
}
