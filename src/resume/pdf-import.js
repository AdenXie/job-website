import { buildLines, parseResume } from './parse-resume.mjs';

/** 在浏览器本地打开 PDF，返回加载任务。解析库体积较大，用到时才加载。 */
async function openPdf(file) {
  // legacy 版本自带兼容代码，旧一些的浏览器也能用
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  return pdfjs.getDocument({
    data: await file.arrayBuffer(),
    // 部分中文 PDF 没有内嵌字符映射表，需要时从 CDN 按需取；简历内容本身不会离开浏览器
    cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
  });
}

/** 读取 PDF 简历并拆成各模块；扫描件等没有文字层的 PDF 返回 null。 */
export async function importPdf(file) {
  const task = await openPdf(file);
  const pdf = await task.promise;
  const lines = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    lines.push(...buildLines(content.items, pageNumber));
  }
  void task.destroy();
  const result = parseResume(lines);
  return result.stats.chars >= 20 ? result : null;
}
