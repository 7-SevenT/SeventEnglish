# 阅读荧光标记与评论 Tiptap 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用只读 Tiptap/ProseMirror 文档模型重构文章荧光标记与绑定评论，支持跨段落选区、稳定重载和 AI/用户高亮共存。

**Architecture:** 文章正文转换为 ProseMirror 文档；AI 词汇和用户标记是两个独立的 Mark。用户标记以 ProseMirror `from/to` 文档位置保存，评论作为 annotation 的可选字段；前端通过 editor transaction 管理创建、更新和删除，API 负责持久化和校验。

**Tech Stack:** React 19、Tiptap React/Core/PM、ProseMirror、Hono、Cloudflare D1、Vitest、React Testing Library。

## Global Constraints

- 正文编辑器必须为只读，不允许用户修改文章内容。
- 用户评论必须绑定到一段荧光标记，不新增独立文章评论。
- 旧 `annotations` 数据允许清空，不做数据迁移；文章和笔记数据必须保留。
- AI 高亮和用户荧光必须使用独立 Mark，不允许一方渲染分支覆盖另一方。
- 所有文章和 annotation API 继续受现有认证中间件保护。
- 不修改当前工作区已有的非本任务变更：`src/components/ArticleAnalysisPanel.tsx`、`src/components/ArticleParagraph.test.tsx`、`src/styles.css`、`worker/src/articleAnalysis.test.ts`、`worker/src/articleAnalysis.ts`。
- 每个任务先写失败测试，再写最小实现；每个任务完成后运行其目标测试。

---

### Task 1: 安装 Tiptap 依赖并建立标注领域类型

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`（由 npm install 生成）
- Modify: `worker/src/db.ts`
- Modify: `src/api/articles.ts`
- Create: `src/lib/annotations.ts`
- Create: `src/lib/annotations.test.ts`

**Interfaces:**
- Produces `AnnotationPosition = { from: number; to: number }`。
- Produces `AnnotationInput = { from: number; to: number; selected_text: string; color: Annotation["color"]; comment: string | null }`。
- Produces `isValidAnnotationRange(from: number, to: number): boolean`。
- Produces `filterRenderableAnnotations(annotations: Annotation[], documentSize: number): Annotation[]`。
- API `createAnnotation` 使用 `from_position/to_position` 字段；保留函数名不变，避免页面层重复改名。

- [ ] **Step 1: 写失败测试**

在 `src/lib/annotations.test.ts` 添加：

```ts
import { describe, expect, it } from "vitest";
import { filterRenderableAnnotations, isValidAnnotationRange } from "./annotations";

const annotation = (overrides: Partial<Annotation> = {}): Annotation => ({
  id: 1, article_id: 2, from_position: 2, to_position: 8,
  selected_text: "example", color: "yellow", comment: null,
  created_at: "2026-01-01", updated_at: "2026-01-01", ...overrides,
});

describe("annotation ranges", () => {
  it("accepts only positive ordered integer positions", () => {
    expect(isValidAnnotationRange(2, 8)).toBe(true);
    expect(isValidAnnotationRange(8, 8)).toBe(false);
    expect(isValidAnnotationRange(8, 2)).toBe(false);
    expect(isValidAnnotationRange(1.5, 4)).toBe(false);
  });

  it("filters ranges outside the current ProseMirror document", () => {
    expect(filterRenderableAnnotations([annotation(), annotation({ id: 2, from_position: 20, to_position: 30 })], 12).map((a) => a.id)).toEqual([1]);
  });
});
```

补充 `Annotation` 类型导入，使测试可以编译；测试应先因 `from_position/to_position` 和函数不存在而失败。

- [ ] **Step 2: 运行目标测试确认失败**

运行：`npm test -- src/lib/annotations.test.ts`

预期：FAIL，提示新类型字段或 `./annotations` 模块缺失。

- [ ] **Step 3: 安装依赖并实现领域类型**

运行：`npm install @tiptap/core @tiptap/react @tiptap/pm`

在 `worker/src/db.ts` 将 `Annotation` 的 `start_offset/end_offset` 改为 `from_position/to_position`。在 `src/api/articles.ts` 更新 `ArticleDetail`、创建请求和更新请求的字段类型。创建 `src/lib/annotations.ts`，实现：

```ts
export function isValidAnnotationRange(from: number, to: number) {
  return Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to > from;
}

