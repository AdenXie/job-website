// 看板数据文件：data/board.json。写入时先写临时文件再改名，避免写到一半断电或崩溃把文件写坏；
// 每天第一次写入前把当前文件复制一份到 data/backups/，只保留最近 7 份。
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyBoard, sanitizeBoard } from '../public/board-core.js';

export const BACKUP_DAYS = 7;

export function atomicWriteJson(file, data) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  try {
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

// 备份按本机日期命名，与看板时间线的日期一致
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function createStore(dataDir, { today = () => localDate() } = {}) {
  const file = join(dataDir, 'board.json');
  const backupDir = join(dataDir, 'backups');

  function load() {
    if (!existsSync(file)) return emptyBoard();
    const board = sanitizeBoard(JSON.parse(readFileSync(file, 'utf8')));
    if (!board) throw new Error('data/board.json 内容无法识别，请从 data/backups 里恢复备份');
    return board;
  }

  function backup() {
    if (!existsSync(file)) return;
    mkdirSync(backupDir, { recursive: true });
    const target = join(backupDir, `board-${today()}.json`);
    if (!existsSync(target)) copyFileSync(file, target);
    const backups = readdirSync(backupDir).filter((name) => /^board-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
    for (const name of backups.slice(0, Math.max(0, backups.length - BACKUP_DAYS))) rmSync(join(backupDir, name), { force: true });
  }

  function save(raw) {
    const board = sanitizeBoard(raw);
    if (!board) throw new Error('看板数据格式不正确');
    mkdirSync(dataDir, { recursive: true });
    backup();
    atomicWriteJson(file, board);
    return board;
  }

  return { file, backupDir, load, save };
}
