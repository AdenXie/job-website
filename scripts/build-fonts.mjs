// 生成标题字体子集：只包含标题、站名等固定文字用到的字，供主站（public/fonts）和本地看板（local-board/public/fonts）使用。
// 字体来自 @fontsource/noto-serif-sc 的 900 字重（按 unicode-range 切成约 100 块），先找出用到的块，再用 fontTools 裁到只剩用到的字。
// 需要 Python 和 fontTools（pip install fonttools brotli）。改了标题文字后运行：node scripts/build-fonts.mjs，并提交生成的文件。
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = join(root, 'node_modules', '@fontsource', 'noto-serif-sc');

// 用标题字体显示的全部固定文字。动态内容（岗位名、用户改过的标题）不用这款字体
const SITE_TEXT = [
  '秋招信库', '找到适合你的下一站', '全部岗位', '即将截止', '我的收藏', '岗位数据暂时无法加载', '还没有收藏的岗位', '没有找到匹配的岗位',
  '求职画像', '本地投递看板', '简历生成器', '模板与排版', '基本信息',
  '数据洞察', '今年秋招的岗位，都在哪里', '岗位最多的城市', '省份分布', '行业分布', '岗位族分布', '未来 8 周的截止日期', '届别分布', '记录最多的公司',
];
const BOARD_TEXT = [
  '秋', '本地投递看板', '还没有岗位', '想投', '已投递', '测评/笔试', '面试中', 'Offer', '已结束', '投递漏斗', '每周投递数量', '日程', '投递进度',
];

const chunks = [...readFileSync(join(pkg, '900.css'), 'utf8').matchAll(/url\(\.\/files\/([^)]+\.woff2)\)[^;]*;\s*unicode-range:\s*([^;]+);/g)]
  .map(([, file, ranges]) => ({ file, ranges: ranges.split(',').map((range) => range.trim().replace(/^U\+/i, '').split('-').map((hex) => parseInt(hex, 16))) }));
const chunkOf = (code) => chunks.find((chunk) => chunk.ranges.some(([from, to = from]) => code >= from && code <= to));

function build(texts, outDir, cssPath, urlPrefix) {
  const chars = [...new Set([...texts.join('')])].filter((char) => char.trim());
  const groups = new Map();
  for (const char of chars) {
    const chunk = chunkOf(char.codePointAt(0));
    if (!chunk) throw new Error(`字体里没有“${char}”`);
    if (!groups.has(chunk.file)) groups.set(chunk.file, []);
    groups.get(chunk.file).push(char);
  }
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const faces = [];
  [...groups.entries()].forEach(([file, list], index) => {
    const name = `head-${index + 1}.woff2`;
    const unicodes = list.map((char) => `U+${char.codePointAt(0).toString(16)}`).join(',');
    execFileSync('python', ['-m', 'fontTools.subset', join(pkg, 'files', file), `--unicodes=${unicodes}`, '--flavor=woff2', '--layout-features=*', `--output-file=${join(outDir, name)}`]);
    faces.push(`@font-face { font-family: "Qiuzhao Head"; font-style: normal; font-weight: 900; font-display: swap; src: url("${urlPrefix}${name}") format("woff2"); unicode-range: ${unicodes}; }`);
  });
  // SIL OFL 要求字体随附许可证全文
  writeFileSync(join(outDir, 'OFL.txt'), readFileSync(join(pkg, 'LICENSE')));
  writeFileSync(cssPath, `/* 标题字体子集（思源宋体 Noto Serif SC 900，SIL OFL 1.1）。由 scripts/build-fonts.mjs 生成，不要手改 */\n${faces.join('\n')}\n`);
  console.log(`${cssPath}：${chars.length} 个字，${faces.length} 个文件`);
}

build(SITE_TEXT, join(root, 'public', 'fonts'), join(root, 'src', 'fonts.css'), '/fonts/');
build(BOARD_TEXT, join(root, 'local-board', 'public', 'fonts'), join(root, 'local-board', 'public', 'fonts.css'), 'fonts/');