export function filterRenderableAnnotations(annotations: Annotation[], documentSize: number) {
  return annotations.filter((a) => isValidAnnotationRange(a.from_position, a.to_position) && a.to_position <= documentSize);
}
```

- [ ] **Step 4: 运行目标测试确认通过**

运行：`npm test -- src/lib/annotations.test.ts`

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add package.json package-lock.json worker/src/db.ts src/api/articles.ts src/lib/annotations.ts src/lib/annotations.test.ts
git commit -m "feat: add annotation domain types"
```

---

### Task 2: 重建 D1 annotation 表并收紧 API 校验

**Files:**
- Modify: `db/schema.sql`
- Modify: `worker/src/db.ts`
- Modify: `worker/src/index.ts`
- Modify: `worker/src/articles-api.test.ts`
- Modify: `worker/src/db.test.ts`

**Interfaces:**
- `getArticleAnnotations(db, articleId)` 返回包含 `from_position/to_position` 的 `Annotation[]`。
- `createAnnotation(db, articleId, data: CreateAnnotationData)` 保存 ProseMirror 位置。
- `updateAnnotation(db, id, data: UpdateAnnotationData)` 只允许位置、文本、颜色和评论字段。
- API 创建 payload：`{ from_position, to_position, selected_text, color, comment }`。

- [ ] **Step 1: 写失败 API/DB 测试**

在现有 annotation 测试中增加以下断言：

```ts
it("creates an annotation with ProseMirror positions", async () => {
  const response = await app.request("/api/articles/1/annotations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sessionCookie },
    body: JSON.stringify({ from_position: 2, to_position: 8, selected_text: "example", color: "yellow", comment: null }),
  }, env);
  expect(response.status).toBe(201);
  expect((await response.json()).from_position).toBe(2);
});

it("rejects invalid annotation positions and colors", async () => {
  const response = await app.request("/api/articles/1/annotations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sessionCookie },
    body: JSON.stringify({ from_position: 8, to_position: 2, selected_text: "bad", color: "orange", comment: null }),
  }, env);
  expect(response.status).toBe(400);
});
```

在 DB 测试中断言 SQL 查询使用新列，且旧列不再参与读写。测试应先失败。

- [ ] **Step 2: 运行目标测试确认失败**

运行：`npm test -- worker/src/articles-api.test.ts worker/src/db.test.ts`

预期：FAIL，旧接口仍要求 `start_offset/end_offset` 或 schema 不包含新列。

- [ ] **Step 3: 实现 schema 清理和新表结构**

在 `db/schema.sql` 和 `worker/src/db.ts` 的 `defaultSchema` 使用：

```sql
CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  from_position INTEGER NOT NULL,
  to_position INTEGER NOT NULL,
  selected_text TEXT NOT NULL,
  color TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

在 `applySchema` 中增加一次性兼容清理：检测旧 `annotations` 是否含 `start_offset`，若存在则执行 `DROP TABLE annotations`，再执行新建语句；这样按用户要求清空旧标记但不触碰 articles/article_notes。确保重复调用幂等。

更新 `worker/src/index.ts` 的 POST/PATCH 校验：位置必须为整数、`from_position >= 1`、`to_position > from_position`；颜色只能是四种允许值；评论只能是字符串/null；`selected_text` 必须为非空字符串。无效 id 返回 404。删除操作应先查询目标记录，不存在时返回 404。

- [ ] **Step 4: 运行目标测试确认通过**

运行：`npm test -- worker/src/articles-api.test.ts worker/src/db.test.ts`

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add db/schema.sql worker/src/db.ts worker/src/index.ts worker/src/articles-api.test.ts worker/src/db.test.ts
git commit -m "feat: rebuild annotation storage"
```

---

### Task 3: 构建只读 Tiptap 文档和独立 Mark

