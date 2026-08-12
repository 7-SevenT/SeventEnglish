# UI/UX 美化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为完全无样式的 SeventEnglish 前端建立原生 CSS 设计系统并美化全部 10 个页面，风格清爽现代、专注阅读。

**Architecture:** 新增单一 `src/styles.css`，用 CSS 变量三层 token（primitive→semantic→component）承载全部样式；在 `src/main.tsx` 引入。逐页为既有 JSX 元素补齐语义化 `className`，删除内联 `style`，不改任何 API/路由/数据逻辑。

**Tech Stack:** React 19 + Vite + TypeScript + 原生 CSS（无新依赖、无外链字体）。

## Global Constraints

（来自设计文档，逐条沿用）

- 仅改 `src/**`。不动 `worker/**`、`db/**`、`wrangler.toml`、`package.json`。
- 不新增任何 npm 依赖；不引入 Tailwind / shadcn / 外链字体。
- 字体栈：正文 `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif`；文章正文衬线 `Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif`。
- 全部样式集中在 `src/styles.css`；页面组件只用 `className`，不内联颜色。
- 保留现有 `window.confirm` 删除确认逻辑。
- 校验命令：`npm run build`（必须零错误通过）。
- 每任务完成后提交一次 git（提交前如 README/AGENTS.md 有相关内容需同步，已含前端样式说明）。

## 约定的 className 词汇表

（所有任务共用，确保一致性）

- 布局：`app` `container` `container--read` `page-title` `section-title` `muted` `empty` `back-link`
- 导航：`nav` `nav-inner` `nav-brand` `nav-links` `nav-link nav-link--active`
- 按钮：`btn btn--primary btn--ghost btn--danger`
- 输入：`input textarea select`
- 表单：`form-card form-actions field field-row`
- 反馈：`alert alert--success alert--error feedback` `feedback--correct feedback--wrong`
- 列表/卡片：`card-list card card-link card-title card-desc card-meta`
- 登录：`login login-card`
- 详情正文：`article-body`
- 练习：`practice progress`
- 管理：`admin-tabs tab tab--active admin-book admin-unit word-row`

---

### Task 1: 创建设计系统与全局样式（styles.css + 引入）

**Files:**
- Create: `src/styles.css`
- Modify: `src/main.tsx`

**Interfaces:**
- Produces: 全部 CSS token 与组件类。后续任务只负责在 JSX 中加与词汇表一致的 `className`，不再新增样式（除个别页面私有组件类，见各任务）。

- [ ] **Step 1: 创建 `src/styles.css`**

