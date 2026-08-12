# 阅读界面段落分析总折叠块设计

## 背景

当前阅读界面在每个段落正文下，将“重点词汇与短语”“段落翻译”“写作句型”分别渲染为三个独立的折叠块。参考 `ecoSite` 的界面后，需要将其改为每个段落只有一个总折叠入口，展开后统一展示三类分析内容。

## 目标

- 每个段落正文下默认只显示一个分析折叠入口。
- 展开后保留现有三个内容：重点词汇与短语、段落翻译、写作句型。
- 不修改分析数据、接口、内容文案和正文标注功能。
- 视觉和交互参考 `ecoSite` 的单入口折叠结构。

## 组件设计

修改 `src/components/ArticleAnalysisPanel.tsx`：

- 保留 `.article-analysis` 外层容器。
- 新增一个外层 `<details className="analysis-disclosure">`。
- 使用一个 `<summary>` 作为总入口，文案为“本段词汇、翻译与句型解析”。
- 展开内容中依次渲染三个普通内容区域，不再给三个区域各自包裹 `<details>`：
  1. 重点词汇与短语：使用 `analysis.highlights`。
  2. 段落翻译：使用 `analysis.translation`。
  3. 写作句型：使用 `analysis.writing_sentences`。
- 空数组继续显示现有空状态提示。

## 样式设计

修改 `src/styles.css`：

- 总入口默认只显示一行。
- 使用左侧三角箭头指示折叠状态，打开时旋转。
- 总面板沿用项目已有颜色变量和圆角体系。
- 内部三个区域使用标题、间距和分隔线区分。
- 保留现有响应式规则，不影响移动端阅读、正文高亮和评论弹层。
- 清理或覆盖旧的 `.analysis-section` 折叠样式，使其适配新的普通内容区域结构。

## 数据流与兼容性

数据流保持不变：`ArticleParagraph` 继续将 `ParagraphAnalysis` 传给 `ArticleAnalysisPanel`。不修改 Worker 数据结构、API 请求或文章分析逻辑。文本选取、荧光标注、评论编辑和删除行为与本改动无关。

## 测试

更新 `src/components/ArticleParagraph.test.tsx`：

- 验证面板只包含一个总折叠入口。
- 验证总入口默认关闭。
- 验证三个分析标题和对应内容仍然存在。
- 验证无重点词和无句型时，空状态提示仍然显示。

使用 `npm test` 和 `npm run build` 进行验证。
