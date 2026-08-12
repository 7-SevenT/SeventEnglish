# 阅读分析总折叠块实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将每个阅读段落下分散的三个分析折叠块改为一个总折叠入口，同时保留重点词汇、段落翻译和写作句型的全部内容。

**Architecture:** 保持 `ArticleParagraph` 和 `ParagraphAnalysis` 数据流不变，仅重构 `ArticleAnalysisPanel` 的 JSX 层级：外层使用一个原生 `<details>`，内部使用三个普通分析区域。通过 `src/styles.css` 为总入口和内部区域提供参考项目风格的箭头、间距和分隔线。

**Tech Stack:** React 19、TypeScript、原生 CSS、Vitest、Vite。

## Global Constraints

- 不修改 `ParagraphAnalysis`、Worker 数据结构、API 或文章分析逻辑。
- 保留三个现有内容：重点词汇与短语、段落翻译、写作句型。
- 每个段落默认只显示一个关闭状态的总折叠入口。
- 不影响正文高亮、划词标注、评论编辑和删除功能。
- 使用项目现有 CSS 变量、组件命名和原生 HTML 控件，不新增依赖。

---

### Task 1: 重构分析面板结构

**Files:**
- Modify: `src/components/ArticleAnalysisPanel.tsx`
- Test: `src/components/ArticleParagraph.test.tsx`

**Interfaces:**
- Consumes: `ArticleAnalysisPanelProps.analysis: ParagraphAnalysis`。
- Produces: 一个 `article-analysis` 容器，内部包含一个 `analysis-disclosure` 总 `<details>`，以及三个非折叠的内部分析区域。

- [ ] **Step 1: 更新测试，描述单一总折叠入口**

在现有 `keeps analysis sections collapsed and exposes details when opened` 测试中，将旧断言替换为：

```tsx
it("renders one collapsed disclosure containing all three analysis sections", () => {
  const panel = ArticleAnalysisPanel({ analysis });
  const disclosure = panel.props.children as any;
  expect(disclosure.type).toBe("details");
  expect(disclosure.props.className).toBe("analysis-disclosure");
  expect(disclosure.props.open).toBeUndefined();

  const disclosureText = JSON.stringify(disclosure);
  expect(disclosureText).toContain("重点词汇与短语");
  expect(disclosureText).toContain("段落翻译");
  expect(disclosureText).toContain("写作句型");
  expect(disclosureText).toContain("快速变化");
  expect(disclosureText).toContain("快速的变化需要仔细规划。");
  expect(disclosureText).toContain("这需要仔细规划。");
});
```

保留原有空数据测试，并补充空数据面板检查：

```tsx
it("keeps empty states inside the single disclosure", () => {
  const panel = ArticleAnalysisPanel({ ...analysis, highlights: [], writing_sentences: [] });
  const disclosureText = JSON.stringify(panel);
  expect(disclosureText).toContain("本段暂无重点词汇。");
  expect(disclosureText).toContain("本段暂无推荐写作句型。");
});
```

- [ ] **Step 2: 运行面板测试，确认新断言失败**

Run: `npx vitest run src/components/ArticleParagraph.test.tsx`

Expected: FAIL，因为当前组件根节点的 `children` 是三个独立 `<details>`，没有 `analysis-disclosure` 总节点。

- [ ] **Step 3: 实现最小 JSX 结构变更**

在 `src/components/ArticleAnalysisPanel.tsx` 中：

1. 将三个并列 `<details className="analysis-section">` 改为一个：

```tsx
<details className="analysis-disclosure">
  <summary>本段词汇、翻译与句型解析</summary>
  <div className="analysis-content">
    {/* 三个分析区域 */}
  </div>
</details>
```

2. 将三个原来的 `summary` 改为普通标题，例如：

```tsx
<section className="analysis-section">
  <h4>重点词汇与短语 ({analysis.highlights.length})</h4>
  {/* 原 highlights 列表与空状态 */}
</section>
```

3. 段落翻译使用同样的 `<section>` 和 `<h4>`；写作句型也使用同样的 `<section>` 和 `<h4>`。
4. 保留现有 map、字段、key、空状态文本和分析顺序。
5. 不给外层 `<details>` 添加 `open` 属性，确保默认关闭。