**Files:**
- Create: `src/components/ReadingDocument.tsx`
- Create: `src/components/AnnotationMark.tsx`
- Create: `src/components/ReadingDocument.test.tsx`
- Create: `src/lib/articleDocument.ts`
- Create: `src/lib/articleDocument.test.ts`
- Modify: `src/styles.css`（只追加新选择器，保留现有未提交样式修改）

**Interfaces:**
- `buildArticleDoc(paragraphs: ParagraphAnalysis[], annotations: Annotation[]): JSONContent`。
- `AnnotationMark` attrs：`annotationId: number`、`color: Annotation["color"]`。
- `ReadingDocument` props：`paragraphs: ParagraphAnalysis[]`、`annotations: Annotation[]`、`onSelectionChange`、`onEditComment`、`onDeleteAnnotation`。
- `onSelectionChange(selection: { from: number; to: number; text: string; rect: DOMRect } | null)`。

- [ ] **Step 1: 写失败转换测试**

在 `src/lib/articleDocument.test.ts` 覆盖：

```ts
it("creates paragraph nodes and keeps AI highlight marks", () => {
  const doc = buildArticleDoc([{ index: 0, original: "Learn by doing.", translation: "边做边学", highlights: [{ text: "Learn", type: "word", meaning: "学习", usage: "verb" }], writing_sentences: [] }], []);
  expect(doc.type).toBe("doc");
  expect(doc.content?.[0].type).toBe("paragraph");
  expect(doc.content?.[0].content?.[0].marks).toEqual([{ type: "aiHighlight" }]);
});

it("adds annotation and AI marks without replacing either", () => {
  const doc = buildArticleDoc(paragraphs, [{ id: 9, article_id: 1, from_position: 1, to_position: 7, selected_text: "Learn ", color: "yellow", comment: "key", created_at: "", updated_at: "" }]);
  const marks = doc.content?.[0].content?.[0].marks ?? [];
  expect(marks.map((mark) => mark.type)).toEqual(expect.arrayContaining(["aiHighlight", "annotation"]));
});
```

先运行，预期因文档转换函数不存在而失败。

- [ ] **Step 2: 实现 Tiptap schema 和文档转换**

在 `articleDocument.ts` 创建 `Document`, `Paragraph`, `Text`, `HardBreak` 节点配置，并创建两个 Mark：

- `aiHighlight`：无属性，渲染为 `<strong class="article-highlight">`；
- `annotation`：属性 `annotationId`、`color`，渲染为 `<mark data-annotation-id="..." data-color="...">`。

`buildArticleDoc` 先把每个原文段落转换为文本节点，按 AI highlight 文本的实际出现位置切片并添加 `aiHighlight` mark，再按 annotation 的 `from_position/to_position` 对应的文档位置加 `annotation` mark。位置越界时跳过该标记，不能改变原文节点。

- [ ] **Step 3: 写组件行为测试**

在 `ReadingDocument.test.tsx` 增加：

```tsx
it("renders both AI and user highlight DOM markers", () => {
  render(<ReadingDocument paragraphs={paragraphs} annotations={annotations} onSelectionChange={vi.fn()} onEditComment={vi.fn()} onDeleteAnnotation={vi.fn()} />);
  expect(document.querySelector(".article-highlight")).toBeTruthy();
  expect(document.querySelector('mark[data-annotation-id="9"]')).toBeTruthy();
});
```

- [ ] **Step 4: 实现只读组件**

使用 `useEditor` 创建 editor，`editable: false`，扩展使用文档节点、两个 Mark 和 `Placeholder` 以外不添加编辑器插件。使用 `EditorContent` 渲染。选区监听只在 `selection.empty === false` 且选区属于 editor.view.dom 时触发；使用 `editor.view.coordsAtPos(selection.from)` 和 `selection.to` 计算 toolbar 坐标。给 annotation mark 添加点击事件，通过 `data-annotation-id` 找到对应 annotation 并显示 popover。

不要继续使用 `AnnotatedArticleText` 的字符串切片或 `useTextSelection` 的 DOM Range 计算。

- [ ] **Step 5: 运行目标测试确认通过**

运行：`npm test -- src/lib/articleDocument.test.ts src/components/ReadingDocument.test.tsx`

