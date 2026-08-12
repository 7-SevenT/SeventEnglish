# 听力上传与听写练习 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让听力模块支持一次多文件上传，并将听写练习改造为"符号预填 + 播放列表 + 分轮次循环直到全对"的流程。

**Architecture:** 新增一个纯函数答案解析模块 `src/lib/answer.ts`（可单测）负责把答案词拆成"符号预填 + 用户输入 + 千分位"三部分；改造 `BooksAdmin.tsx` 支持多选音频批量上传；重构 `Practice.tsx` 为分轮次循环听写（一页空位 + 小圆点播放列表 + 5 秒间隔 + 统一提交）。后端 `/api/words` 无需改动（已支持 word 缺省取文件名）。

**Tech Stack:** React 19 + TypeScript + Vite + vitest（沿用现有栈，无新依赖）。

## Global Constraints

- 无新 npm 依赖；沿用 React 19 + Vite + vitest + 既有设计 token。
- 数据来源：单词答案 = 上传音频文件名去扩展名（后端 `/api/words` 缺省行为，**不改后端**）。
- 符号规则（varbatim from spec）：前缀预填 `$ £ €`；后缀预填 `% °C`（含必要前一空格）；千分位逗号输入中实时补、判定忽略；用户需输入：英文单位词（`tons km guests metres cm`）、`.`、`/`、`-`。
- 上传不再提供 word 手动输入框，拒绝非音频文件，一次可多选。
- 听写分轮：第 1 轮全部词随机 → 一页空位 + 播放列表 → 全部播完统一提交 → 错词随机重排进下一轮 → 直至全对完成一大轮。
- 样式沿用 `src/styles.css` 设计 token，不改样式架构。
- README 需在实现收尾时同步（听力模块描述）。

---

### Task 1: 答案解析引擎 `src/lib/answer.ts`

**Files:**
- Create: `src/lib/answer.ts`
- Test: `src/lib/answer.test.ts`

**Interfaces:**
- Produces: `parseAnswer`, `formatThousands`, `normalize`, `isCorrect`, `ParsedAnswer` — 供 Task 3（Practice）消费。

定义精确返回：

```ts
export interface ParsedAnswer {
  prefix: string;  // "$"/"£"/"€"/""  —— 只读预填
  suffix: string;  // "%"/" °C"/""  —— 只读预填（含必要前导空格）
  digits: string;  // 用户数字输入（无逗号的纯数字串，可含 "."），输入时实时千分位 || ""
  rest: string;    // 用户需输入的非数字部分（英文单位词带前导空格、或 / - 连接的符号答案）|| ""
  full: string;    // 原始答案串（展示用）
}
```

- [ ] **Step 1: 写失败测试** `src/lib/answer.test.ts`

覆盖 spec 表 + 边界：