```css
/* ===== Token：Primitive ===== */
:root {
  --c-gray-50: #FAFAF8; --c-gray-100: #F3F4F6; --c-gray-200: #E5E7EB;
  --c-gray-500: #6B7280; --c-gray-900: #1F2937;
  --c-teal-50: #F0FDFA; --c-teal-600: #0D9488; --c-teal-700: #0F766E;
  --c-green-600: #16A34A; --c-red-600: #DC2626;

  /* Semantic */
  --bg: var(--c-gray-50); --bg-soft: var(--c-gray-100); --border: var(--c-gray-200);
  --fg: var(--c-gray-900); --fg-muted: var(--c-gray-500);
  --primary: var(--c-teal-600); --primary-hover: var(--c-teal-700); --primary-soft: var(--c-teal-50);
  --success: var(--c-green-600); --danger: var(--c-red-600);

  /* Typography */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
  --font-serif: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif;
  --fs-sm: .875rem; --fs-base: 1rem; --fs-lg: 1.125rem; --fs-xl: 1.375rem; --fs-2xl: 1.75rem;

  /* Spacing / Radius / Shadow */
  --space-1: .25rem; --space-2: .5rem; --space-3: .75rem; --space-4: 1rem; --space-5: 1.5rem; --space-6: 2rem;
  --radius-sm: .375rem; --radius: .5rem; --radius-lg: .75rem;
  --shadow-sm: 0 1px 2px rgb(0 0 0/.05); --shadow-md: 0 4px 12px rgb(0 0 0/.06); --ring: 0 0 0 3px rgb(13 148 136/.2);

  /* Component */
  --btn-bg: var(--primary); --btn-bg-hover: var(--primary-hover);
  --card-bg: #fff; --card-radius: var(--radius-lg);
}

/* ===== Reset / Base ===== */
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font-family: var(--font-sans); font-size: var(--fs-base); line-height: 1.6; -webkit-font-smoothing: antialiased; }
h1, h2, h3, p { margin: 0; }
a { color: var(--primary); text-decoration: none; }
a:hover { color: var(--primary-hover); }
ul { margin: 0; padding: 0; list-style: none; }
button { font-family: inherit; }

/* ===== Layout ===== */
.container { max-width: 760px; margin: 0 auto; padding: var(--space-6) var(--space-5) var(--space-6); }
.container--read { max-width: 720px; }
.page-title { font-size: var(--fs-2xl); font-weight: 700; margin-bottom: var(--space-5); letter-spacing: -.01em; }
.section-title { font-size: var(--fs-sm); font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--fg-muted); margin: var(--space-5) 0 var(--space-3); }
.muted { color: var(--fg-muted); }
.empty { color: var(--fg-muted); margin: var(--space-4) 0; }
.back-link { display: inline-block; color: var(--fg-muted); font-size: var(--fs-sm); margin-bottom: var(--space-4); }
.back-link:hover { color: var(--primary); }

/* ===== Nav ===== */
.nav { position: sticky; top: 0; background: #fff; border-bottom: 1px solid var(--border); z-index: 10; }
.nav-inner { max-width: 960px; margin: 0 auto; height: 60px; display: flex; align-items: center; justify-content: space-between; padding: 0 var(--space-5); }
.nav-brand { font-weight: 700; font-size: var(--fs-lg); color: var(--fg); letter-spacing: -.02em; }
.nav-brand span { color: var(--primary); }
.nav-links { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.nav-link { padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); color: var(--fg-muted); font-size: var(--fs-sm); font-weight: 500; }
.nav-link:hover { color: var(--fg); background: var(--bg-soft); }
.nav-link--active { color: var(--primary); background: var(--primary-soft); }

/* ===== Buttons ===== */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: var(--space-2) var(--space-4); border-radius: var(--radius-sm); border: 1px solid transparent; font-size: var(--fs-sm); font-weight: 600; cursor: pointer; transition: background .15s ease, color .15s ease, border-color .15s ease; }
.btn:focus-visible { outline: none; box-shadow: var(--ring); }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn--primary { background: var(--btn-bg); color: #fff; }
.btn--primary:hover { background: var(--btn-bg-hover); }
.btn--ghost { background: transparent; color: var(--fg-muted); border-color: var(--border); }
.btn--ghost:hover { color: var(--fg); border-color: var(--c-gray-500); background: var(--bg-soft); }
.btn--danger { background: #fff; color: var(--danger); border-color: #FECACA; }
.btn--danger:hover { background: #FEF2F2; border-color: var(--danger); }
.btn--sm { padding: var(--space-1) var(--space-3); font-size: var(--fs-sm); }

/* ===== Inputs ===== */
.input, .textarea { width: 100%; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: var(--fs-base); font-family: inherit; background: #fff; transition: border-color .15s ease, box-shadow .15s ease; }
.input:focus, .textarea:focus, .select:focus { outline: none; border-color: var(--primary); box-shadow: var(--ring); }
.textarea { resize: vertical; line-height: 1.6; }
.select { padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: var(--fs-base); background: #fff; font-family: inherit; }

/* ===== Form ===== */
.form-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-5); margin-bottom: var(--space-5); }
.form-card legend { font-size: var(--fs-base); font-weight: 700; padding: 0 var(--space-2); color: var(--fg); }
.field { margin-bottom: var(--space-4); }
.field label { display: block; font-size: var(--fs-sm); font-weight: 600; margin-bottom: var(--space-2); color: var(--fg); }
.field-row { display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: flex-end; }
.field-row .field { margin-bottom: 0; flex: 1; min-width: 200px; }
.field-row .field--auto { flex: 0 0 auto; }
.form-actions { display: flex; gap: var(--space-3); margin-top: var(--space-4); }

/* ===== Feedback ===== */
.alert { padding: var(--space-3) var(--space-4); border-radius: var(--radius-sm); font-size: var(--fs-sm); margin-bottom: var(--space-4); }
.alert--error { background: #FEF2F2; color: var(--danger); border: 1px solid #FECACA; }
.alert--success { background: #F0FDF4; color: var(--success); border: 1px solid #BBF7D0; }
.feedback { font-weight: 600; margin-top: var(--space-3); }
.feedback--correct { color: var(--success); }
.feedback--wrong { color: var(--danger); }

/* ===== Cards / Lists ===== */
.card-list { display: grid; gap: var(--space-3); }
.card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-4) var(--space-5); transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease; }
.card-link { display: block; }
.card-link:hover { border-color: var(--primary); box-shadow: var(--shadow-md); transform: translateY(-1px); }
.card-title { font-size: var(--fs-lg); font-weight: 600; color: var(--fg); }
.card-title::after { content: " →"; color: var(--primary); opacity: .6; }
.card-desc { color: var(--fg-muted); font-size: var(--fs-sm); margin-top: var(--space-1); }
.card-meta { color: var(--fg-muted); font-size: var(--fs-sm); margin-top: var(--space-1); }

/* ===== Login ===== */
.login { min-height: calc(100vh - 60px); display: flex; align-items: center; justify-content: center; padding: var(--space-5); }
.login-card { width: 100%; max-width: 380px; background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-6); box-shadow: var(--shadow-md); }
.login-card h1 { font-size: var(--fs-xl); margin-bottom: var(--space-5); text-align: center; }
.login-card .form-actions { margin-top: var(--space-5); }

/* ===== Article body ===== */
.article-body { font-family: var(--font-serif); font-size: var(--fs-lg); line-height: 1.8; white-space: pre-wrap; word-break: break-word; margin-top: var(--space-5); color: #2d3436; }
.article-date { color: var(--fg-muted); font-size: var(--fs-sm); margin-top: var(--space-2); }

/* ===== Practice ===== */
.practice-card { max-width: 560px; margin: 0 auto; text-align: center; }
.progress { font-size: var(--fs-sm); color: var(--fg-muted); margin-bottom: var(--space-4); }
.audio-wrap { margin: var(--space-4) 0; }
.practice-input { max-width: 340px; margin: 0 auto var(--space-3); }
.practice-actions { display: flex; gap: var(--space-3); justify-content: center; }

/* ===== Admin ===== */
.admin-tabs { display: flex; gap: var(--space-2); border-bottom: 1px solid var(--border); margin-bottom: var(--space-5); }
.tab { padding: var(--space-2) var(--space-4); color: var(--fg-muted); font-weight: 600; font-size: var(--fs-sm); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab:hover { color: var(--fg); }
.tab--active { color: var(--primary); border-bottom-color: var(--primary); }
.admin-book { margin-bottom: var(--space-4); }
.admin-book-head { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.admin-book-head .btn { margin-left: auto; }
.admin-unit { background: var(--bg-soft); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-4); margin-top: var(--space-3); }
.admin-unit-head { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-3); }
.add-form { background: var(--bg-soft); border: 1px dashed var(--border); border-radius: var(--radius-sm); padding: var(--space-4); margin-bottom: var(--space-3); }
.add-form legend { font-size: var(--fs-sm); font-weight: 700; padding: 0 var(--space-2); color: var(--fg-muted); }
.add-form .field-row { margin-top: var(--space-3); }
.word-row { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px dashed var(--border); }
.word-row:last-child { border-bottom: none; }
.word-row .word { font-weight: 600; flex: 1; }
.admin-list-row { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--border); }
.admin-list-row:last-child { border-bottom: none; }
.admin-list-row .grow { flex: 1; min-width: 0; }
.admin-list-row .muted { font-size: var(--fs-sm); }
```