预期：PASS。

- [ ] **Step 6: 提交**

```bash
git add src/components/ReadingDocument.tsx src/components/AnnotationMark.tsx src/components/ReadingDocument.test.tsx src/lib/articleDocument.ts src/lib/articleDocument.test.ts src/styles.css
git commit -m "feat: render reading documents with tiptap"
```

---

### Task 4: 接入工具栏、评论弹层和 annotation API 状态

**Files:**
- Create: `src/hooks/useArticleAnnotations.ts`
- Create: `src/components/AnnotationToolbar.tsx`
- Create: `src/components/AnnotationPopover.tsx`
- Create: `src/hooks/useArticleAnnotations.test.ts`
- Create: `src/components/AnnotationToolbar.test.tsx`
- Modify: `src/pages/ArticleDetail.tsx`
- Modify: `src/api/articles.ts`

**Interfaces:**
- `useArticleAnnotations(articleId, initialAnnotations)` 返回 `{ annotations, create, updateComment, remove, error, pending }`。
- `create({ from, to, selectedText, comment })` 默认颜色为 `yellow`。
- `updateComment(annotationId, comment: string | null): Promise<Annotation>`。
- `remove(annotationId): Promise<void>`。
- `AnnotationToolbar` 接收 `selection`、`onHighlight`、`onComment`、`onCancel`。
- `AnnotationPopover` 接收 `annotation`、`onEdit`、`onDelete`、`onClose`。

- [ ] **Step 1: 写 hook/API 失败测试**

测试创建成功会追加 annotation；创建失败不会留下本地 annotation；更新和删除失败保留现状。API client 测试断言请求 body 使用 `from_position/to_position`，不再发送旧 offset 字段。

```ts
it("removes a failed optimistic annotation", async () => {
  server.use(createAnnotationFailure());
  const { result } = renderHook(() => useArticleAnnotations(1, []));
  await expect(result.current.create({ from: 2, to: 8, selectedText: "example", comment: null })).rejects.toThrow();
  expect(result.current.annotations).toEqual([]);
});
```

- [ ] **Step 2: 实现 hook 和 API 类型**

在 hook 中保存服务端 annotation 列表；创建请求成功后以返回对象替换临时状态，失败时回滚；更新成功按 id 替换，删除成功按 id 过滤。所有异步操作在组件卸载后不得 setState。API 函数签名保持：`createAnnotation(articleId, data)`、`updateAnnotation(id, data)`、`deleteAnnotation(id)`。

- [ ] **Step 3: 写工具栏和弹层失败测试**

测试空 selection 不渲染工具栏；非空 selection 点击“荧光”调用 `onHighlight`；点击“评论”打开 textarea；提交空评论不发送请求；popover 的“编辑评论”进入编辑态，“删除标记”调用删除回调。

- [ ] **Step 4: 实现交互组件**

`AnnotationToolbar` 用选区 `DOMRect` 定位；滚动时由父组件清除 selection。评论输入框使用受控 textarea，提交时 trim；取消只关闭输入框。`AnnotationPopover` 只显示当前标记的 comment，没有评论时显示“荧光标记”，编辑保存空字符串转换为 null。按钮事件必须 `stopPropagation()`，避免触发正文重新选区。

- [ ] **Step 5: 集成 `ArticleDetail`**

删除原有 `handleAnnotation` 的段落局部 offset 逻辑，移除 `ArticleParagraph` 的正文渲染分支，改为：

```tsx
<ReadingDocument
  paragraphs={paragraphs}
  annotations={annotations}
  onSelectionChange={setSelection}
  onEditComment={updateComment}
  onDeleteAnnotation={remove}
/>
```

在页面层根据 selection 调用 hook 的 `create`：荧光动作传 `comment: null`；评论动作先显示输入框，提交后传入 comment。创建成功后清空 selection 和浏览器原生 selection；失败显示页面错误。保留文章分析状态轮询和 ArticleNotes。

- [ ] **Step 6: 运行目标测试确认通过**

运行：`npm test -- src/hooks/useArticleAnnotations.test.ts src/components/AnnotationToolbar.test.tsx src/api/client.test.ts`

