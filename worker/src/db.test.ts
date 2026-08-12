import { describe, it, expect } from "vitest";
import {
  applySchema,
  defaultSchema,
  createArticle,
  listArticlesGroupedByDate,
  getArticle,
  getArticleAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getArticleNote,
  upsertArticleNote,
} from "./db";

interface MockState {
  tables: Map<string, any[]>;
  executed: string[];
  lastId: number | null;
}

/**
 * 一个针对 db.ts 实际 SQL 子集的轻量内存 mock。
 * 不引入新依赖、不使用 node:sqlite，仅模拟 D1Database 的
 * prepare().run()/first()/all() 与 bind() 调用路径。
 */
function mockD1(): D1Database & { __state: MockState } {
  const tables = new Map<string, any[]>();
  const executed: string[] = [];
  let lastId: number | null = null;
  let counter = 1;

  const getTable = (name: string) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  };

  const apply = (stmt: string, paramsIn: unknown[]): any => {
    const sql = stmt.trim();

    if (/^CREATE\s+/i.test(sql) || /^CREATE\s+INDEX/i.test(sql)) {
      return { success: true, results: [] as any[] };
    }

    const ins = sql.match(/^INSERT\s+INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES/i);
    if (ins) {
      const table = ins[1];
      const cols = ins[2].split(",").map((c) => c.trim());
      const row: any = {};
      cols.forEach((c, i) => (row[c] = paramsIn[i]));

      if (table === "articles") {
        row.analysis_status = row.analysis_status ?? "pending";
        row.analysis_json = row.analysis_json ?? null;
        row.analysis_error = row.analysis_error ?? null;
        row.created_at = row.created_at ?? "2026-01-01 00:00:00";
        row.updated_at = row.updated_at ?? "2026-01-01 00:00:00";
        row.id = counter++;
        lastId = row.id;
        getTable(table).push(row);
        return { success: true, results: [] as any[] };
      }

      const isUpsert = /ON\s+CONFLICT/i.test(sql);
      if (isUpsert) {
        const conflictMatch = sql.match(/ON\s+CONFLICT\((\w+)\)/i);
        const conflictCol = conflictMatch?.[1] ?? "article_id";
        const conflictVal = paramsIn[cols.indexOf(conflictCol)];
        const existing = getTable(table).find((r) => r[conflictCol] === conflictVal);
        if (existing) {
          const setMatch = sql.match(/DO\s+UPDATE\s+SET\s+(.+)$/i);
          if (setMatch) {
            setMatch[1]
              .split(",")
              .map((s) => s.trim())
              .forEach((assign) => {
                const m = assign.match(/^(\w+)\s*=\s*excluded\.(\w+)/i);
                if (m) existing[m[1]] = row[m[2]] ?? paramsIn[cols.indexOf(m[2])];
                const dt = assign.match(/^(\w+)\s*=\s*datetime/i);
                if (dt) existing[dt[1]] = "2026-01-02 00:00:00";
              });
          }
          return { success: true, results: [] as any[] };
        }
      }

      row.id = counter++;
      lastId = row.id;
      row.created_at = row.created_at ?? "2026-01-01 00:00:00";
      row.updated_at = row.updated_at ?? "2026-01-01 00:00:00";
      getTable(table).push(row);
      return { success: true, results: [] as any[] };
    }

    const upd = sql.match(/^UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(\w+)\s*=\s*\?/i);
    if (upd) {
      const [, table, setPart, whereCol] = upd;
      const params = [...paramsIn];
      const assigns = setPart.split(",").map((s) => s.trim());
      const sets: { col: string; val: unknown }[] = [];
      assigns.forEach((a) => {
        if (/=\s*\?/.test(a)) {
          const col = a.match(/^(\w+)/)![1];
          sets.push({ col, val: params.shift() });
        } else {
          const m = a.match(/^(\w+)\s*=\s*datetime/i);
          if (m) sets.push({ col: m[1], val: "2026-01-02 00:00:00" });
        }
      });
      const whereVal = params.shift();
      getTable(table).forEach((r) => {
        if (r[whereCol] === whereVal) sets.forEach((sv) => (r[sv.col] = sv.val));
      });
      return { success: true, results: [] as any[] };
    }

    const del = sql.match(/^DELETE\s+FROM\s+(\w+)\s+WHERE\s+(\w+)\s*=\s*\?/i);
    if (del) {
      const [, table, whereCol] = del;
      const whereVal = paramsIn[0];
      const t = getTable(table);
      for (let i = t.length - 1; i >= 0; i--) {
        if (t[i][whereCol] === whereVal) t.splice(i, 1);
      }
      return { success: true, results: [] as any[] };
    }

    if (/last_insert_rowid/.test(sql)) {
      return { results: [{ id: lastId }], meta: {} };
    }

    const sel = sql.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+(\w+)/i);
    if (sel) {
      const cols = sel[1];
      const table = sel[2];
      if (table === "articles" && /json_group_array/.test(sql)) {
        // 复用旧的分组逻辑以保持向后兼容
        const grouped = new Map<string, { id: number; title: string }[]>();
        for (const r of getTable("articles")) {
          const g = grouped.get(r.publish_date) ?? [];
          g.push({ id: r.id, title: r.title });
          grouped.set(r.publish_date, g);
        }
        const results = [...grouped.entries()]
          .map(([date, arts]) => ({
            publish_date: date,
            articles: JSON.stringify(arts),
          }))
          .sort((a, b) => (a.publish_date < b.publish_date ? 1 : -1));
        return { results, meta: {} };
      }
      let rows = getTable(table).slice();
      const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
      if (whereMatch) {
        const wCol = whereMatch[1];
        const wVal = paramsIn[0];
        rows = rows.filter((r) => r[wCol] === wVal);
      }
      if (/ORDER BY from_position/i.test(sql)) {
        rows.sort((a, b) => a.from_position - b.from_position || a.id - b.id);
      }
      if (/^SELECT\s+\*/i.test(sql)) {
        return { results: rows.map((r) => ({ ...r })), meta: {} };
      }
      if (cols.trim() === "value") {
        return { results: rows.map((r) => ({ value: r.value })), meta: {} };
      }
      return { results: rows.map((r) => ({ ...r })), meta: {} };
    }

    return { results: [] as any[], meta: {} };
  };

  const makeBound = (stmt: string, params: unknown[]) => ({
    run: async () => apply(stmt, params),
    first: async () => (await apply(stmt, params)).results[0] ?? null,
    all: async () => apply(stmt, params),
  });

  const api = {
    exec: async (_sql: string) => ({ success: true }),
    prepare(stmt: string) {
      executed.push(stmt);
      let params: unknown[] = [];
      const run = async () => apply(stmt, params);
      const first = async () => (await apply(stmt, params)).results[0] ?? null;
      const all = async () => apply(stmt, params);
      const bind = (...p: unknown[]) => {
        params = p;
        return makeBound(stmt, p);
      };
      // return bound also exposes run/first/all on bound object
      Object.assign(bind, { run, first, all });
      return { run, first, all, bind };
    },
  };

  return Object.assign(api as unknown as D1Database, {
    __state: { tables, executed, lastId },
  });
}

