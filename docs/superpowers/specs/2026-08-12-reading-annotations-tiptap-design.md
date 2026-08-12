# 阅读荧光标记与评论 Tiptap 重构设计

日期：2026-08-12

## 背景

当前阅读页使用 DOM Range、段落局部字符偏移和手写 `<mark>` 组合实现荧光标记与评论。正文按段落拆分后，选区坐标可能在段落局部偏移和整篇文章偏移之间混用；跨段落选择不支持；用户标记存在时还会替换 AI 词汇高亮；评论弹层与正文渲染耦合，导致刷新、重渲染和边界选区容易产生 BUG。

本次采用成熟编辑器方案：引入 Tiptap/ProseMirror 作为只读正文的文档模型与选区/事务引擎。旧 annotations 数据按需求允许清空，不做迁移。

## 目标与非目标

### 目标

- 支持跨段落选择并创建荧光标记或绑定评论。
- 使用 ProseMirror 文档位置和 Mark 管理标记，不再依赖 DOM 字符偏移。
- AI 词汇高亮和用户荧光标记使用独立 mark，可以同时显示。
- 支持标记/评论的创建、编辑评论、删除标记，并正确处理 API 失败。
- 刷新、重新加载文章和分析状态变化后保持标记一致。
- 用组件测试和 API 测试覆盖关键边界行为。

### 非目标

- 不支持编辑文章正文。
- 不实现独立于文字标记的整篇文章评论。
- 不实现多人协作、评论线程、回复、@用户或权限系统。
- 不迁移旧 annotations，部署新模型前清空旧标记数据。

## 方案

### 依赖与编辑器模式

新增 Tiptap React、Tiptap Core、Tiptap PM 相关依赖。编辑器设置为只读；Tiptap 仅用于文档树、选区、Mark 和事务，不作为文章编辑器。

文章正文由段落节点组成。每个段落保留原始文本，AI 分析词汇转换为 `aiHighlight` mark。用户标记转换为 `annotation` mark，属性包含 annotation ID 和颜色。用户 mark 不覆盖或替换 AI mark。

### 组件边界

- `ReadingDocument`：构建文章文档、创建编辑器实例、渲染正文和分析高亮。
- `AnnotationMark`：定义用户标记的属性、渲染标签和颜色样式。
- `AnnotationToolbar`：基于当前 ProseMirror selection 提供荧光/评论动作。
- `AnnotationPopover`：显示标记评论及编辑、删除操作。
- `useArticleAnnotations`：封装 annotation API、加载状态、乐观更新和失败回滚。

原有 `ArticleParagraph`、`AnnotatedArticleText`、`TextAnnotationToolbar`、`useTextSelection` 中与 DOM Range 锚定相关的逻辑将被移除或改为兼容壳；不保留两套选区实现。

### 数据模型

数据库中的 annotation 表重建为：

- `id`
- `article_id`
- `from_position`
- `to_position`
- `selected_text`
- `color`
- `comment`
- `created_at`
- `updated_at`

`from_position/to_position` 是 ProseMirror 文档位置。`selected_text` 是保存时的文本快照，用于校验和展示，不作为唯一定位依据。旧表中的 annotation 数据允许直接清空；schema 初始化需要对已有数据库提供明确的重建/清理策略，避免旧字段被误读。

### 交互与数据流

1. 用户在只读正文中选择文字，ProseMirror 提供当前 selection。
2. 工具栏显示在选区附近；滚动、点击正文其他位置或取消时关闭。
3. 点击“荧光”立即创建黄色标记；点击“评论”打开评论输入框，提交后创建带 comment 的标记。
4. 前端先根据 selection 添加临时 mark，再调用创建 API；API 失败时移除临时 mark并提示错误。
5. 加载文章时将服务端 annotations 映射到文档位置；位置越界或快照不匹配的记录不渲染并记录可见错误状态，而不是破坏正文。
6. 点击已有标记打开 popover，可编辑评论或删除整个标记。编辑评论只更新 annotation 属性，不重建选区；删除操作成功后移除对应 mark。
7. 文章分析重新加载时，正文文档和用户标记分层生成，确保 AI mark 更新不会清除 annotation mark。

### API 与安全校验

创建和更新接口校验：文章存在、位置为合法整数且 `from < to`、颜色属于允许集合、评论为字符串或 null、选中文本非空。服务端可根据文章正文/文档映射做长度边界校验。删除和更新不存在的 annotation 返回 404。所有文章/annotation 路由继续使用现有鉴权中间件。

## 错误处理

- 选择为空或反向选择：不显示工具栏。
- 选区不在正文编辑器内：忽略。
- 选区包含已有 annotation：按明确的覆盖策略处理；默认禁止重复嵌套并提示用户先删除或调整已有标记。
- API 创建失败：撤销临时 mark，保留正文和当前页面状态。
- 更新/删除失败：不改变现有 mark，显示错误。
- 服务端位置失效：跳过无效标记并显示“部分标记无法恢复”，不能导致文章不可读。

## 测试

- 单元测试：正文到 ProseMirror 文档转换、AI mark 与 annotation mark 并存、位置边界、无效 annotation 过滤。
- 组件测试：跨段落选择、工具栏动作、评论提交、编辑评论、删除标记、API 失败回滚。
- API 测试：创建/更新/删除校验、非法位置和颜色、文章不存在、清理后的 schema 行为。
- 回归验证：`npm test` 和 `npm run build`。

## 部署与数据处理

这是一次不兼容的 annotation 数据模型变更。部署前清空旧 annotations；初始化逻辑必须能在已有 D1 数据库上完成清理并建立新结构。文章、笔记和其他业务数据不受影响。
