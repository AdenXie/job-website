import { useState } from 'react';
import { Download, ExternalLink, SquareKanban } from 'lucide-react';
import boardConfig from '../local-board/config.json';
import { encodeSync } from '../local-board/public/sync-codec.js';

const BOARD_URL = `http://127.0.0.1:${boardConfig.port}/`;
const GUIDE_URL = 'https://github.com/AdenXie/job-website/blob/main/local-board/README.md';

/** “我的收藏”里的本地投递看板入口：同步收藏、下载看板。数据放在看板地址的 # 后面，不经过任何服务器。 */
export default function LocalBoardPanel({ jobs }) {
  const [message, setMessage] = useState(null);
  const [fallbackUrl, setFallbackUrl] = useState('');

  const sync = async () => {
    setFallbackUrl('');
    // 先在点击时同步打开新标签页，避免编码耗时后被浏览器当成弹窗拦截
    const tab = window.open('about:blank', '_blank');
    try {
      const url = `${BOARD_URL}#import=${await encodeSync(jobs)}`;
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
        setMessage({ text: `已在新标签页打开本地看板，确认后即可导入 ${jobs.length} 个岗位。如果新标签页打不开，请先启动本地看板。` });
      } else {
        setFallbackUrl(url);
        setMessage({ text: '浏览器拦截了新标签页，请点击下面的链接打开本地看板。' });
      }
    } catch (error) {
      tab?.close();
      setMessage({ warn: true, text: error.message });
    }
  };

  return <section className="local-board-panel" aria-labelledby="local-board-title">
    <div className="local-board-head">
      <SquareKanban size={18} aria-hidden="true" />
      <div>
        <h3 id="local-board-title">本地投递看板</h3>
        <p>把收藏的岗位同步到你电脑上的看板，记录投递进度、笔试面试时间和备注。数据只保存在你的电脑里，需要在电脑上使用。</p>
      </div>
    </div>
    <div className="local-board-actions">
      <button type="button" className="local-board-sync" onClick={sync} disabled={!jobs.length}>同步到本地看板{jobs.length ? `（${jobs.length}）` : ''}</button>
      <a className="local-board-hint" href="#local-board-guide" onClick={() => { document.getElementById('local-board-guide').open = true; }}>需要先下载并启动本地看板</a>
    </div>
    {message && <p className={message.warn ? 'local-board-message warn' : 'local-board-message'} role="status">{message.text}{fallbackUrl && <> <a href={fallbackUrl} target="_blank" rel="noopener noreferrer">打开本地看板</a></>}</p>}
    <details id="local-board-guide" className="local-board-guide">
      <summary>下载与使用说明</summary>
      <ol>
        <li><a href={`${import.meta.env.BASE_URL}downloads/local-board.zip`} download><Download size={14} aria-hidden="true" />下载本地看板（local-board.zip）</a>，解压到任意文件夹。</li>
        <li>Windows 双击 <code>start.bat</code>，macOS 双击 <code>start.command</code>。需要 Node.js 18 或更高版本，没装时启动脚本会打开下载页面。</li>
        <li>看板在浏览器打开后，回到这里点“同步到本地看板”，在看板里确认导入。</li>
      </ol>
      <p>同步是单向的：在网站上取消收藏不会删除看板里的卡片。看板只在本机 {BOARD_URL} 运行，同步的数据放在地址的 # 后面，不会发送到任何服务器。<a href={GUIDE_URL} target="_blank" rel="noopener noreferrer">完整说明<ExternalLink size={12} aria-hidden="true" /></a></p>
    </details>
  </section>;
}