describe("applySchema", () => {
  it("创建 annotations 与 article_notes 表，并为 articles 增加分析字段", async () => {
    const db = mockD1();
    await applySchema(db);
    const state = (db as any).__state as MockState;
    const createStmts = state.executed
      .filter((s) => /^CREATE\s+TABLE/i.test(s.trim()))
      .join("\n");
    expect(createStmts).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+annotations/i);
    expect(createStmts).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+article_notes/i);
    expect(createStmts).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+articles/i);

    // articles 表内嵌分析字段
    const articlesStmt = state.executed.find((s) =>
      /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+articles/i.test(s.trim())
    )!;
    expect(articlesStmt).toContain("analysis_status");
    expect(articlesStmt).toContain("analysis_json");
    expect(articlesStmt).toContain("analysis_error");

    // 索引
    const indexStmts = state.executed.filter((s) => /^CREATE\s+INDEX/i.test(s.trim()));
    expect(indexStmts.some((s) => /idx_annotations_article_id/.test(s))).toBe(true);
    expect(indexStmts.some((s) => /idx_article_notes_article_id/.test(s))).toBe(true);
  });

  it("defaultSchema 对 annotations 与 article_notes 声明 ON DELETE CASCADE", () => {
    // 文章关联数据删除所需的 SQL：外键级联
    const annotationsBlock = defaultSchema.slice(
      defaultSchema.indexOf("CREATE TABLE IF NOT EXISTS annotations"),
      defaultSchema.indexOf("CREATE TABLE IF NOT EXISTS article_notes")
    );
    expect(annotationsBlock).toContain("ON DELETE CASCADE");

    const notesBlock = defaultSchema.slice(
      defaultSchema.indexOf("CREATE TABLE IF NOT EXISTS article_notes"),
      defaultSchema.indexOf("CREATE INDEX IF NOT EXISTS idx_articles_publish_date")
    );
    expect(notesBlock).toContain("ON DELETE CASCADE");
    expect(notesBlock).toContain("article_id INTEGER NOT NULL UNIQUE");
  });
});

