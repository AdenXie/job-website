# 秋招信库

面向中国校招的岗位信息库：[打开网站](https://jobs.adenxie.com.cn/)。支持关键词和条件筛选、原始链接、截止日期提示及浏览器本地收藏，兼顾电脑和手机浏览。

岗位数据来自 [offer先生校招 API](https://developer.offerxiansheng.com/docs/quickstart) 与 [xixicc2027](https://github.com/xixicc186/xixicc2027)。本站约每 12 小时读取一次 offer 先生最近 24 小时的更新，并完整读取 xixicc2027 数据文件，只展示其中的校招岗位；实习和活动不收录。地点统一为省份和城市。本站保留来源、原始链接和数据更新时间；招聘状态未经逐条人工核验，投递前请以企业公告为准。已知截止日期过期的记录会在同步时移除；没有截止日期的记录无法据此判断是否仍在招聘。

## 简历生成器

站内附带一个纯前端的[在线简历生成器](https://jobs.adenxie.com.cn/resume/)：左侧编辑内容，右侧实时预览 A4 排版，支持三套模板切换、内容超出时自动压缩到一页，以及通过浏览器打印导出 PDF。简历内容只保存在当前浏览器的本地存储中，不会上传；可导出 JSON 备份后再导入。入口在首页右上角，源码位于 `resume/index.html` 与 `src/resume/`，随主站一同构建和部署。

三套模板的版式思路参考了以下开源简历项目（均为 MIT 许可的 LaTeX 模板），在此致谢。本站用 HTML/CSS 重新实现，没有复制其源码或字体：

- [billryan/resume](https://github.com/billryan/resume)：“经典”模板的居中抬头、通栏标题线与“名称在左、时间在右”的条目排法。
- [hijiangtao/resume](https://github.com/hijiangtao/resume)：“紧凑”模板面向中文单页简历的信息密度取舍。
- [heylong7/OpenCurve-Resume](https://github.com/heylong7/OpenCurve-Resume)：“色带”模板的全局强调色、条目色带与可选头像，以及字号、行距、边距可调的思路。

## 许可

本站代码按 [Apache License 2.0](LICENSE) 开源。第三方岗位数据不属于本站的 Apache 2.0 授权范围。xixicc2027 仓库目前没有可见的明确数据再发布许可；本站按用户选择用于非商业个人信息整理，并保留逐条署名及原仓库链接。如来源方提出限制或撤回要求，将停止同步并移除相关数据。