- [ ] **Step 4: 运行测试，确认结构和内容通过**

Run: `npx vitest run src/components/ArticleParagraph.test.tsx`

Expected: PASS，所有 `ArticleParagraph` 相关测试通过。

- [ ] **Step 5: Commit**

```bash
git add src/components/ArticleAnalysisPanel.tsx src/components/ArticleParagraph.test.tsx
git commit -m "refactor: group article analysis sections"
```

### Task 2: 更新总折叠块视觉样式

**Files:**
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: Task 1 产生的 `.article-analysis`、`.analysis-disclosure`、`.analysis-content`、`.analysis-section`、`.analysis-list` 等 className。
- Produces: 默认收起的单一面板；打开后展示三个有层次的分析区域。

- [ ] **Step 1: 替换旧的三折叠样式**

在 `src/styles.css` 的文章分析样式段中：

- 保留 `.article-analysis` 的字体和整体间距基础样式；
- 将旧的 `.analysis-section` 卡片和 `summary` 规则改为总 `.analysis-disclosure` 的面板规则；
- 为 `.analysis-disclosure > summary` 设置光标、内边距、字重和颜色；
- 使用 `summary::before` 的 `▶` 或 `›` 箭头，打开状态旋转 90 度；
- 为 `.analysis-content` 设置内容内边距；
- 为 `.analysis-section` 设置底部边框和垂直间距；最后一个区域取消底部边框；
- 将旧的 `.analysis-section > :not(summary)` 选择器改为适配 `h4`、`.analysis-section` 内容的选择器，避免把普通标题错误当作旧 summary 处理。

参考样式方向：

```css
.analysis-disclosure { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.analysis-disclosure > summary { cursor: pointer; list-style: none; padding: var(--space-3) var(--space-4); font-weight: 600; color: var(--fg-muted); }
.analysis-disclosure > summary::before { content: "›"; display: inline-block; margin-right: .45rem; transition: transform .15s; }
.analysis-disclosure[open] > summary::before { transform: rotate(90deg); }
.analysis-content { padding: 0 var(--space-4) var(--space-3); }
.analysis-section { border-top: 1px solid var(--border); padding: var(--space-3) 0; }
.analysis-section:first-child { border-top: 0; }
.analysis-section h4 { margin: 0 0 var(--space-2); color: var(--fg-muted); font-size: var(--fs-sm); }
```

保留 `.analysis-list`、`.analysis-item`、`.analysis-label` 和 `.analysis-translation` 的内容排版能力，仅在必要处调整间距以适应新的父容器。

- [ ] **Step 2: 运行完整前端测试**

Run: `npm test`

Expected: PASS，所有测试通过，且没有引入 TypeScript/React 渲染错误。

- [ ] **Step 3: 构建生产包**

Run: `npm run build`

Expected: Vite 构建成功并生成 `dist/`，无 TypeScript 编译错误。

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "style: align article analysis disclosure"
```

### Task 3: 最终验证与变更检查

**Files:**
- Verify: `src/components/ArticleAnalysisPanel.tsx`
- Verify: `src/components/ArticleParagraph.test.tsx`
- Verify: `src/styles.css`
- Verify: `README.md`
- Verify: `docs/superpowers/specs/2026-08-21-reading-analysis-disclosure-design.md`

**Interfaces:**
- Consumes: Task 1 和 Task 2 的组件、测试与样式变更。
- Produces: 可验证的单总折叠阅读分析界面，且工作区无未预期改动。

- [ ] **Step 1: 检查 Git 差异和状态**

Run: `git status --short && git diff --stat HEAD~2..HEAD`

Expected: 只包含本次阅读分析折叠块相关的组件、测试、样式和文档变更，不出现临时文件或依赖锁文件意外改动。

- [ ] **Step 2: 重新运行验证命令**

Run: `npm test && npm run build`

Expected: 测试和生产构建均成功。

- [ ] **Step 3: 检查关键交互实现**

确认 `ArticleAnalysisPanel`：

- 只有一个外层 `details`；
- 外层没有 `open` 属性；
- 三个内容区域仍按“重点词汇与短语 → 段落翻译 → 写作句型”顺序存在；
- `highlights` 和 `writing_sentences` 的空状态仍存在；
- 没有修改正文和标注组件。