describe("articles analysis fields", () => {
  it("新建文章默认返回 analysis_status/analysis_json/analysis_error", async () => {
    const db = mockD1();
    await createArticle(db, { title: "A", content: "hi", publish_date: "2026-08-01" });
    const one = await getArticle(db, 1);
    expect(one).not.toBeNull();
    expect(one!.analysis_status).toBe("pending");
    expect(one!.analysis_json).toBeNull();
    expect(one!.analysis_error).toBeNull();
  });
});

describe("articles", () => {
  it("creates and lists grouped by date", async () => {
    const db = mockD1();
    await createArticle(db, { title: "A", content: "hi", publish_date: "2026-08-01" });
    await createArticle(db, { title: "B", content: "yo", publish_date: "2026-08-01" });
    await createArticle(db, { title: "C", content: "zz", publish_date: "2026-08-02" });

    const grouped = await listArticlesGroupedByDate(db);
    expect(grouped.length).toBe(2);
    expect(grouped[0].date).toBe("2026-08-02");
    expect(grouped[0].articles.length).toBe(1);
    expect(grouped[1].articles.length).toBe(2);

    const one = await getArticle(db, 1);
    expect(one?.title).toBe("A");
  });
});

describe("annotations CRUD", () => {
  it("创建并按 article_id 读取，支持 createAnnotation", async () => {
    const db = mockD1();
    await createArticle(db, { title: "A", content: "hi", publish_date: "2026-08-01" });

    const created = await createAnnotation(db, 1, {
      from_position: 0,
      to_position: 5,
      selected_text: "hello",
      color: "yellow",
      comment: "first note",
    });
    expect(created).not.toBeNull();
    expect(created!.article_id).toBe(1);
    expect(created!.from_position).toBe(0);
    expect(created!.to_position).toBe(5);
    expect(created!.selected_text).toBe("hello");
    expect(created!.color).toBe("yellow");
    expect(created!.comment).toBe("first note");

    await createAnnotation(db, 1, {
      from_position: 10,
      to_position: 15,
      selected_text: "world",
      color: "green",
      comment: null,
    });

    const list = await getArticleAnnotations(db, 1);
    expect(list.length).toBe(2);
    // 按 from_position, id 排序
    expect(list[0].from_position).toBe(0);
    expect(list[1].from_position).toBe(10);

    // 只返回该文章的标注
    await createArticle(db, { title: "B", content: "yo", publish_date: "2026-08-02" });
    await createAnnotation(db, 2, {
      from_position: 0,
      to_position: 3,
      selected_text: "yo",
      color: "blue",
      comment: null,
    });
    expect((await getArticleAnnotations(db, 1)).length).toBe(2);
    expect((await getArticleAnnotations(db, 2)).length).toBe(1);
  });

  it("updateAnnotation 局部更新字段", async () => {
    const db = mockD1();
    await createArticle(db, { title: "A", content: "hi", publish_date: "2026-08-01" });
    const created = await createAnnotation(db, 1, {
      from_position: 0,
      to_position: 5,
      selected_text: "hello",
      color: "yellow",
      comment: null,
    });
    const id = created!.id;

    const updated = await updateAnnotation(db, id, { comment: "edited" });
    expect(updated).not.toBeNull();
    expect(updated!.comment).toBe("edited");
    expect(updated!.selected_text).toBe("hello");
    expect(updated!.color).toBe("yellow");

    const updated2 = await updateAnnotation(db, id, {
      color: "pink",
      selected_text: "helloo",
      to_position: 6,
    });
    expect(updated2!.color).toBe("pink");
    expect(updated2!.selected_text).toBe("helloo");
    expect(updated2!.to_position).toBe(6);
    expect(updated2!.comment).toBe("edited");
  });

  it("updateAnnotation 对空更新不修改行", async () => {
    const db = mockD1();
    await createArticle(db, { title: "A", content: "hi", publish_date: "2026-08-01" });
    const created = await createAnnotation(db, 1, {
      from_position: 0,
      to_position: 5,
      selected_text: "hello",
      color: "yellow",
      comment: "c",
    });
    const result = await updateAnnotation(db, created!.id, {});
    expect(result).not.toBeNull();
    expect(result!.comment).toBe("c");
  });

  it("deleteAnnotation 删除指定标注", async () => {
    const db = mockD1();
    await createArticle(db, { title: "A", content: "hi", publish_date: "2026-08-01" });
    const a1 = await createAnnotation(db, 1, {
      from_position: 0,
      to_position: 5,
      selected_text: "hello",
      color: "yellow",
      comment: null,
    });
    await createAnnotation(db, 1, {
      from_position: 10,
      to_position: 15,
      selected_text: "world",
      color: "green",
      comment: null,
    });

    await deleteAnnotation(db, a1!.id);
    const list = await getArticleAnnotations(db, 1);
    expect(list.length).toBe(1);
    expect(list[0].selected_text).toBe("world");
  });
});

