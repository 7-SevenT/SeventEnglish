import { useEffect, useMemo, useState } from "react";
import type { Article } from "../../../worker/src/db";
import { readArticleSource } from "../../lib/adminImport";
import { AdminDrawer } from "./AdminDrawer";

export type ArticleDraft = Pick<Article, "title" | "subtitle" | "publish_date" | "content">;

type Props = {
  open: boolean;
  mode: "create" | "edit";
  initialValue?: Partial<ArticleDraft>;
  onClose: () => void;
  onSave: (draft: ArticleDraft) => Promise<unknown>;
};

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function initialDraft(value?: Partial<ArticleDraft>): ArticleDraft {
  return {
    title: value?.title ?? "",
    subtitle: value?.subtitle ?? "",
    publish_date: value?.publish_date ?? today(),
    content: value?.content ?? "",
  };
}

export function ArticleEditorDrawer({ open, mode, initialValue, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<ArticleDraft>(() => initialDraft(initialValue));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ArticleDraft, string>>>({});

  useEffect(() => {
    if (!open) return;
    setDraft(initialDraft(initialValue));
    setDirty(false);
    setError("");
    setFieldErrors({});
  }, [open, initialValue]);

  const preview = useMemo(() => draft.content.trim(), [draft.content]);

  function update(field: keyof ArticleDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setDirty(true);
    setError("");
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      update("content", await readArticleSource(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "文件读取失败");
    }
  }

  async function save() {
    const nextErrors: Partial<Record<keyof ArticleDraft, string>> = {};
    if (!draft.title.trim()) nextErrors.title = "标题不能为空";
    if (!draft.publish_date) nextErrors.publish_date = "发布日期不能为空";
    if (!draft.content.trim()) nextErrors.content = "正文不能为空";
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ ...draft, title: draft.title.trim(), subtitle: (draft.subtitle ?? "").trim() || null, content: draft.content.trim() });
      setDirty(false);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminDrawer
      open={open}
      title={mode === "create" ? "新建文章" : "编辑文章"}
      description="保存后将自动进入 AI 分析队列"
      dirty={dirty && !saving}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>取消</button>
          <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={saving}>{saving ? "保存中…" : "保存并开始 AI 分析"}</button>
        </>
      )}
    >
      {error && <p className="alert alert--error">{error}</p>}
      <div className="admin-field">
        <label htmlFor="article-title">标题</label>
        <input id="article-title" className="input" value={draft.title} onChange={(event) => update("title", event.target.value)} />
        {fieldErrors.title && <p className="admin-field__error">{fieldErrors.title}</p>}
      </div>
      <div className="admin-field">
        <label htmlFor="article-subtitle">副标题 <span className="admin-field__hint">可选</span></label>
        <input id="article-subtitle" className="input" value={draft.subtitle ?? ""} onChange={(event) => update("subtitle", event.target.value)} placeholder="一句话说明文章内容，可为空" />
      </div>
      <div className="admin-field">
        <label htmlFor="article-date">发布日期</label>
        <input id="article-date" className="input" type="date" value={draft.publish_date} onChange={(event) => update("publish_date", event.target.value)} />
        {fieldErrors.publish_date && <p className="admin-field__error">{fieldErrors.publish_date}</p>}
      </div>
      <div className="admin-field">
        <label htmlFor="article-content">正文 <span className="admin-field__hint">Markdown / TXT</span></label>
        <textarea id="article-content" className="textarea" value={draft.content} onChange={(event) => update("content", event.target.value)} />
        {fieldErrors.content && <p className="admin-field__error">{fieldErrors.content}</p>}
      </div>
      <label className="admin-file-drop" htmlFor="article-source-file">
        <input id="article-source-file" aria-label="导入 Markdown 或 TXT" type="file" accept=".md,.markdown,.txt,text/plain" onChange={(event) => void handleFile(event.target.files?.[0])} />
        <span><strong>拖入 Markdown / TXT 文件</strong>或点击选择文件</span>
      </label>
      {preview && <div className="admin-field" style={{ marginTop: "16px" }}><span className="admin-eyebrow">内容预览</span><div className="admin-preview">{preview}</div></div>}
    </AdminDrawer>
  );
}