```ts
import { describe, expect, it } from "vitest";
import { parseAnswer, formatThousands, isCorrect, normalize } from "./answer";

describe("parseAnswer 符号预填拆分", () => {
  it("货币前缀", () => {
    expect(parseAnswer("$184")).toEqual({ prefix: "$", suffix: "", digits: "184", rest: "", full: "$184" });
    expect(parseAnswer("£8.50")).toEqual({ prefix: "£", suffix: "", digits: "8.50", rest: "", full: "£8.50" });
    expect(parseAnswer("€77.50")).toEqual({ prefix: "€", suffix: "", digits: "77.50", rest: "", full: "€77.50" });
  });
  it("百分号/摄氏度后缀（含前导空格）", () => {
    expect(parseAnswer("40%")).toEqual({ prefix: "", suffix: "%", digits: "40", rest: "", full: "40%" });
    expect(parseAnswer("19 °C")).toEqual({ prefix: "", suffix: " °C", digits: "19", rest: "", full: "19 °C" });
  });
  it("千分位 + 英文单位（分隔为 digits 与 rest）", () => {
    const p = parseAnswer("500,000 tons");
    expect(p.digits).toBe("500000");
    expect(p.rest).toBe(" tons");
    expect(p.suffix).toBe("");
  });
  it("纯数字带千分位", () => {
    expect(parseAnswer("081260543216").digits).toBe("081260543216");
  });
  it("斜杠/横线分数年份整体入 rest", () => {
    expect(parseAnswer("2/3")).toEqual({ prefix: "", suffix: "", digits: "", rest: "2/3", full: "2/3" });
    expect(parseAnswer("1882-1883")).toEqual({ prefix: "", suffix: "", digits: "", rest: "1882-1883", full: "1882-1883" });
  });
});

describe("formatThousands 千分位实时补", () => {
  it("由小到大", () => {
    expect(formatThousands("5")).toBe("5");
    expect(formatThousands("5000")).toBe("5,000");
    expect(formatThousands("500000")).toBe("500,000");
    expect(formatThousands("5000000")).toBe("5,000,000");
  });
  it("小数保留", () => {
    expect(formatThousands("8.50")).toBe("8.5");
    expect(formatThousands("1234567.89")).toBe("1,234,567.89");
  });
});

describe("isCorrect 判定", () => {
  it("千分位差异判对", () => {
    const p = parseAnswer("500,000 tons");
    expect(isCorrect("500000", "tons", p)).toBe(true);
    expect(isCorrect("500,000", "tons", p)).toBe(true);
  });
  it("后缀符号无需输入", () => {
    const p = parseAnswer("19 °C");
    expect(isCorrect("19", "", p)).toBe(true);
  });
  it("货币前缀无需输入", () => {
    const p = parseAnswer("$184");
    expect(isCorrect("184", "", p)).toBe(true);
  });
  it("分数整体", () => {
    const p = parseAnswer("2/3");
    expect(isCorrect("", "2/3", p)).toBe(true);
  });
  it("大小写/空格容错", () => {
    const p = parseAnswer("100 metres");
    expect(isCorrect("100", "METRES ", p)).toBe(true);
  });
  it("错误判错", () => {
    const p = parseAnswer("$184");
    expect(isCorrect("185", "", p)).toBe(false);
  });
});

describe("normalize", () => {
  it("去逗号去空格小写", () => {
    expect(normalize("  500,000  TONS  ")).toBe("500000 tons");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/answer.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/lib/answer.ts`**

