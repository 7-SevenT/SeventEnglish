# 单词文本批量导入 + 免费 TTS 听写设计 — SeventEnglish

日期：2026-08-15

## 背景与目标

SeventEnglish 听力模块现有能力（`DictationAdmin` / `Practice` / `DictationImportDrawer`）：

- 单词按 单词书 → 单元 → 词条 三级管理，词条必须**上传音频文件**（`POST /api/words` multipart，文件名即答案，音频存 R2）。
- 听写练习页（`Practice.tsx`）播放 R2 音频 → 用户填拼写 → 判分 → 错词重练。

痛点：每个单词都要找/传音频文件，一整个单元的单词无法批量录入。

本次目标：

1. **文本批量导入**：在导入抽屉新增「文本导入」页签，粘贴一整个单元的单词（每行一个，可带释义），解析预览后一键批量入库，无需音频文件。
2. **免费 TTS 朗读**：无音频文件的词条（TTS 词条）在听写中用浏览器自带 Web Speech API（`speechSynthesis`）朗读——零成本、零依赖、无需后端与 API Key。
3. 管理后台与练习页兼容两种词条（音频 / TTS），TTS 词条可试听。

## 数据层

### `words` 表（最小迁移）

`audio_key` 保持 `TEXT NOT NULL`，语义扩展：**非空 = R2 key（音频词条）；空串 `''` = TTS 词条**。避免 SQLite 修改列约束带来的表重建迁移。

新增一列：

```sql
ALTER TABLE words ADD COLUMN definition TEXT NOT NULL DEFAULT '';
```

迁移方式沿用 `applySchema` 的 PRAGMA 幂等模式（参考 annotations 迁移）：

```ts
const wordColumns = await db.prepare("PRAGMA table_info(words)").all<{ name: string }>();
if (!wordColumns.results.some((c) => c.name === "definition")) {
  await db.prepare("ALTER TABLE words ADD COLUMN definition TEXT NOT NULL DEFAULT ''").run();
}
```

同步更新 `db/schema.sql` 与 `worker/src/db.ts` 内嵌 `defaultSchema`（`CREATE TABLE IF NOT EXISTS words` 中加 `definition` 列），两处保持一致（AGENTS.md 约定）。

### `Word` 接口（worker/src/db.ts）

```ts
export interface Word {
  id: number;
  unit_id: number;
  word: string;
  audio_key: string;   // '' = TTS 词条
  definition: string;  // 释义，可空串
  sort_order: number;
}
```

## 后端 API

### 新增 `POST /api/units/:unitId/words/bulk`（JSON）

```ts
// 请求
{ "items": [{ "word": "apple", "definition": "苹果" }, ...] }

// 响应
{ "ok": true, "created": 20, "skipped": 2, "duplicates": ["Apple"] }
```

- 校验：unitId 存在（404）；`items` 为数组且长度 1–500；逐条校验 word trim 非空、≤100 字符，definition ≤500 字符，非法条目计入 `skipped` 并收集原因（返回 `invalid` 列表）。
- 去重：与**同单元已有词条**（大小写不敏感）重复的跳过；数组内重复也跳过。
- 插入：`source` 语义即 `audio_key=''`，`sort_order` 从 `MAX(sort_order)+1` 起递增。
- 复用 `requireAuth`（挂 `/api/units/*` 已有中间件覆盖路径）。
- 数据库写操作无长任务，不走队列。

`GET /api/units/:unitId/words` 无需改动（`SELECT *` 自动带新列）。

## 前端

### 1. 文本解析器 `src/lib/textImport.ts`（纯函数，可单测）

```ts
export interface ParsedWordEntry {
  word: string;
  definition: string;
  line: number;        // 1 起
}
export interface ParseResult {
  items: ParsedWordEntry[];
  errors: { line: number; message: string }[];  // 空行不报错
}
export function parseWordListText(text: string): ParseResult;
export function normalizeWord(word: string): string;  // trim + 小写（去重比较用）
```

解析规则（宽容优先）：

- 按 `\n` 分行，`\r` 去除；空行 / 纯空白行跳过。
- 每行首个分隔符切分 word 与 definition：`\t`、两个及以上连续空格、或英文逗号（`，` 也接受）。无分隔符 → 整行为 word。
- word / definition 均 trim 首尾空白；word 允许含空格（词组如 `take off`）。
- word 超长（>100）或空 → 该行记入 `errors`。

### 2. TTS 引擎 `src/hooks/useSpeechSynthesis.ts`

封装 `window.speechSynthesis`（浏览器原生，无依赖）：

```ts
interface UseSpeechSynthesis {
  supported: boolean;                    // 浏览器/语音不可用时 false
  voices: SpeechSynthesisVoice[];        // 过滤后的英文语音（lang 以 en 开头）
  voice: SpeechSynthesisVoice | null;
  setVoice: (v: SpeechSynthesisVoice) => void;
  rate: number;                          // 默认 0.9
  setRate: (r: number) => void;
  speak: (text: string, onEnd?: () => void) => void;
  cancel: () => void;
  speaking: boolean;
}
```

要点：

- 监听 `voiceschanged`（Safari 首次拿不到语音列表的问题）。
- 语音过滤：`lang.toLowerCase().startsWith("en")`；默认优先 `en-US`，其次 `en-GB`，再次任意 en。
- `speak` 创建 `SpeechSynthesisUtterance`，设 `voice/rate/pitch`，`onend` 触发回调，`onerror` 也触发（避免卡死序列）。
- 偏好持久化：`localStorage`（key `dictation.voiceURI` / `dictation.rate`），个人工具不做跨端同步。
- 模块顶部 `export function isSpeechSynthesisSupported()` 供非 hook 场景（管理后台试听）使用。