describe("article_notes upsert/read", () => {
  it("首次读取不存在时返回 null", async () => {
    const db = mockD1();
    await createArticle(db, { title: "A", content: "hi", publish_date: "2026-08-01" });
    const note = await getArticleNote(db, 1);
    expect(note).toBeNull();
  });

  it("upsertArticleNote 插入并在冲突时更新", async () => {
    const db = mockD1();
    await createArticle(db, { title: "A", content: "hi", publish_date: "2026-08-01" });

    const created = await upsertArticleNote(db, 1, "first content");
    expect(created).not.toBeNull();
    expect(created!.article_id).toBe(1);
    expect(created!.content).toBe("first content");

    const updated = await upsertArticleNote(db, 1, "second content");
    expect(updated).not.toBeNull();
    expect(updated!.content).toBe("second content");
    // 唯一约束：仍为同一行
    expect(updated!.id).toBe(created!.id);

    const read = await getArticleNote(db, 1);
    expect(read).not.toBeNull();
    expect(read!.content).toBe("second content");

    // 不同文章的笔记互不影响
    await createArticle(db, { title: "B", content: "yo", publish_date: "2026-08-02" });
    const other = await upsertArticleNote(db, 2, "note for B");
    expect(other!.article_id).toBe(2);
    expect(other!.content).toBe("note for B");
    expect((await getArticleNote(db, 1))!.content).toBe("second content");
  });
});