```ts
export interface ParsedAnswer {
  prefix: string;
  suffix: string;
  digits: string;
  rest: string;
  full: string;
}

const CURRENCIES = ["$", "£", "€"];
const SUFFIX_SET = ["%", "°C"];

export function parseAnswer(word: string): ParsedAnswer {
  const full = word.trim();
  let rest = full;
  let prefix = "";
  for (const c of CURRENCIES) {
    if (rest.startsWith(c)) {
      prefix = c;
      rest = rest.slice(c.length);
      break;
    }
  }
  let suffix = "";
  for (const s of SUFFIX_SET) {
    if (rest.endsWith(s)) {
      let idx = rest.length - s.length;
      if (idx > 0 && rest[idx - 1] === " ") {
        idx -= 1;
        suffix = " " + s;
      } else {
        suffix = s;
      }
      rest = rest.slice(0, idx);
      break;
    }
  }
  rest = rest.trim();
  const split = splitCore(rest);
  return { prefix, suffix, digits: split.digits, rest: split.rest, full };
}

// 仅当前缀是"数字(可含 . 与千分位,可选空格 字母单位)"时拆 digits；否则整体入 rest。
function splitCore(core: string): { digits: string; rest: string } {
  const m = core.match(/^(\d+(?:[.,]\d+)*)( *(?:[A-Za-z][A-Za-z ]*)?)$/);
  if (m) return { digits: m[1].replace(/,/g, ""), rest: m[2] };
  return { digits: "", rest: core };
}

export function formatThousands(raw: string): string {
  const neg = raw.startsWith("-");
  const s = neg ? raw.slice(1) : raw;
  const dot = s.indexOf(".");
  const int = dot >= 0 ? s.slice(0, dot) : s;
  const frac = dot >= 0 ? s.slice(dot) : "";
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + intFormatted + frac;
}

export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/,/g, "");
}

export function isCorrect(userDigits: string, userRest: string, parsed: ParsedAnswer): boolean {
  const expected = normalize(parsed.digits + " " + parsed.rest);
  const got = normalize(userDigits.replace(/,/g, "") + " " + userRest);
  return got === expected;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/answer.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5: Commit**

```bash
git add src/lib/answer.ts src/lib/answer.test.ts
git commit -m "feat: 答案解析引擎（符号预填拆分/千分位/判定）"
```

---

### Task 2: 多文件上传改造 `src/pages/admin/BooksAdmin.tsx`

**Files:**
- Modify: `src/pages/admin/BooksAdmin.tsx`

**Interfaces:**
- Consumes: `uploadWord(unitId, file, word?)` from `src/api/admin.ts`（已有，word 省略则后端取文件名）。

- [ ] **Step 1: 目录名/结构准备（无代码，仅确认 `multiple` 与过滤）**

unit 内部 `UnitRow` 的上传区域改成多选：`<input type="file" accept="audio/*" multiple>`。

- [ ] **Step 2: 改造 UnitRow 上传逻辑**

改动点（在 `src/pages/admin/BooksAdmin.tsx` 的 `UnitRow`）：
1. `const [audio, setAudio] = useState<File | null>(null)` → `const [audioFiles, setAudioFiles] = useState<File[]>([])`。
2. file input 加 `multiple`，`onChange` 过滤非音频（`accept` 已约束，再按 `file.type.startsWith("audio/")` 或常见后缀过滤），仅保留音频文件。
3. 移除 `wordInput` 输入框及相关 state/上传参数（不再需要）。
4. `upload()` 改为 `async`：对 `audioFiles` 逐个 `await uploadWord(unit.id, file)`（不传 word），收集成功/失败计数，最后 `onUploadWord` 刷新列表（新增 props 语义：`onWordUploaded` 刷新）——**复用现有** `onUploadWord(unitId, file, wordInput)` 时 wordInput 传 `undefined`，避免改 props 签名。

   ```tsx
   async function upload() {
     if (audioFiles.length === 0) {
       alert("请先选择音频文件");
       return;
     }
     let ok = 0, fail = 0;
     for (const f of audioFiles) {
       try {
         await onUploadWord(unit.id, f, undefined); // 后端取文件名
         ok++;
       } catch {
         fail++;
       }
     }
     setAudioFiles([]);
     alert(`上传完成：成功 ${ok} 个${fail ? `，失败 ${fail} 个` : ""}`);
   }
   ```
   （确保 `onUploadWord` 的 `wordInput` 参数可传 `undefined`，当前 `handleUploadWord` 中 `const word = wordInput.trim() || undefined` 已容错 `undefined` 输入 —— 需把 `wordInput: string` 放宽为 `string | undefined`。）

- [ ] **Step 3: 提交后刷新单词列表**

确认 `onUploadWord` 仍调用 `uploadWord` 后 `loadUnitWords(unitId)`，与现有 `handleUploadWord` 一致（已满足）；仅需保证循环内 `await` 串行 + 结束后刷新一次。

- [ ] **Step 4: 构建校验（类型检查主体）**

Run: `npm run build`
Expected: 编译通过

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/BooksAdmin.tsx
git commit -m "feat: 听力上传支持多文件批量上传，仅用文件名作答"
```

---

### Task 3: 分轮次听写练习重构 `src/pages/Practice.tsx`

**Files:**
- Rewrite: `src/pages/Practice.tsx`
- Modify: `src/styles.css`（追加听写样式类）

**Interfaces:**
- Consumes: `listWords(unitId)` from `src/api/listen.ts`；`parseAnswer, formatThousands, isCorrect` from `src/lib/answer.ts`.

- [ ] **Step 1: 写组件状态机设计（已批准）**

轮次模型与播放调度（实现时作为代码注释/结构）：

```ts
interface RoundItem {
  id: number;
  word: string;       // 原始答案
  audioUrl: string;
  parsed: ParsedAnswer;
}
type Phase = "ready" | "playing" | "submitted" | "done";
// 状态：
//   pool: RoundItem[]              当前轮（进入每轮时 shuffle）
//   activeIndex: number | null    当前播放下标
//   inputs: Record<number, {digits:string; rest:string}>  每 id 的用户输入
//   results: Record<number, boolean>                      提交后判定（true 正确）
//   wrongIds: Set<number>          本轮错词 id
//   phase: Phase
//   isPlaying / isPaused           播放进度控制（点击圆点复听不影响自动序列）
```

