# 秋招信库

面向中国校招的岗位信息库。电脑端采用左侧筛选与右侧岗位卡片，手机端提供抽屉筛选。支持关键词、城市、行业、届别、批次、截止日期、排序、分页和浏览器本地收藏。

## 本地运行

需要 Node.js 22。运行 `npm ci`、`npm run dev`，打开终端显示的地址。`npm run check:data` 检查数据结构，`npm run build` 生成静态站点。

`public/jobs.json` 当前只有明确标注的演示记录，不是真实岗位，也没有投递链接。卡片会展示来源、更新时间、原始公告、网申地址与核验提示。仅有网申链接不代表确认仍在招聘；缺少链接、日期过期或未能核实的记录不会标成“正在招聘”。

## 数据来源与许可状态

| 来源 | 当前状态 | 启用条件 |
| --- | --- | --- |
| [offer先生校招 API](https://developer.offerxiansheng.com/docs/quickstart) | 已实现服务端转换；尚未调用 | 在账户后台确认额度与公开展示条件，创建 API Key 并保存为仓库 Secret `OFFER_CAMPUS_API_KEY`，确认可公开展示后设置仓库变量 `OFFER_PUBLICATION_APPROVED=true` |
| [xixicc2027 jobs.json](https://github.com/xixicc186/xixicc2027) | 已实现转换；不自动抓取或转载 | 获得仓库作者明确的批量复用许可后，设置仓库变量 `XIXICC_REUSE_APPROVED=true` |

两个仓库都没有独立的 LICENSE 文件。界面参考的 [job-board-react](https://github.com/KvPradeepthi/job-board-react) README 声明 MIT，但本项目没有复制其源码，而是按校招字段重新实现。xixicc2027 的公开可读状态不能当作批量再发布许可。

offer先生的[调用限制文档](https://developer.offerxiansheng.com/docs/common/rate-limit)未承诺固定配额或频率数值，以个人中心和正式方案为准；其[数据展示规则](https://developer.offerxiansheng.com/docs/common/data-updates)要求保留来源归属、区分网申与公告链接，并且不能自行声称“已验证”。

## 自动更新与部署

`.github/workflows/pages.yml` 在推送到 `main` 时构建并部署 GitHub Pages，每天北京时间 10:17 定时运行。数据源的授权变量未设置时，定时任务只发布现有的演示数据，不调用外部 API。开启授权变量后，定时任务从 offer先生的最近 24 小时更新接口增量拉取，或从已获授权的 xixicc2027 仓库拉取；统一字段、去重、检查 URL 与日期，生成 `public/jobs.json` 并提交。失败时不会覆盖已有数据。GitHub Pages 需在仓库 Settings → Pages 中选择 **GitHub Actions** 作为发布来源。

初次启用 offer先生时，在 Actions 中手动运行工作流并勾选 `full_sync`，以搜索接口建立基础数据集。完整同步最多读取 20 页；若超过上限会停止，避免发布残缺结果。按账户配额调整 `MAX_PAGES` 前应先确认额度。日常增量只读取最近 24 小时更新，因此未再次出现的旧记录仍保留为“招聘状态待核验”；截止日期过去时页面会标为“已过截止日”。

API Key 只通过 GitHub Actions Secret 传入更新脚本，绝不加入前端、演示数据或公开仓库。公开站点只读取构建后的 JSON。页面不渲染来自数据源的富文本 HTML。