- [ ] **Step 2: 在 `src/main.tsx` 引入样式**

在文件顶部、现有 import 之后添加：
```tsx
import "./styles.css";
```

- [ ] **Step 3: 校验构建**

Run: `npm run build`
Expected: 构建成功，无 TS/CSS 错误。

- [ ] **Step 4: Commit**

```bash
git add src/styles.css src/main.tsx
git commit -m "style: 引入原生 CSS 设计系统与全局基础样式"
```

---

### Task 2: 顶部导航与应用骨架

**Files:**
- Modify: `src/components/Nav.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: 词汇表 `nav*` 类、`useAuth`（`App.tsx` 当前 import）。
- Produces: `<Nav />` 组件，供 `App.tsx` 渲染为全局顶栏，位于 `<Routes>` 同级外层。

- [ ] **Step 1: 实现 `src/components/Nav.tsx`**

将当前 `export function Nav() { return null; }` 替换为：
```tsx
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Nav() {
  const { authenticated, logout } = useAuth();
  return (
    <header className="nav">
      <div className="nav-inner">
        <NavLink to="/read" className="nav-brand">
          Sevent<span>English</span>
        </NavLink>
        {authenticated && (
          <nav className="nav-links">
            <NavLink to="/read" className={({ isActive }) => "nav-link" + (isActive ? " nav-link--active" : "")}>阅读</NavLink>
            <NavLink to="/listen" className={({ isActive }) => "nav-link" + (isActive ? " nav-link--active" : "")}>听力</NavLink>
            <NavLink to="/settings" className={({ isActive }) => "nav-link" + (isActive ? " nav-link--active" : "")}>设置</NavLink>
            <NavLink to="/admin/articles" className={({ isActive }) => "nav-link" + (isActive ? " nav-link--active" : "")}>管理</NavLink>
          </nav>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: 改写 `src/App.tsx` 使用 Nav**

删除 `App.tsx` 顶部 import 里的 `Link`（现仅 `BrowserRouter, Navigate, Route, Routes` 需要）；import `Nav`；删除原 `<nav>...</nav>` 块，在 `<BrowserRouter>` 内、`<Routes>` 前渲染 `<Nav />`。

改造后 `App` 返回：
```tsx
return (
  <AuthProvider>
    <BrowserRouter>
      <Nav />
      <Routes>
        {/* Routes 内容保持不变 */}
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);
```

- [ ] **Step 3: 校验构建**

Run: `npm run build`
Expected: 成功。（`Nav.tsx` 的原 `return null` 已替换，`logout` 未使用不影响编译——若无 eslint 拦截即可接受。）

- [ ] **Step 4: Commit**

```bash
git add src/components/Nav.tsx src/App.tsx
git commit -m "feat: 顶部吸顶导航与应用骨架"
```

---

### Task 3: 登录页

**Files:**
- Modify: `src/pages/Login.tsx`

**Interfaces:**
- Consumes: `login`、`login-card`、`btn btn--primary`、`input`、`alert alert--error`、`form-actions`、`field` 类。
- Produces: 无新接口。

- [ ] **Step 1: 改写 `src/pages/Login.tsx` 的 render 与错误区**

保留全部逻辑与 handler 不变（onSubmit、from、useAuth.login），仅替换 JSX 与内联样式：

原 `<form onSubmit={...}>` 改为：
```tsx
<div className="login">
  <form className="login-card" onSubmit={async (e) => { /* 原逻辑原样保留 */ }}>
    <h1>登录</h1>
    <div className="field">
      <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请输入密码" autoFocus />
    </div>
    <div className="form-actions">
      <button className="btn btn--primary" type="submit">登录</button>
    </div>
    {error && <p className="alert alert--error" role="alert">{error}</p>}
  </form>
</div>
```
> 注意：`form-actions` 的 flex 布局下按钮宽度自适应；如需占满可加 `style={{ width: "100%" }}`，但优先纯 CSS。

- [ ] **Step 2: 校验构建**

Run: `npm run build` — Expected: 成功。

- [ ] **Step 3: Commit**

```bash
git add src/pages/Login.tsx
git commit -m "style: 美化登录页（居中卡片 + 标准表单反馈）"
```

---

### Task 4: 阅读时间线页

**Files:**
- Modify: `src/pages/Read.tsx`

**Interfaces:**
- Consumes: `card-list`、`card card-link card-title card-meta`、`section-title`、`empty` 类。

- [ ] **Step 1: 改写 `src/pages/Read.tsx`**

保留加载/错误逻辑不变。替换返回 JSX：
```tsx
return (
  <div className="container">
    <h1 className="page-title">阅读时间线</h1>
    {error && <p className="alert alert--error">{error}</p>}
    {groups.length === 0 && !error && <p className="empty">暂无文章</p>}
    {groups.map((g) => (
      <section key={g.date}>
        <h2 className="section-title">{g.date}</h2>
        <ul className="card-list">
          {g.articles.map((a) => (
            <li key={a.id}>
              <Link className="card card-link" to={`/read/${a.id}`}>
                <span className="card-title">{a.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    ))}
  </div>
);
```

- [ ] **Step 2: 校验构建**

Run: `npm run build` — Expected: 成功。

- [ ] **Step 3: Commit**

```bash
git add src/pages/Read.tsx
git commit -m "style: 美化阅读时间线页（卡片化 + 日期分组）"
```

---

### Task 5: 文章详情页

**Files:**
- Modify: `src/pages/ArticleDetail.tsx`

**Interfaces:**
- Consumes: `container container--read`、`back-link`、`page-title`、`article-date`、`article-body`、`muted`、`empty` 类。

- [ ] **Step 1: 改写 `src/pages/ArticleDetail.tsx`**

保留加载/错误逻辑。替换返回 JSX：
```tsx
return (
  <div className="container container--read">
    <Link className="back-link" to="/read">← 返回时间线</Link>
    <h1 className="page-title">{article.title}</h1>
    <p className="article-date muted">{article.publish_date}</p>
    <div className="article-body">{article.content}</div>
  </div>
);
```
> 同时把顶部错误与加载分支的 return 也改为使用 `.container ` 包裹 / `.alert` / `.empty`：
> - `if (error) return <div className="container container--read"><p className="alert alert--error">{error}</p></div>;`
> - `if (!article) return <div className="container container--read"><p className="empty">加载中…</p></div>;`

- [ ] **Step 2: 校验构建**

Run: `npm run build` — Expected: 成功。

- [ ] **Step 3: Commit**

```bash
git add src/pages/ArticleDetail.tsx
git commit -m "style: 美化文章详情页（衬线专注阅读排版）"
```

---

### Task 6: 听力页与单元页

**Files:**
- Modify: `src/pages/Listen.tsx`
- Modify: `src/pages/BookUnits.tsx`

**Interfaces:**
- Consumes: `container`、`page-title`、`card-list card card-link card-title card-desc card-meta`、`empty`、`back-link`、`section-title`。

- [ ] **Step 1: 改写 `src/pages/Listen.tsx`**

保留加载逻辑。替换返回 JSX：
```tsx
return (
  <div className="container">
    <h1 className="page-title">选择单词书</h1>
    {books.length === 0 && <p className="empty">暂无单词书，请先在管理后台创建。</p>}
    <ul className="card-list">
      {books.map((b) => (
        <li key={b.id}>
          <Link className="card card-link" to={`/listen/${b.id}`}>
            <span className="card-title">{b.name}</span>
            {b.description ? <span className="card-desc">{b.description}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  </div>
);
```

- [ ] **Step 2: 改写 `src/pages/BookUnits.tsx`**

替换返回 JSX：
```tsx
return (
  <div className="container">
    <Link className="back-link" to="/listen">← 返回单词书</Link>
    <h1 className="page-title">选择单元</h1>
    {units.length === 0 && <p className="empty">暂无单元。</p>}
    <ul className="card-list">
      {units.map((u) => (
        <li key={u.id}>
          <Link className="card card-link" to={`/listen/${bookId}/${u.id}`}>
            <span className="card-title">{u.name}</span>
            <span className="card-meta">#{u.id}</span>
          </Link>
        </li>
      ))}
    </ul>
  </div>
);
```

- [ ] **Step 3: 校验构建**

Run: `npm run build` — Expected: 成功。

- [ ] **Step 4: Commit**

```bash
git add src/pages/Listen.tsx src/pages/BookUnits.tsx
git commit -m "style: 美化单词书与单元选择页（卡片网格）"
```

---

### Task 7: 听写练习页

**Files:**
- Modify: `src/pages/Practice.tsx`

**Interfaces:**
- Consumes: `container`、`back-link`、`page-title`、`practice-card`、`progress`、`audio-wrap`、`input practice-input`、`practice-actions`、`btn btn--primary btn--ghost`、`feedback feedback--correct/wrong`、`empty`。

- [ ] **Step 1: 改写 `src/pages/Practice.tsx` 的返回 JSX**

保留全部逻辑（shuffle、check、next、audioUrl）。仅替换 return 里的 JSX 与内联颜色：

```tsx
return (
  <div className="container">
    <Link className="back-link" to="/listen">← 返回</Link>
    <div className="practice-card">
      <h1 className="page-title">听写练习</h1>
      {!current ? (
        <p className={words.length === 0 ? "empty" : ""}>
          {words.length === 0 ? "本单元暂无单词。" : "练习完成！"}
        </p>
      ) : (
        <>
          <p className="progress">第 {index + 1} / {order.length} 题</p>
          {audioUrl && <div className="audio-wrap"><audio controls src={audioUrl} /></div>}
          <div className="practice-input">
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !feedback) check(); if (e.key === "Enter" && feedback) next(); }}
              placeholder="输入听到的单词"
            />
          </div>
          <div className="practice-actions">
            <button className="btn btn--primary" onClick={() => (feedback ? next() : check())}>
              {feedback ? "下一题" : "提交"}
            </button>
          </div>
          {feedback === "correct" && <p className="feedback feedback--correct">正确 ✅</p>}
          {feedback === "wrong" && (
            <p className="feedback feedback--wrong">错误 ❌ 正确答案：{current.word}</p>
          )}
        </>
      )}
    </div>
  </div>
);
```

- [ ] **Step 2: 校验构建**

Run: `npm run build` — Expected: 成功。

- [ ] **Step 3: Commit**

```bash
git add src/pages/Practice.tsx
git commit -m "style: 美化听写练习页（居中卡片 + 进度 + 反馈）"
```

---

### Task 8: 设置页

**Files:**
- Modify: `src/pages/Settings.tsx`

**Interfaces:**
- Consumes: `container`、`page-title`、`card`、`muted`、`btn btn--danger`。

- [ ] **Step 1: 改写 `src/pages/Settings.tsx`**

替换返回 JSX：
```tsx
return (
  <div className="container">
    <h1 className="page-title">设置</h1>
    <div className="card">
      <p className="muted">设置项将在后续迭代中补充（练习偏好、音频速度、学习统计等）。</p>
      <div style={{ marginTop: "1rem" }}>
        <button className="btn btn--danger" onClick={() => void logout()}>退出登录</button>
      </div>
    </div>
  </div>
);
```

- [ ] **Step 2: 校验构建**

Run: `npm run build` — Expected: 成功。

- [ ] **Step 3: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "style: 美化设置页（卡片 + 危险色退出）"
```

---

### Task 9: 管理后台布局

**Files:**
- Modify: `src/pages/admin/AdminLayout.tsx`

**Interfaces:**
- Consumes: `container`、`admin-tabs tab tab--active`、`page-title`。

- [ ] **Step 1: 改写 `src/pages/admin/AdminLayout.tsx`**

保留 `NavLink, Outlet` import。替换返回 JSX：
```tsx
return (
  <div className="container">
    <h1 className="page-title">管理后台</h1>
    <nav className="admin-tabs">
      <NavLink to="/admin/articles" className={({ isActive }) => "tab" + (isActive ? " tab--active" : "")}>文章</NavLink>
      <NavLink to="/admin/books" className={({ isActive }) => "tab" + (isActive ? " tab--active" : "")}>单词书</NavLink>
    </nav>
    <Outlet />
  </div>
);
```

- [ ] **Step 2: 校验构建**

Run: `npm run build` — Expected: 成功。

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/AdminLayout.tsx
git commit -m "style: 管理后台 Tab 导航布局"
```

---

### Task 10: 文章管理页

**Files:**
- Modify: `src/pages/admin/ArticlesAdmin.tsx`

**Interfaces:**
- Consumes: `message/error` 区用 `alert alert--success/error`；表单用 `form-card field field-row form-actions`；列表用 `admin-list-row`、`btn btn--sm btn--primary btn--danger btn--ghost`、`grow`、`muted`。

- [ ] **Step 1: 改写表单与列表区**

保留全部逻辑（load/startEdit/setField/handleSave/cancelEdit/handleDelete）与输入值绑定不变。替换 `fieldset` 为 `form-card` 结构、内联 `style={{color:...}}` 改类：

```tsx
return (
  <div>
    {message && <p className="alert alert--success">{message}</p>}
    {error && <p className="alert alert--error">{error}</p>}

    <fieldset className="form-card">
      <legend>{editingId !== null ? `编辑文章 #${editingId}` : "新增文章"}</legend>
      <div className="field-row">
        <div className="field">
          <label>标题</label>
          <input className="input" value={draft.title} onChange={(e) => setField("title", e.target.value)} />
        </div>
        <div className="field field--auto">
          <label>发布日期</label>
          <input className="input" type="date" value={draft.publish_date} onChange={(e) => setField("publish_date", e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>内容（Markdown）</label>
        <textarea className="textarea" rows={8} value={draft.content} onChange={(e) => setField("content", e.target.value)} />
      </div>
      <div className="form-actions">
        <button className="btn btn--primary" onClick={handleSave}>{editingId !== null ? "保存" : "创建"}</button>
        {editingId !== null && <button className="btn btn--ghost" onClick={cancelEdit}>取消</button>}
      </div>
    </fieldset>

    {articles.length === 0 && <p className="empty">暂无文章</p>}
    <ul>
      {articles.map((a) => (
        <li key={a.id} className="admin-list-row">
          <span className="grow">
            <strong>{a.title}</strong> <span className="muted">— {a.publish_date}</span>
          </span>
          <button className="btn btn--ghost btn--sm" onClick={() => startEdit(a)}>编辑</button>
          <button className="btn btn--danger btn--sm" onClick={() => handleDelete(a.id)}>删除</button>
        </li>
      ))}
    </ul>
  </div>
);
```
> 外层容器：ArticlesAdmin 在 `<Outlet />` 内已被 AdminLayout 的 `container` 包裹，故本组件顶层保持 `<div>` 而非再套 container，避免双击容器。同理 BooksAdmin。

- [ ] **Step 2: 校验构建**

Run: `npm run build` — Expected: 成功。

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/ArticlesAdmin.tsx
git commit -m "style: 美化文章管理页（表单卡片 + 列表行）"
```

---

### Task 11: 单词书管理页

**Files:**
- Modify: `src/pages/admin/BooksAdmin.tsx`

**Interfaces:**
- Consumes: `alert`、`form-card`、`field-row field field--auto`、`admin-book card`、`admin-book-head`、`admin-unit`、`admin-unit-head`、`add-form`、`word-row`、`btn btn--sm btn--primary btn--ghost btn--danger`、`input textarea`、`muted`、`empty`、`word`。

- [ ] **Step 1: 改写外层单词书列表与新增表单**

保留全部逻辑（loadBooks/loadUnits/toggleBook/loadUnitWords/各 handle）与文件/输入绑定不变。将 return 中：
- message/error 区 → `alert alert--success` / `alert alert--error`。
- 外层"新增单词书" `<fieldset>` → `fieldset.form-card`，内部两个 input 放 `div.field`（用 `.field-row` + `.field--auto` 控制宽度），按钮放 `.form-actions`。
- 每个单词书 `<section style={{border...}}>` → `section.card.admin-book`；头部按钮组 → `div.admin-book-head`（展开/收起 → `btn btn--ghost btn--sm`，删除 → `btn btn--danger btn--sm`）；书名 `strong` 保留。
- 展开区内"新增单元" `fieldset` → `fieldset.form-card`，input 用 `field`.

- [ ] **Step 2: 改写 UnitRow 子组件**

保留逻辑（showWords/upload/onUploadWord）。改为：
```tsx
return (
  <div className="admin-unit">
    <div className="admin-unit-head">
      <strong>{unit.name}</strong> <span className="muted">#{unit.id}</span>
      <button className="btn btn--danger btn--sm" onClick={onDeleteUnit}>删除单元</button>
    </div>

    <fieldset className="add-form">
      <legend>添加单词音频</legend>
      <div className="field-row">
        <div className="field">
          <input type="file" accept="audio/*" onChange={(e) => setAudio(e.target.files?.[0] ?? null)} />
        </div>
        <div className="field">
          <input className="input" placeholder="单词（留空则用音频文件名）" value={wordInput} onChange={(e) => setWordInput(e.target.value)} />
        </div>
        <div className="field field--auto">
          <button className="btn btn--primary" onClick={upload}>上传</button>
        </div>
      </div>
    </fieldset>

    <button className="btn btn--ghost btn--sm" onClick={showWords}>显示单词</button>
    {loading && <span className="muted"> 加载中…</span>}
    {words !== null && !loading && (
      <>
        {words.length === 0 && <p className="empty">暂无单词</p>}
        <ul>
          {words.map((w) => (
            <li key={w.id} className="word-row">
              <span className="word">{w.word}</span>
              <button className="btn btn--danger btn--sm" onClick={() => onDeleteWord(unit.id, w.id)}>删除</button>
            </li>
          ))}
        </ul>
      </>
    )}
  </div>
);
```

- [ ] **Step 3: 校验构建**

Run: `npm run build` — Expected: 成功。

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/BooksAdmin.tsx
git commit -m "style: 美化单词书管理页（可展开卡片 + 嵌套单元行）"
```

---

### Task 12: 端到端验证与收尾

**Files:**
- 校验：`npm run build`、`npx vitest run worker/src/db.test.ts`（确认未破坏后端）。

**Interfaces:**
- 依赖：Task 1–11 全部完成。

- [ ] **Step 1: 全量构建与测试**

Run: `npm run build && npx vitest run worker/src/db.test.ts`
Expected: 构建零错误；db 测试全部 PASS（本任务仅改前端，不应影响 worker 测试，作为回归）。

- [ ] **Step 2: 人工抽查**

如果本地可跑 `npm run dev`，浏览器打开 `/login`、`/read`、`/listen`、`/admin/articles`、`/admin/books` 目检布局、hover、focus ring、响应式。

- [ ] **Step 3: 最终提交（如 Step 1/2 有残留改动）**

```bash
git add -A
git commit -m "style: UI/UX 美化收尾与回归校验"
```

## Self-Review

**1. Spec coverage（对照设计文档）:**
- 设计 token / 语义变量 → Task 1 ✓
- 顶栏吸顶导航 + 骨架 → Task 2 ✓
- Login 居中卡片 → Task 3 ✓
- Read 时间线卡片化 → Task 4 ✓
- ArticleDetail 衬线阅读排版 → Task 5 ✓
- Listen 卡片网格 / BookUnits 卡片 → Task 6 ✓
- Practice 练习卡片 + 进度 + 反馈 → Task 7 ✓
- Settings 卡片 + 危险退出 → Task 8 ✓
- AdminLayout Tab → Task 9 ✓
- ArticlesAdmin 表单/列表 → Task 10 ✓
- BooksAdmin 可展开卡片 → Task 11 ✓
- 无暗色/Markdown（界外）→ 已列入范围边界，不实现 ✓
- 不新增依赖 / 仅改 src → Global Constraints ✓

**2. Placeholder scan:** 每步均含完整代码或精确 className，无 TBD/TODO；验证命令与期望结果明确。

**3. Type consistency:** 词汇表统一；`Nav` 在 Task 2 定义且 Task 2 使用；`useAuth` 的 `authenticated/logout` 与 AuthContext 导出一致（`authenticated: boolean; logout: () => Promise<void>`）。各 Task 引用的类名均在 Task 1 的 styles.css 中定义，无悬空引用。
