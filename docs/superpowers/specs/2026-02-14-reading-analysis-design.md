# 阅读页面与 AI 雅思分析设计

## 1. 目标

文章上传并保存后，后端自动调用 OpenAI 兼容接口生成雅思阅读分析。阅读页面按段落展示英文原文，AI 重点词汇/短语加粗，并在每段下方提供可折叠的解释、用法、翻译和雅思写作句子。用户可以选择任意文字添加荧光标记和隐藏评论，并为文章维护持久化笔记。

## 2. 已确认决策

- AI 服务使用 OpenAI 兼容接口。
- 配置项为 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL`。
- 上传文章后自动分析。
- AI 分析、用户标记、用户笔记分开保存。
- 用户可以标记文章中的任意文字，而不局限于 AI 重点内容。
- 标记、评论和笔记保存到服务器。
- 采用结构化 JSON 文章模型。
- 桌面端采用左侧文章内容、右侧笔记面板；移动端笔记面板移动到文章下方。

## 3. 数据模型

文章保留现有基础字段，并增加：

```ts
analysis_status: "pending" | "processing" | "completed" | "failed";
analysis_json: ArticleAnalysis | null;
analysis_error: string | null;
```

```ts
interface ArticleAnalysis {
  version: 1;
  summary?: string;
  paragraphs: ParagraphAnalysis[];
  writing_sentences: WritingSentence[];
}

interface ParagraphAnalysis {
  index: number;
  original: string;
  translation: string;
  highlights: HighlightItem[];
  writing_sentences: WritingSentence[];
}

interface HighlightItem {
  text: string;
  type: "word" | "phrase";
  meaning: string;
  usage: string;
  example?: string;
  ielts_category?: "reading" | "writing" | "speaking" | "general";
}

interface WritingSentence {
  text: string;
  translation: string;
  usage: string;
  tags?: string[];
}
```

用户标记独立保存：

```ts
interface Annotation {
  id: number;
  article_id: number;
  start_offset: number;
  end_offset: number;
  selected_text: string;
  color: "yellow" | "green" | "blue" | "pink";
  comment: string | null;
  created_at: string;
  updated_at: string;
}
```

文章笔记独立保存，每篇文章暂时使用一个主笔记：

```ts
interface ArticleNote {
  id: number;
  article_id: number;
  content: string;
  updated_at: string;
}
```

## 4. 页面交互

- 每篇文章按段落显示，AI 重点词汇/短语使用加粗和浅色底线。
- 每段下方使用原生折叠块展示重点内容、解释、用法、例句、段落翻译和写作句子。
- 用户选中文字后显示操作栏：荧光标记、添加评论、取消。
- 有评论的文本显示评论标识，点击后查看评论；评论文本默认隐藏。
- 桌面端右侧笔记面板 sticky 展示，笔记支持多行输入和防抖自动保存。
- 移动端笔记面板移动到文章底部，并可折叠。
- 标题附近展示 AI 分析中、已完成、失败状态。
- AI 分析失败不影响原文阅读，管理员可重新分析。

## 5. 接口设计

```text
POST   /admin/articles
GET    /articles/:id
POST   /articles/:id/annotations
PATCH  /annotations/:id
DELETE /annotations/:id
GET    /articles/:id/notes
PUT    /articles/:id/notes
POST   /admin/articles/:id/analyze
```

上传流程：保存文章 → 状态 `processing` → 调用 AI → 校验 JSON → 保存结果 → 状态 `completed`。失败时保存安全错误信息并设为 `failed`。

AI 请求使用 `{BASE_URL}/chat/completions`，要求只返回 JSON、原文段落原样保留、段落一一对应、无写作句子时返回空数组，并限制重点内容数量。

## 6. 错误处理

- AI 调用失败：保留原文，显示失败状态，允许重新分析。
- AI 返回 Markdown 代码块：先提取 JSON 再校验。
- JSON Schema 校验失败：不展示未经校验的结果。
- 文章内容变化导致偏移量无效：标记为失效，不错误标记其他文本。
- 笔记和标记保存失败：保留本地编辑状态并提示用户重试。

## 7. 验证范围

- AI JSON 解析、代码块提取和结构校验。
- 段落与分析结果对应。
- 标记/评论增删改查。
- 笔记保存与读取。
- 折叠块交互。
- 文章加载失败和 AI 失败状态。
- 基础响应式布局。

## 8. 实现边界

本阶段重点完成阅读页面、数据库字段/接口、AI 结构化分析和用户标记/笔记闭环。AI 提示词管理后台、词汇测试、音频、复杂富文本编辑和多篇笔记分类不纳入本阶段。