### 3. 听写练习 `Practice.tsx` 改造

- `RoundItem` 扩展：`audioUrl: string | null`（null = TTS）、`definition: string`。
- 加载时 `listWords` 已返回 `audio_key`，构造 `audioUrl = word.audio_key ? '/api/audio?key=' + encodeURIComponent(word.audio_key) : null`。
- **播放抽象**：`playItem(i)` 内部分支——
  - `audioUrl` 非空 → 走现有 `<audio>` 元素（逻辑不变）；
  - 为 null → `speech.cancel()` + `speak(item.word, onEnded)`（TTS）。
  - `onEnded` 统一驱动自动序列（5 秒间隔）与已播标记，现有调度逻辑不动。
- **防抖/健壮性**：Chrome 的 speechSynthesis 在 `cancel()` 后立即 `speak()` 偶发失败，TTS 词条切换时先 `cancel()` 再 `setTimeout(50ms)` 后 `speak`。
- 判分后错词展示 `✗ 答案`，TTS 词条额外展示释义（`✗ apple（苹果）`）。
- 顶部新增一行轻量控件：语音选择（下拉，来自 `voices`）+ 语速（`-`/`+` 按钮或 select 0.5–1.5）。仅在 `supported && 本单元存在 TTS 词条` 时显示。
- 不支持的浏览器（`!supported` 且存在 TTS 词条）：进入时给出提示，TTS 词条标灰不可播。

### 4. 导入抽屉 `DictationImportDrawer.tsx` 加「文本导入」页签

- 页签切换：`音频导入 | 文本导入`（沿用现有抽屉容器，仅内容区切换）。
- 文本导入区：`textarea`（placeholder 写明格式示例）→ 实时 `parseWordListText` 预览表格（行号 / 单词 / 释义 / 状态）：
  - 格式错误行标红并显示原因；
  - 与单元已有词条重复标黄（重复项在导入时跳过）。
- 底部「导入 N 个词条」按钮 → `POST /api/units/:unitId/words/bulk` → 成功 toast（含 created / skipped）+ 刷新词条列表；失败显示后端错误。
- 导入按钮在 `unitId` 未选或解析结果为空时禁用。
- 音频页签逻辑完全保留。

### 5. 管理后台 `DictationAdmin.tsx` 词条展示

- 词条行加来源徽标：`audio_key === ''` 显示 `TTS`（弱化样式），否则显示 `音频`。
- TTS 词条行加「试听」按钮：调 `speechSynthesis` 朗读该单词（复用 `isSpeechSynthesisSupported` 判断）。

### 6. API 层（src/api/admin.ts）

```ts
export function bulkImportWords(unitId: number, items: { word: string; definition?: string }[]) {
  return apiFetch<{ ok: boolean; created: number; skipped: number; duplicates?: string[]; invalid?: string[] }>(
    `/units/${unitId}/words/bulk`,
    { method: "POST", body: JSON.stringify({ items }) }
  );
}
```

## 样式（src/styles.css 追加）

- `.import-tabs` / `.import-tab` / `.import-tab--active`：抽屉内页签。
- `.import-preview` / `.import-preview__row` / `.import-preview--error` / `--duplicate`：解析预览表格。
- `.tts-badge`：TTS 来源徽标。
- `.voice-controls` / `.voice-controls select`：听写页语音/语速控件行。

沿用现有 CSS 变量 token，不写死颜色。

## 范围边界（非目标）

- 不引入新 npm 依赖（Web Speech API 为浏览器原生）。
- 不做 Edge TTS / Workers AI TTS 等高级音质（播放引擎已在 Practice 内部做分支，未来可替换为可插拔音源）。
- 不做听写成绩持久化、不做跨设备语音偏好同步（localStorage 即可）。
- 不修改现有 `POST /api/words`（音频上传）与 `GET /api/audio`。

## 实现方式（步骤）

1. 数据层：`db/schema.sql` + `worker/src/db.ts`（defaultSchema + applySchema 迁移 + Word 接口）。
2. 后端：`worker/src/index.ts` 新增 `POST /api/units/:unitId/words/bulk` + 测试（`worker/src/index.test.ts`）。
3. 前端工具：`src/lib/textImport.ts` + `textImport.test.ts`；`src/hooks/useSpeechSynthesis.ts` + 测试（mock speechSynthesis）。
4. 前端页面：`src/api/admin.ts`（bulkImportWords）→ `DictationImportDrawer.tsx`（文本页签）→ `DictationAdmin.tsx`（徽标/试听）→ `Practice.tsx`（TTS 播放 + 语音控件）。
5. `src/styles.css` 追加样式；同步更新受影响的既有测试（`DictationImportDrawer.test.tsx`、`DictationAdmin.test.tsx`）。
6. 校验：`npm test` + `npx tsc --noEmit` + `npm run build` 全部通过。

## 验收标准

- 粘贴一个单元单词文本（含纯单词行与带释义行、含格式错误行），预览正确标错，导入后词条出现且标记 TTS。
- 听写练习页 TTS 词条能正常朗读、自动序列、5 秒间隔、判分与错词重练与音频词条一致；语音/语速可调。
- 音频词条功能完全不变（回归）。
- 数据库迁移幂等（重复 applySchema 不报错、不丢数据）。