预期：PASS。

- [ ] **Step 7: 提交**

```bash
git add src/hooks/useArticleAnnotations.ts src/hooks/useArticleAnnotations.test.ts src/components/AnnotationToolbar.tsx src/components/AnnotationToolbar.test.tsx src/components/AnnotationPopover.tsx src/pages/ArticleDetail.tsx src/api/articles.ts
git commit -m "feat: add annotation toolbar and comments"
```

---

### Task 5: 删除旧实现并补齐样式、回归测试

**Files:**
- Delete: `src/components/AnnotatedArticleText.tsx`
- Delete: `src/components/TextAnnotationToolbar.tsx`
- Delete: `src/hooks/useTextSelection.ts`
- Modify: `src/components/ArticleParagraph.tsx`
- Modify: `src/components/ArticleParagraph.test.tsx`
- Modify: `src/styles.css`
- Modify: `README.md`（补充 annotation 数据清空和本地开发说明）

**Interfaces:**
- `ArticleParagraph` 仅保留 AI 分析段落展示，不再接收 annotation、selection 或 comment 回调。
- 新阅读渲染唯一入口是 `ReadingDocument`。

- [ ] **Step 1: 迁移/删除旧测试中的实现依赖**

将 `ArticleParagraph.test.tsx` 中只针对 `splitHighlightedText` 的测试保留并改为从稳定的 `src/lib/articleDocument.ts` 测试文档转换；删除对旧 DOM selection、旧 toolbar 和 `AnnotatedArticleText` 的引用。先运行测试，确认缺失引用后再删除旧文件。

- [ ] **Step 2: 移除旧组件和 hook**

从 `ArticleParagraph` 删除 `TextAnnotationToolbar`、`AnnotatedArticleText`、`TextSelection`、comment props 和 DOM `onMouseUp`。确认 `rg -n "AnnotatedArticleText|TextAnnotationToolbar|useTextSelection|start_offset|end_offset" src worker db` 只剩迁移说明或无结果后删除三个旧文件。

- [ ] **Step 3: 补充样式**

只为新 DOM 追加样式：`[data-annotation-id]` 四种颜色、toolbar、comment compose、popover、错误状态和键盘 focus 样式。popover 使用绝对定位或 fixed 定位，不依赖 mark 内部嵌套文本；按钮具有可见 focus outline。保留现有 `article-highlight` 样式。

- [ ] **Step 4: 更新 README**

在开发/部署说明中写明：annotation 表为不兼容重建，部署前旧荧光标记和评论会被清空；运行 `npm install` 安装 Tiptap 依赖；验证命令为 `npm test` 和 `npm run build`。

- [ ] **Step 5: 运行回归测试和构建**

运行：

```bash
npm test
npm run build
rg -n "AnnotatedArticleText|TextAnnotationToolbar|useTextSelection|start_offset|end_offset" src worker db
```

预期：所有测试 PASS、构建 PASS，搜索无旧实现引用。

- [ ] **Step 6: 提交**

```bash
git add src/components/ArticleParagraph.tsx src/components/ArticleParagraph.test.tsx src/styles.css README.md
 git rm src/components/AnnotatedArticleText.tsx src/components/TextAnnotationToolbar.tsx src/hooks/useTextSelection.ts
git commit -m "refactor: remove legacy annotation renderer"
```

---

## 计划自审

- 规格覆盖：目标与非目标由 Task 1、3、4 覆盖；数据库清理和 API 校验由 Task 2 覆盖；错误处理由 Task 4 和 Task 5 覆盖；测试与构建由每个任务及 Task 5 覆盖。
- 占位符检查：计划中没有未执行的占位步骤；每个步骤均包含路径、动作、测试命令或具体接口。
- 类型一致性：Task 1 定义 `from_position/to_position` 与 `AnnotationInput`；Task 2 API 使用同名字段；Task 3 使用相同位置生成 Mark；Task 4 将 selection 的 `from/to` 传入 hook。
- 范围检查：所有任务均围绕只读文章 annotation/comment 子系统，不扩展到协作编辑或独立评论线程。
