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

### 网站代码与第三方数据的许可边界

本项目的界面和数据处理代码由本仓库独立实现，按 [MIT License](LICENSE) 开源。界面参考的 [job-board-react](https://github.com/KvPradeepthi/job-board-react) README 声明 MIT，但没有复制它的源码。网站自己的开源许可只约束我们有权许可的代码，**不改变第三方岗位数据或公告的权利归属**。

[xixicc2027](https://github.com/xixicc186/xixicc2027) 当前没有可见的 LICENSE 文件或明确的 `jobs.json` 批量再发布授权。注明来源、链接回原仓库是必要的署名方式，但不能单凭此推定可把整份数据持续复制到本网站。获得作者许可后会在此记录授权范围、日期和来源，并在每条记录上保留 `xixicc2027` 来源和原仓库链接。在此之前，自动转载开关保持关闭，演示数据也不含其岗位记录。参见 [GitHub 对未声明许可证的说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)。

offer先生的[调用限制文档](https://developer.offerxiansheng.com/docs/common/rate-limit)未承诺固定配额或频率数值，以个人中心和正式方案为准；其[数据展示规则](https://developer.offerxiansheng.com/docs/common/data-updates)要求保留来源归属、区分网申与公告链接，并且不能自行声称“已验证”。

## 自动更新与部署

`.github/workflows/pages.yml` 在推送到 `main` 时构建并部署 GitHub Pages，每天北京时间 10:17 定时运行。数据源的授权变量未设置时，定时任务只发布现有的演示数据，不调用外部 API。开启授权变量后，定时任务从 offer先生的最近 24 小时更新接口增量拉取，或从已获授权的 xixicc2027 仓库拉取；统一字段、去重、检查 URL 与日期，生成 `public/jobs.json` 并提交。失败时不会覆盖已有数据。GitHub Pages 需在仓库 Settings → Pages 中选择 **GitHub Actions** 作为发布来源。

初次启用 offer先生时，在 Actions 中手动运行工作流并勾选 `full_sync`，以搜索接口建立基础数据集。完整同步最多读取 20 页；若超过上限会停止，避免发布残缺结果。按账户配额调整 `MAX_PAGES` 前应先确认额度。日常增量只读取最近 24 小时更新，因此未再次出现的旧记录仍保留为“招聘状态待核验”；截止日期过去时页面会标为“已过截止日”。

### 填写 offer先生 API Key

1. 在 [offer先生开发者平台](https://developer.offerxiansheng.com/)登录、创建 Key，并确认账户额度及公开展示数据的使用条件。
2. 打开本仓库的 [Actions Secrets 页面](https://github.com/AdenXie/job-website/settings/secrets/actions)，点击 **New repository secret**。名称填 `OFFER_CAMPUS_API_KEY`，值填完整 API Key，保存。Secret 的值不会显示在公开仓库或网页中。
3. 仅在确认允许公开展示后，到同一页面的 **Variables** 标签新建仓库变量 `OFFER_PUBLICATION_APPROVED`，值设为 `true`。这一步才会允许定时任务实际调用 API 并把结果发布到网站。
4. 首次启用时可在 [Actions](https://github.com/AdenXie/job-website/actions) 手动运行 **Build and publish job board**，勾选 `full_sync`。这会调用搜索接口多次，请先核对剩余额度。

不要把完整 Key 放进聊天、Issue、README、`.env.example`、前端代码或公开仓库。工作流只通过 GitHub Actions Secret 把 Key 传给更新脚本。公开站点只读取构建后的 JSON，页面不渲染来自数据源的富文本 HTML。