- [ ] **Step 2: 实现播放调度（自动播放 + 5 秒间隔 + 高亮）**

在 `Practice` 组件内用 `useRef<HTMLAudioElement>` 隐藏 audio 元素逐题播放。核心伪代码（实现时按 React/Hooks 落地）：

```ts
// 自动序列：audio 的 onended → 若还有下一题，setTimeout 5000ms 后播放下一题
// 整体开始：从 activeIndex 0 或暂停处播放；暂停：audio.pause()
// 高亮：audio 的 onplay 时 setActiveIndex(i)，空位照 activeIndex 高亮
// 点击圆点：仅单次播放该题（临时覆盖自动序列，autoplay 一个临时 Audio 或复用 audio）
```

循环推进逻辑（放在一个 `playItem(i)` 函数 + `clearTimeout` 引用）：

```ts
const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
function playItem(i: number) {
  setActiveIndex(i);
  const item = pool[i];
  setCurrentUrl(item.audioUrl);
  setHighlight(i);            // 高亮对应空位/圆点
  audioRef.current?.load();   // 换 src 后播
  audioRef.current?.play();
}
function onEnded() {
  if (activeIndex < pool.length - 1) {
    timer.current = setTimeout(() => playItem(activeIndex + 1), 5000);
  } else {
    setIsPlaying(false);
    // 全部播完 → 用户可点"提交判断对错"
  }
}
```

> 用隐藏 `<audio>` + 每次设置 `src` 触发 `onended`，间隔 5 秒后再播下一题。整体"开始/暂停"控制 `isPlaying` 与当前 audio 的 play/pause。

- [ ] **Step 3: 实现空位渲染（一页全部 + 高亮 + 千分位格式化输入）**

用 `pool.map((item, i) => ...)` 一页渲染全部空位。每题一行，含只读前缀/后缀符号、digits 输入框、rest 输入框、判定反馈；`activeIndex === i` 时高亮。

```tsx
// 每题状态从 inputs 取（默认空串）
// displayDigits = inputs[id]?.digits !== undefined ? formatThousands(inputs[id].digits) : ""
<div
  key={item.id}
  className={
    "listen-word-line" +
    (activeIndex === i ? " listen-word-line--active" : "") +
    (result === true ? " listen-word-line--correct" : result === false ? " listen-word-line--wrong" : "")
  }
>
  {parsed.prefix && <span className="listen-prefill">{parsed.prefix}</span>}
  {parsed.digits !== "" && (
    <input
      className="input listen-digits"
      value={formatThousands(inputs[item.id]?.digits ?? "")}
      onChange={(e) => setInput(item.id, "digits", e.target.value.replace(/[^\d.]/g, ""))}
      placeholder="数字"
    />
  )}
  {parsed.rest !== "" && (
    <input
      className="input listen-rest"
      value={inputs[item.id]?.rest ?? ""}
      onChange={(e) => setInput(item.id, "rest", e.target.value)}
      placeholder="符号/单位"
    />
  )}
  {parsed.suffix && <span className="listen-prefill">{parsed.suffix}</span>}
  {result !== undefined && (
    <span
      className={"listen-feedback" + (result ? " listen-feedback--right" : " listen-feedback--wrong")}
      title="点击圆点可复听"
    >
      {result ? "✓" : `✗ ${item.parsed.full}`}
    </span>
  )}
</div>
```

要点：
- `inputs` 存纯数字/小数（去逗号保留点），`formatThousands` 只用于显示，因此光标末尾输入的千分位自增稳定；中间编辑会有轻微重定位，本项目可接受。**注意 digits 输入必须保留小数点 `.`（只剥非数字/非点，且最多保留一个小数点），否则含小数答案（如 £8.50）永远无法判对。** input 的 onChange 用 `originalValue.replace(/[^\d.]/g, "").replace(/(\..*)\../, "$1")` 可限制单点，或用简单去重。/
- `setInput(id, key, value)` 为 `setInputs((p) => ({ ...p, [id]: { ...(p[id] ?? { digits: "", rest: "" }), [key]: value } }))`。
- 展示区顶部渲染小圆点列表：

