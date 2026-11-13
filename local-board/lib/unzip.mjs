// 读取 zip 文件（只用 Node 内置的 zlib）。只支持看板更新包用到的格式：不加密、存储或 deflate 压缩、非 zip64。
// 读取时校验 CRC32，并限制条目数和解压后的总大小，防止损坏或恶意的压缩包占满内存。
import { inflateRawSync } from 'node:zlib';

const MAX_ENTRIES = 1000;
const MAX_TOTAL = 50 * 1024 * 1024;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const fail = (message) => { throw new Error(`更新包格式不正确：${message}`); };

/** 返回 [{ name, data }]；目录条目会被跳过。 */
export function readZip(buffer) {
  const buf = Buffer.from(buffer);
  // 中央目录结尾记录在文件末尾 22 字节到 22+65535 字节之间
  let end = -1;
  for (let at = buf.length - 22; at >= Math.max(0, buf.length - 22 - 65535); at -= 1) {
    if (buf.readUInt32LE(at) === 0x06054b50) { end = at; break; }
  }
  if (end < 0) fail('找不到目录');
  const count = buf.readUInt16LE(end + 10);
  const dirSize = buf.readUInt32LE(end + 12);
  let at = buf.readUInt32LE(end + 16);
  if (count > MAX_ENTRIES) fail('文件太多');
  if (at + dirSize > end) fail('目录越界');

  const entries = [];
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (buf.readUInt32LE(at) !== 0x02014b50) fail('目录记录损坏');
    const flags = buf.readUInt16LE(at + 8);
    const method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16);
    const compressedSize = buf.readUInt32LE(at + 20);
    const size = buf.readUInt32LE(at + 24);
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const commentLength = buf.readUInt16LE(at + 32);
    const localOffset = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    at += 46 + nameLength + extraLength + commentLength;

    if (flags & 1) fail(`${name} 已加密`);
    if (name.endsWith('/')) continue;
    total += size;
    if (total > MAX_TOTAL) fail('解压后过大');
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) fail(`${name} 的文件头损坏`);
    const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const raw = buf.subarray(start, start + compressedSize);
    if (raw.length !== compressedSize) fail(`${name} 不完整`);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw, { maxOutputLength: Math.max(1, size) });
    else fail(`${name} 使用了不支持的压缩方式`);
    if (data.length !== size || crc32(data) !== crc) fail(`${name} 校验失败`);
    entries.push({ name, data });
  }
  return entries;
}