```tsx
<div className="listen-dots">
  {pool.map((item, i) => (
    <button
      key={item.id}
      className={
        "listen-dot" +
        (activeIndex === i ? " listen-dot--active" : "") +
        (isPlayed[i] ? " listen-dot--done" : "")
      }
      onClick={() => playSingle(item.audioUrl)}
      title={item.parsed.full}
      aria-label={`复听 ${i + 1}`}
    />
  ))}
</div>
```

- [ ] **Step 4: 实现提交判定 + 下一轮循环 + 完成态**

```ts
function submit() {
  const res: Record<number, boolean> = {};
  const wrong: number[] = [];
  for (const item of pool) {
    const { digits: d = "", rest: r = "" } = inputs[item.id] ?? {};
    const c = isCorrect(d, r, item.parsed);
    res[item.id] = c;
    if (!c) wrong.push(item.id);
  }
  setResults(res);
  setPhase("submitted");
  setWrongIds(new Set(wrong));
}
function goNextRound() {
  const wrongItems = pool.filter((x) => wrongIds.has(x.id));
  if (wrongItems.length === 0) {
    setPhase("done");
  } else {
    setPool(shuffle(wrongItems)); // 浅拷贝即可（不变异原对象）
    setInputs({});
    setResults({});
    setActiveIndex(null);
    setPhase("ready");
    setTotalRounds((r) => r + 1);
  }
}
```

- 完成态：显示「本单元练习完成 🎉」，统计总轮数 `totalRounds`。第 1 轮起始 `totalRounds=1`。进入每轮 `roundNumber` 递增。
- 统一提交按钮仅在"全部播完"后启用（`!isPlaying` 且 `phase==="ready"` 且 `activeIndex === pool.length-1` 或已结束）。

- [ ] **Step 5: 追加样式到 `src/styles.css`**

在文件末尾追加（沿用现有 token）：

```css
/* ===== Listen dictation (Practice) ===== */
.listen-dots { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; justify-content: center; }
.listen-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--c-gray-200); border: 1px solid var(--border); cursor: pointer; }
.listen-dot--active { background: var(--primary); border-color: var(--primary); transform: scale(1.25); }
.listen-dot--done { background: var(--c-gray-500); border-color: var(--c-gray-500); }
.listen-controls { display: flex; gap: var(--space-3); justify-content: center; margin-bottom: var(--space-5); }
.listen-word-line { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-sm); margin-bottom: var(--space-2); background: #fff; }
.listen-word-line--active { border-color: var(--primary); box-shadow: var(--ring); background: var(--primary-soft); }
.listen-word-line--wrong { border-color: var(--danger); background: #FEF2F2; }
.listen-word-line--correct { border-color: var(--success); background: #F0FDF4; }
.listen-prefill { color: var(--fg-muted); font-size: var(--fs-lg); font-weight: 600; }
.listen-digits, .listen-rest { width: auto; min-width: 80px; }
.listen-feedback { margin-left: auto; font-weight: 600; white-space: nowrap; }
.listen-feedback--right { color: var(--success); }
.listen-feedback--wrong { color: var(--danger); }
.listen-rounded { font-size: var(--fs-sm); color: var(--fg-muted); text-align: center; margin-bottom: var(--space-4); }
```

- [ ] **Step 6: 构建 + 测试校验**

Run: `npm test && npm run build`
Expected: 全部单测通过；构建通过

- [ ] **Step 7: Commit**

```bash
git add src/pages/Practice.tsx src/styles.css
git commit -m "feat: 分轮次循环听写（播放列表/符号预填/错词重练）"
```

---

### Task 4: README 同步 + 全量回归

**Files:**
- Modify: `README.md`
- Test: `src/lib/answer.test.ts`

- [ ] **Step 1: 更新 README 听力描述**

把「听力练习」与「管理后台」描述更新，反映：上传支持一次多选音频（以文件名作答，自动预填 `$ £ € % °C`、千分位）；听写为分轮循环（播放列表 + 5 秒间隔 + 错词重练直到全对）。

- [ ] **Step 2: 全量回归**

Run: `npm test`（全部单测）+ `npm run build`
Expected: 全绿

- [ ] **Step 3: 最终提交**

```bash
git add README.md
git commit -m "docs: 同步听力上传与听写功能说明"
```
